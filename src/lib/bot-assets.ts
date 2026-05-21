export type BotFaceAsset = {
  id: string;
  label: string;
  modelMatchers: string[];
  src: string;
  previewUrl: string;
};

export const BOT_FACE_ASSETS: BotFaceAsset[] = [
  {
    id: "deepseek",
    label: "DeepSeek-Nex",
    modelMatchers: ["deepseek", "deepseek-nex"],
    src: "assets/bot-faces/deepseek.png",
    previewUrl: "/api/assets/bot-faces/deepseek.png",
  },
];

export function botFaceForSpeaker(speaker: string): BotFaceAsset | undefined {
  const normalized = speaker.toLowerCase();
  return BOT_FACE_ASSETS.find((asset) =>
    asset.modelMatchers.some((matcher) => normalized.includes(matcher)),
  );
}
