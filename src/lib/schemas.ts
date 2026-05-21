import { z } from "zod";

export const createJobRequestSchema = z.object({
  clipUrl: z.string().min(1, "Paste a clip URL or clip ID."),
  hookText: z.string().trim().optional(),
  finalMessageTone: z.string().trim().optional(),
  templateId: z.string().trim().optional(),
  toneHint: z.string().trim().optional(),
});

export const recordJobRequestSchema = z.object({
  durationSeconds: z.number().min(5).max(90).optional(),
});

export const renderJobRequestSchema = z.object({
  variantId: z.string().min(1).default("v1"),
});

const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

const boxSchema = sizeSchema.extend({
  x: z.number(),
  y: z.number(),
});

const timeRangeSchema = z.object({
  start: z.number().int().min(0),
  duration: z.number().int().min(1),
});

const baseLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  time: timeRangeSchema,
  box: boxSchema.optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  zIndex: z.number().int().optional(),
});

const textStyleSchema = z.object({
  fontSize: z.number().positive(),
  lineHeight: z.number().positive(),
  weight: z.number().positive(),
  color: z.string().min(1),
  accentColor: z.string().optional(),
  background: z.string().optional(),
  borderColor: z.string().optional(),
  borderLeftColor: z.string().optional(),
  textTransform: z.enum(["uppercase", "none"]).optional(),
  shadow: z.boolean().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});

const ttsSettingsSchema = z.object({
  voice: z.string().optional(),
  instructions: z.string().optional(),
  volume: z.number().min(0).max(2).optional(),
});

const layerSchema = z.discriminatedUnion("kind", [
  baseLayerSchema.extend({
    kind: z.literal("video-source"),
    source: z.literal("base-recording"),
    box: boxSchema,
    fit: z.enum(["cover", "contain", "fill"]),
    transform: z
      .object({
        scale: z.number().optional(),
        opacity: z.number().optional(),
        rotateDeg: z.number().optional(),
      })
      .optional(),
    animation: z
      .object({
        scale: z
          .object({
            from: z.number(),
            to: z.number(),
            easing: z.enum(["linear", "easeOut", "easeInOut"]).optional(),
          })
          .optional(),
      })
      .optional(),
    filters: z
      .object({
        contrast: z.number().optional(),
        saturate: z.number().optional(),
        blurPx: z.number().optional(),
        opacity: z.number().optional(),
      })
      .optional(),
  }),
  baseLayerSchema.extend({
    kind: z.literal("text"),
    text: z.string(),
    box: boxSchema,
    style: textStyleSchema,
    emphasis: z
      .object({
        phrase: z.string(),
        color: z.string(),
      })
      .optional(),
    tts: ttsSettingsSchema.optional(),
    animation: z
      .object({
        enterFromY: z.number().optional(),
        punchInFrame: z.number().int().optional(),
      })
      .optional(),
  }),
  baseLayerSchema.extend({
    kind: z.literal("speaker-badge"),
    speaker: z.string(),
    expression: z.enum(["neutral", "intense", "confused", "smug"]),
    box: boxSchema,
    accentColor: z.string(),
  }),
  baseLayerSchema.extend({
    kind: z.literal("image"),
    src: z.string().min(1),
    box: boxSchema,
    fit: z.enum(["cover", "contain", "fill"]),
    flipX: z.boolean().optional(),
    opacity: z.number().optional(),
    transform: z
      .object({
        scale: z.number().optional(),
        opacity: z.number().optional(),
        rotateDeg: z.number().optional(),
      })
      .optional(),
  }),
  baseLayerSchema.extend({
    kind: z.literal("shape"),
    shape: z.enum(["rect", "ellipse", "line", "arrow"]),
    box: boxSchema,
    style: z.object({
      fill: z.string(),
      stroke: z.string().optional(),
      strokeWidth: z.number().optional(),
      radius: z.number().optional(),
      opacity: z.number().optional(),
    }),
  }),
  baseLayerSchema.extend({
    kind: z.literal("zoom"),
    box: boxSchema,
    easing: z.enum(["linear", "easeOut", "easeInOut"]).optional(),
  }),
  baseLayerSchema.extend({
    kind: z.literal("callout"),
    text: z.string(),
    box: boxSchema,
    style: textStyleSchema.extend({
      arrow: z.enum(["none", "up", "down", "left", "right"]).optional(),
    }),
    tts: ttsSettingsSchema.optional(),
  }),
  baseLayerSchema.extend({
    kind: z.literal("audio-file"),
    src: z.string().min(1),
    volume: z.number().min(0).max(2),
  }),
  baseLayerSchema.extend({
    kind: z.literal("tts"),
    text: z.string(),
    speaker: z.string().optional(),
    voice: z.string().min(1),
    instructions: z.string().optional(),
    artifactPath: z.string().optional(),
    src: z.string().optional(),
    volume: z.number().min(0).max(2),
  }),
  baseLayerSchema.extend({
    kind: z.literal("cta"),
    text: z.string(),
    box: boxSchema,
    style: z.object({
      background: z.string(),
      color: z.string(),
      fontSize: z.number().positive(),
      weight: z.number().positive(),
    }),
    tts: ttsSettingsSchema.optional(),
  }),
]);

export const editCompositionSchema = z.object({
  templateId: z.string().optional(),
  templateName: z.string().optional(),
  templateVersion: z.number().int().positive().optional(),
  canvas: sizeSchema.extend({
    fps: z.number().positive(),
    durationFrames: z.number().int().positive(),
    background: z.string().min(1),
  }),
  timelineEdits: z
    .object({
      trim: z
        .object({
          startFrame: z.number().int().min(0),
          endFrame: z.number().int().min(1),
        })
        .optional(),
      freezes: z
        .array(
          z.object({
            id: z.string().min(1),
            atFrame: z.number().int().min(0),
            durationFrames: z.number().int().min(1),
          }),
        )
        .optional(),
    })
    .optional(),
  layers: z.array(layerSchema),
});

export const updateCompositionRequestSchema = z.object({
  variantId: z.string().min(1).default("v1"),
  composition: editCompositionSchema,
});

export const createTemplateRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  composition: editCompositionSchema,
  thumbnailPath: z.string().optional(),
});

export const updateTemplateRequestSchema = createTemplateRequestSchema.partial();

export const ttsRequestSchema = z.object({
  variantId: z.string().min(1).default("v1"),
  layerId: z.string().min(1),
  text: z.string().min(1),
  speaker: z.string().optional(),
  voice: z.string().optional(),
  instructions: z.string().optional(),
  start: z.number().int().min(0).optional(),
  duration: z.number().int().min(1).optional(),
  volume: z.number().min(0).max(2).default(1),
});
