import type { ClipCapturePlan } from "./edit-model";

export const TIKTOK_OUTPUT_SIZE = {
  width: 1080,
  height: 1920,
} as const;

export const PHONE_CAPTURE_VIEWPORT = {
  width: 540,
  height: 960,
} as const;

export const DEFAULT_REPLAY_LAYOUT_WIDTH = PHONE_CAPTURE_VIEWPORT.width;
export const DEFAULT_CHAT_HEIGHT_PCT = 40;
export const DEFAULT_REPLAY_PLAYBACK_RATE = 2;

export function createPhoneReplayCapturePlan(
  layoutWidth: number = DEFAULT_REPLAY_LAYOUT_WIDTH,
): ClipCapturePlan {
  return {
    id: "phone-fit-replay-v1",
    outputSize: TIKTOK_OUTPUT_SIZE,
    viewport: PHONE_CAPTURE_VIEWPORT,
    sourceLayout: {
      width: layoutWidth,
      heightMode: "viewport",
      scaleToViewportWidth: true,
    },
    replay: {
      autoplay: true,
      playbackRate: DEFAULT_REPLAY_PLAYBACK_RATE,
      waitForReadySignal: true,
      readinessGlobal: "window.clankerClip.ready()",
      playbackApiGlobal: "window.clankerClip",
      preferredPlaySelector: '[data-factory-play="true"]',
    },
    chrome: {
      hideOverflow: true,
      hidePointerCursor: true,
      pageBackground: "#05070a",
    },
  };
}

export function captureScale(plan: ClipCapturePlan): number {
  if (!plan.sourceLayout.scaleToViewportWidth) return 1;
  return Math.min(1, plan.viewport.width / plan.sourceLayout.width);
}

export function capturePlanStyle(plan: ClipCapturePlan): string {
  const scale = captureScale(plan);
  const overflow = plan.chrome.hideOverflow ? "hidden" : "auto";
  const cursor = plan.chrome.hidePointerCursor ? "none" : "auto";

  return `
    html,
    body {
      width: ${plan.viewport.width}px !important;
      height: 100vh !important;
      margin: 0 !important;
      overflow: ${overflow} !important;
      background: ${plan.chrome.pageBackground} !important;
      cursor: ${cursor} !important;
    }

    body > * {
      transform: scale(${scale});
      transform-origin: top left;
      width: ${plan.sourceLayout.width}px !important;
      min-width: ${plan.sourceLayout.width}px !important;
    }
  `;
}
