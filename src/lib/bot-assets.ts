import { MODEL_PERSONAS, personaForSpeaker } from "./model-personas";

export type BotFaceAsset = {
  id: string;
  label: string;
  modelMatchers: string[];
  src: string;
  previewUrl: string;
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
);

export function botFaceForSpeaker(speaker: string): BotFaceAsset | undefined {
  const persona = personaForSpeaker(speaker);
  if (!persona?.face) return undefined;
  return {
    id: persona.id,
    label: persona.label,
    modelMatchers: persona.matchers,
    src: persona.face.src,
    previewUrl: persona.face.previewUrl,
  };
}
