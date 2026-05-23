export type TemplateChatMessageTiming = {
  id: number;
  timeStart: number;
  timeEnd: number;
};

export type ChatCueTimingConfig = {
  gameplayStartSettleFrames: number;
  highlightedReadSettleFrames: number;
};

export function defaultChatCueTiming(fps: number): ChatCueTimingConfig {
  return {
    gameplayStartSettleFrames: 0,
    highlightedReadSettleFrames: Math.round(fps * 1),
  };
}

export function chatGameplayStartFrame(args: {
  message: TemplateChatMessageTiming;
  fps: number;
  sourceDurationFrames: number;
  timing?: Partial<ChatCueTimingConfig>;
}): number {
  const timing = { ...defaultChatCueTiming(args.fps), ...args.timing };
  return messageCueFrame({
    message: args.message,
    fps: args.fps,
    sourceDurationFrames: args.sourceDurationFrames,
    settleFrames: timing.gameplayStartSettleFrames,
  });
}

export function highlightedChatReadFrame(args: {
  message: TemplateChatMessageTiming;
  firstChatMessage?: TemplateChatMessageTiming;
  firstChatFrame: number;
  fps: number;
  sourceDurationFrames: number;
  timing?: Partial<ChatCueTimingConfig>;
}): number {
  if (args.firstChatMessage && args.firstChatMessage.id === args.message.id) {
    return args.firstChatFrame;
  }

  const timing = { ...defaultChatCueTiming(args.fps), ...args.timing };
  return messageCueFrame({
    message: args.message,
    fps: args.fps,
    sourceDurationFrames: args.sourceDurationFrames,
    settleFrames: timing.highlightedReadSettleFrames,
  });
}

function messageCueFrame(args: {
  message: TemplateChatMessageTiming;
  fps: number;
  sourceDurationFrames: number;
  settleFrames: number;
}): number {
  const startFrame = Math.round(args.message.timeStart * args.fps);
  return clampFrame(startFrame + args.settleFrames, args.sourceDurationFrames);
}

function clampFrame(frame: number, duration: number): number {
  return Math.max(0, Math.min(duration - 1, Math.round(frame)));
}
