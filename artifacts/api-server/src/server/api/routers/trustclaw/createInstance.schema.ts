import { z } from "zod";

export const OPENCODE_MODEL_ID = "minimax-m2.5-free";

export const ALLOWED_ANTHROPIC_MODELS = [OPENCODE_MODEL_ID] as const;

export const allowedAnthropicModelSchema = z.enum(ALLOWED_ANTHROPIC_MODELS).default(OPENCODE_MODEL_ID);

export const createInstanceInput = z.object({
  anthropicModel: allowedAnthropicModelSchema,
});

export type CreateInstanceInput = z.infer<typeof createInstanceInput>;
