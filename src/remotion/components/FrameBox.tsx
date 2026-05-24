import type { CSSProperties, ReactNode } from "react";
import type { Box } from "../../lib/edit-model";

export function FrameBox({
  box,
  style,
  children,
}: {
  box: Box;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
