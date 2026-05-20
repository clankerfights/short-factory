import { z } from "zod";

export const createJobRequestSchema = z.object({
  clipUrl: z.string().min(1, "Paste a clip URL or clip ID."),
  toneHint: z.string().trim().optional(),
});

export const recordJobRequestSchema = z.object({
  durationSeconds: z.number().min(5).max(90).optional(),
});

export const renderJobRequestSchema = z.object({
  variantId: z.string().min(1).default("v1"),
});
