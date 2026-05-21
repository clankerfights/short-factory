import type { EditRecipeVariant } from "../lib/types";
import type { BaseRecordingTiming } from "../lib/edit-model";

export type RemotionFactoryProps = {
  baseVideoSrc: string;
  baseVideoTiming?: BaseRecordingTiming;
  variant: EditRecipeVariant;
};
