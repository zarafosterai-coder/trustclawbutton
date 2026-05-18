import { Router, type Request, type Response } from "express";
import { smoothStream, UI_MESSAGE_STREAM_HEADERS } from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import {
  setStreamingMessage,
  getStreamingMessage,
} from "~/server/clients/redis";
import { getStreamContext } from "./stream-store";

const router = Router();

const chatRequestBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().optional(),
      parts: z.array(z.record(z.unknown())).optional(),
    }),
  ),
});

async function getAuthenticatedInstance(req: Request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    }
  }
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const userId = session.user.id;
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { id: true, userId: true },
  });

  if (!instance) return null;

  return { userId, instanceId: instance.id };
}

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const authResult = await getAuthenticatedInstance(req);
    if (!authResult) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { instanceId } = authResult;

    const body = chatRequestBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const lastUserMessage = [...body.data.messages]
      .reverse()
      .find((m) => m.role === "user");
    const userText =
      lastUserMessage?.parts
        ?.filter(
          (p): p is { type: string; text: string } =>
            typeof p === "object" &&
            p !== null &&
            "type" in p &&
            p.type === "text" &&
            "text" in p &&
            typeof p.text === "string",
        )
        .map((p) => p.text)
        .join("\n") ?? "";

    if (!userText.trim()) {
      res.status(400).json({ error: "Empty message" });
      return;
    }

    const prepareResult = await prepareAgentRun({
      instanceId,
      userMessage: userText,
      source: "web",
    });

    const { agent, messages } = prepareResult.result;

    const streamId = crypto.randomUUID();
    await setStreamingMessage(instanceId, streamId);

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const result = await agent.stream({
      prompt: messages,
      experimental_transform: smoothStream(),
      abortSignal: abortController.signal,
    });

    const streamContext = getStreamContext();

    const webResponse = result.toUIMessageStreamResponse({
      headers: {
        "X-Stream-Id": streamId,
      },
      ...(streamContext
        ? {
            consumeSseStream: ({ stream }) => {
              void streamContext.createNewResumableStream(
                streamId,
                () => stream,
              );
            },
          }
        : {}),
    });

    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            res.write(value);
          }
        } catch {
          res.end();
        }
      };
      void pump();
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[chat POST] error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/chat", async (req: Request, res: Response) => {
  try {
    const authResult = await getAuthenticatedInstance(req);
    if (!authResult) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { instanceId } = authResult;
    const streamId = req.query["streamId"] as string | undefined;

    if (!streamId) {
      res.status(400).json({ error: "Missing streamId" });
      return;
    }

    const activeStreamId = await getStreamingMessage(instanceId);
    if (activeStreamId !== streamId) {
      res.status(404).json({ error: "Stream not found or not yours" });
      return;
    }

    const streamContext = getStreamContext();
    if (!streamContext) {
      res.status(404).json({ error: "Stream not available" });
      return;
    }

    const stream = await streamContext.resumeExistingStream(streamId);
    if (!stream) {
      res.status(410).json({ error: "Stream expired" });
      return;
    }

    for (const [key, value] of Object.entries(UI_MESSAGE_STREAM_HEADERS)) {
      res.setHeader(key, value);
    }

    const reader = stream.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(value instanceof Uint8Array ? value : Buffer.from(value as string));
        }
      } catch {
        res.end();
      }
    };
    void pump();
  } catch (err) {
    console.error("[chat GET] error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;
