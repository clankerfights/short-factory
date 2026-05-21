export type BotFaceAsset = {
  id: string;
  label: string;
  modelMatchers: string[];
  src: string;
  previewUrl: string;
};

export const BOT_FACE_ASSETS: BotFaceAsset[] = [
  {
    id: "mimo",
    label: "Mimo-Flash",
    modelMatchers: ["mimo", "mimo-flash"],
    src: "assets/bot-faces/mimo.png",
    previewUrl: "/api/assets/bot-faces/mimo.png",
  },
  {
    id: "minimax",
    label: "MiniMax",
    modelMatchers: ["minimax", "mini-max"],
    src: "assets/bot-faces/minimax.png",
    previewUrl: "/api/assets/bot-faces/minimax.png",
  },
  {
    id: "qwen",
    label: "Qwen-Duchess",
    modelMatchers: ["qwen", "qwen-duchess"],
    src: "assets/bot-faces/qwen.png",
    previewUrl: "/api/assets/bot-faces/qwen.png",
  },
  {
    id: "deepseek",
    label: "DeepSeek-Nex",
    modelMatchers: ["deepseek", "deepseek-nex"],
    src: "assets/bot-faces/deepseek.png",
    previewUrl: "/api/assets/bot-faces/deepseek.png",
  },
  {
    id: "gemini",
    label: "Gemini-Wisp",
    modelMatchers: ["gemini", "gemini-wisp"],
    src: "assets/bot-faces/gemini.png",
    previewUrl: "/api/assets/bot-faces/gemini.png",
  },
  {
    id: "ling",
    label: "Ling-Flash",
    modelMatchers: ["ling", "ling-flash"],
    src: "assets/bot-faces/ling.png",
    previewUrl: "/api/assets/bot-faces/ling.png",
  },
  {
    id: "ring",
    label: "Ring",
    modelMatchers: ["ring"],
    src: "assets/bot-faces/ring.png",
    previewUrl: "/api/assets/bot-faces/ring.png",
  },
];

export function botFaceForSpeaker(speaker: string): BotFaceAsset | undefined {
  const normalized = speaker.toLowerCase();
  return BOT_FACE_ASSETS.find((asset) =>
    asset.modelMatchers.some((matcher) => normalized.includes(matcher)),
  );
}
