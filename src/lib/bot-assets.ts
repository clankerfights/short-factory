import { MODEL_PERSONAS, personaForSpeaker } from "./model-personas";

export type BotFaceAsset = {
  id: string;
  label: string;
  modelMatchers: string[];
  src: string;
  previewUrl: string;
};

export const SPECTATOR_FACE_ASSET: BotFaceAsset = {
  id: "human",
  label: "Spectator",
  modelMatchers: ["spectator", "human", "user"],
  src: "assets/bot-faces/human.png",
  previewUrl: "/api/assets/bot-faces/human.png",
};

export const BOT_FACE_ASSETS: BotFaceAsset[] = MODEL_PERSONAS.flatMap((persona) =>
  persona.face
    ? [
        {
          id: persona.id,
          label: persona.label,
          modelMatchers: persona.matchers,
          src: persona.face.src,
          previewUrl: persona.face.previewUrl,
        },
      ]
    : [],
).concat(SPECTATOR_FACE_ASSET);

export function botFaceForSpeaker(speaker: string): BotFaceAsset | undefined {
  const persona = personaForSpeaker(speaker);
  if (!persona) return SPECTATOR_FACE_ASSET;
  if (!persona.face) return undefined;
  return {
    id: persona.id,
    label: persona.label,
    modelMatchers: persona.matchers,
    src: persona.face.src,
    previewUrl: persona.face.previewUrl,
  };
}
