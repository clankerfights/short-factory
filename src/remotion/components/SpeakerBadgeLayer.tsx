import type { SpeakerBadgeLayer as SpeakerBadgeLayerModel } from "../../lib/edit-model";
import { FrameBox } from "./FrameBox";

export function SpeakerBadgeLayer({ layer }: { layer: SpeakerBadgeLayerModel }) {
  return (
    <FrameBox
      box={layer.box}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          width: 148,
          height: 148,
          borderRadius: 74,
          background: `radial-gradient(circle at 35% 28%, white, ${layer.accentColor} 42%, #111 74%)`,
          border: "7px solid white",
          color: "#060606",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 950,
          fontSize: 64,
          boxShadow: `0 0 36px ${layer.accentColor}`,
          flexShrink: 0,
        }}
      >
        {layer.speaker.slice(0, 1)}
      </div>
      <div>
        <div
          style={{
            color: "white",
            fontSize: 46,
            fontWeight: 950,
            textShadow: "0 6px 20px rgba(0,0,0,0.72)",
          }}
        >
          {layer.speaker}
        </div>
        <div
          style={{
            color: layer.accentColor,
            fontSize: 28,
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          {layer.expression}
        </div>
      </div>
    </FrameBox>
  );
}
