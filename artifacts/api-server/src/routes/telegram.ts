import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { sendTelegramMessage, sendChatAction } from "~/server/clients/telegram";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import {
  claimTelegramUpdate,
  setTelegramActive,
  getTelegramActive,
} from "~/server/clients/redis";

const router = Router();

const telegramUpdateInput = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      from: z
        .object({
          id: z.number(),
          first_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
      chat: z.object({
        id: z.number(),
        type: z.string(),
      }),
      text: z.string().optional(),
    })
    .optional(),
});

router.post("/telegram-webhook", async (req: Request, res: Response) => {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(404).json({ error: "Not configured" });
    return;
  }

  const secret = req.headers["x-telegram-bot-api-secret-token"];
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (
    typeof secret !== "string" ||
    secret.length !== expected.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = telegramUpdateInput.safeParse(req.body);
  if (!parsed.success) {
    res.json({ ok: true });
    return;
  }

  const update = parsed.data;
  res.json({ ok: true });

  if (!update.message?.text || !update.message.chat) return;

  const chatId = String(update.message.chat.id);
  const text = update.message.text;
  const updateId = update.update_id;

  setImmediate(async () => {
    try {
      const claimed = await claimTelegramUpdate(updateId);
      if (!claimed) return;

      if (text.startsWith("/start ")) {
        const token = text.slice("/start ".length).trim();
        const now = new Date();

        const instance = await db.composioClawInstance.findFirst({
          where: {
            telegramLinkToken: token,
            telegramLinkTokenExpiresAt: { gt: now },
          },
          select: { id: true, telegramChatId: true },
        });

        if (!instance) {
          await sendTelegramMessage(chatId, "This link has expired or is invalid. Please generate a new one from the dashboard.");
          return;
        }

        if (instance.telegramChatId) {
          await sendTelegramMessage(chatId, "Telegram is already linked to this account.");
          return;
        }

        await db.composioClawInstance.update({
          where: { id: instance.id },
          data: {
            telegramChatId: chatId,
            telegramLinkToken: null,
            telegramLinkTokenExpiresAt: null,
          },
        });

        await sendTelegramMessage(chatId, "✅ Your TrustClaw account is now linked! You can send messages here and I'll respond.");
        return;
      }

      const instance = await db.composioClawInstance.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true },
      });

      if (!instance) {
        await sendTelegramMessage(chatId, "Your Telegram account isn't linked to TrustClaw yet. Visit the dashboard to link it.");
        return;
      }

      const instanceId = instance.id;

      await setTelegramActive(instanceId, updateId);
      await sendChatAction(chatId, "typing");

      const prepareResult = await prepareAgentRun({
        instanceId,
        userMessage: text,
        source: "telegram",
      });

      const { agent, messages } = prepareResult.result;

      const abortController = new AbortController();
      const checkInterval = setInterval(async () => {
        const activeId = await getTelegramActive(instanceId);
        if (activeId !== updateId) {
          abortController.abort();
          clearInterval(checkInterval);
        }
      }, 5000);

      try {
        const result = await agent.stream({
          prompt: messages,
          abortSignal: abortController.signal,
        });

        let fullText = "";
        for await (const chunk of result) {
          if ("type" in chunk) {
            const anyChunk = chunk as { type: string; text?: string };
            if (anyChunk.type === "text-delta" && anyChunk.text) {
              fullText += anyChunk.text;
            }
          }
        }

        const cleanedText = stripToolResultEchoes(fullText).trim();
        const activeId = await getTelegramActive(instanceId);
        if (activeId === updateId && cleanedText) {
          await sendTelegramMessage(chatId, cleanedText);
        }
      } finally {
        clearInterval(checkInterval);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("[telegram-webhook] error:", err);
      try {
        await sendTelegramMessage(chatId, "Sorry, something went wrong. Please try again.");
      } catch {}
    }
  });
});

export default router;
