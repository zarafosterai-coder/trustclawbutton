import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { computeNextRunSafe } from "~/server/api/routers/trustclaw/agent/tools/cron-utils";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import { sendTelegramMessage } from "~/server/clients/telegram";
import { toPlainRecordSafe } from "~/server/api/routers/trustclaw/agent/context/build-context";

const router = Router();

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const claimedJobRow = z.object({
  id: z.string(),
  instanceId: z.string(),
});

const staleJobRow = z.object({
  id: z.string(),
  expression: z.string(),
  timezone: z.string(),
});

const cronJobRow = z.object({
  id: z.string(),
  instanceId: z.string(),
  expression: z.string(),
  prompt: z.string(),
  timezone: z.string(),
  lockedBy: z.string().nullable(),
  telegramChatId: z.string().nullable(),
});

type CronJobRow = z.infer<typeof cronJobRow>;

const executeJobInput = z.object({
  jobIds: z.array(z.string()),
  invocationId: z.string(),
  nowOverride: z.string().optional(),
});

function authMiddleware(req: Request, res: Response): boolean {
  if (env.NODE_ENV === "development") return true;
  if (typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length === 0) {
    res.status(503).json({ error: "Server misconfigured: CRON_SECRET missing" });
    return false;
  }
  const auth = req.headers["authorization"] ?? "";
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

router.get("/cron/trustclaw", async (req: Request, res: Response) => {
  if (!authMiddleware(req, res)) return;

  const now = new Date();
  const invocationId = crypto.randomUUID();
  const lockTimeout = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  try {
    const claimedJobs = z.array(claimedJobRow).parse(
      await db.$queryRaw`
        UPDATE composio_claw_cron_job cj
        SET
          "lockedAt" = ${now},
          "lockedBy" = ${invocationId},
          "nextRunAt" = NULL
        FROM composio_claw_instance ci
        WHERE cj."instanceId" = ci.id
          AND cj.enabled = true
          AND (
            (cj."nextRunAt" <= ${now} AND cj."lockedAt" IS NULL)
            OR (cj."lockedAt" IS NOT NULL AND cj."lockedAt" < ${lockTimeout})
          )
        RETURNING cj.id, cj."instanceId"
      `,
    );

    const staleJobs = z.array(staleJobRow).parse(
      await db.$queryRaw`
        SELECT id, expression, timezone
        FROM composio_claw_cron_job
        WHERE "nextRunAt" <= ${now}
          AND "lockedAt" IS NULL
          AND enabled = false
      `,
    );

    if (staleJobs.length > 0) {
      for (const job of staleJobs) {
        const nextRunAt = computeNextRunSafe(job.expression, job.timezone);
        if (nextRunAt) {
          await db.$queryRaw`
            UPDATE composio_claw_cron_job
            SET "nextRunAt" = ${nextRunAt}
            WHERE id = ${job.id}
          `;
        }
      }
    }

    if (claimedJobs.length === 0) {
      res.json({ dispatched: 0, results: [], now: now.toISOString() });
      return;
    }

    const jobsByInstance = new Map<string, string[]>();
    for (const job of claimedJobs) {
      const existing = jobsByInstance.get(job.instanceId);
      if (existing) {
        existing.push(job.id);
      } else {
        jobsByInstance.set(job.instanceId, [job.id]);
      }
    }

    const executeUrl = `http://localhost:${process.env.PORT ?? "8080"}/api/cron/trustclaw/execute`;
    const entries = Array.from(jobsByInstance.entries());

    const results = await Promise.allSettled(
      entries.map(([, jobIds]) =>
        fetch(executeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.CRON_SECRET}`,
          },
          body: JSON.stringify({ jobIds, invocationId, nowOverride: now.toISOString() }),
        }),
      ),
    );

    const dispatched = results.map((result, i) => ({
      instanceId: entries[i]![0],
      jobIds: entries[i]![1],
      status: result.status === "fulfilled" && result.value.ok ? "dispatched" : "dispatch_failed",
    }));

    res.json({
      dispatched: claimedJobs.length,
      instances: entries.length,
      results: dispatched,
      now: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function loadJobsFromDb(jobIds: string[]): Promise<CronJobRow[]> {
  const result = await db.$queryRaw`
    SELECT
      cj.id,
      cj."instanceId",
      cj.expression,
      cj.prompt,
      cj.timezone,
      cj."lockedBy",
      ci."telegramChatId"
    FROM composio_claw_cron_job cj
    JOIN composio_claw_instance ci ON cj."instanceId" = ci.id
    WHERE cj.id = ANY(${jobIds}::text[])
  `;
  return z.array(cronJobRow).parse(result);
}

async function releaseJobLocks(
  jobs: CronJobRow[],
  invocationId: string,
  now: Date,
  error?: string,
) {
  for (const job of jobs) {
    const nextRunAt = computeNextRunSafe(job.expression, job.timezone);
    await db.$queryRaw`
      UPDATE composio_claw_cron_job
      SET
        "lastRunAt" = CASE WHEN ${error ?? null}::text IS NULL THEN ${now}::timestamptz ELSE "lastRunAt" END,
        "nextRunAt" = ${nextRunAt ?? null}::timestamptz,
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = ${error ?? null}
      WHERE id = ${job.id}
        AND "lockedBy" = ${invocationId}
    `;
  }
}

router.post("/cron/trustclaw/execute", async (req: Request, res: Response) => {
  if (!authMiddleware(req, res)) return;

  const parsed = executeJobInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { jobIds, invocationId, nowOverride } = parsed.data;
  const now = nowOverride ? new Date(nowOverride) : new Date();

  res.json({ accepted: true, jobCount: jobIds.length });

  setImmediate(async () => {
    let jobs: CronJobRow[] = [];
    try {
      jobs = await loadJobsFromDb(jobIds);
      if (jobs.length === 0) return;

      const instanceId = jobs[0]!.instanceId;
      const telegramChatId = jobs[0]!.telegramChatId;

      const combinedMessage = jobs
        .map((j) => `<scheduled-task>\n${j.prompt}\n</scheduled-task>`)
        .join("\n\n");

      const prepareResult = await prepareAgentRun({
        instanceId,
        userMessage: combinedMessage,
        source: "cron",
        userMessageType: "hidden",
      });

      const { agent, messages } = prepareResult.result;

      const result = await agent.stream({
        prompt: messages,
      });

      let fullText = "";
      const toolSummaries: string[] = [];

      for await (const step of result) {
        if ("type" in step) {
          const anyStep = step as { type: string; text?: string; toolName?: string };
          if (anyStep.type === "text-delta" && anyStep.text) {
            fullText += anyStep.text;
          } else if (anyStep.type === "tool-call" && anyStep.toolName) {
            toolSummaries.push(`Used ${anyStep.toolName}`);
          }
        }
      }

      const cleanedText = stripToolResultEchoes(fullText).trim();

      if (telegramChatId && cleanedText) {
        try {
          await sendTelegramMessage(telegramChatId, cleanedText);
        } catch (err) {
          console.error("[cron/execute] telegram send failed:", err);
        }
      }

      await releaseJobLocks(jobs, invocationId, now);
    } catch (err) {
      console.error("[cron/execute] error:", err);
      if (jobs.length > 0) {
        await releaseJobLocks(
          jobs,
          invocationId,
          now,
          err instanceof Error ? err.message : "Unknown error",
        ).catch(console.error);
      }
    }
  });
});

export default router;
