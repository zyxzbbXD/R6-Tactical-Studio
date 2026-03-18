import { useCallback, useRef, useState } from "react";

/**
 * 60fps drag-to-resize hook.
 *
 * direction "left"  → handle on the RIGHT edge of the panel; clientX == panel width.
 * direction "right" → handle on the LEFT edge; panel width == window.innerWidth - clientX.
 *
 * Returns [width, startResizing, setWidth, isResizing]
 * - setWidth    : programmatic reset (e.g. "Reset workspace")
 * - isResizing  : true while the user is dragging — use to suppress CSS transitions
 *                 and disable pointer events on heavy content areas
 */
export function useResizable(
  initialWidth: number,
  minWidth: number,
  maxWidth: number,
  direction: "left" | "right",
): [number, (e: React.MouseEvent) => void, (w: number) => void, boolean] {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Tracks whether a drag is in progress (ref avoids stale closure inside listeners)
  const activeRef = useRef(false);
  // rAF handle — we cancel any pending frame before queuing a new one
  const rafRef    = useRef<number>(0);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      activeRef.current = true;
      setIsResizing(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!activeRef.current) return;

        // Throttle to one state update per animation frame
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const raw        = direction === "left" ? ev.clientX : window.innerWidth - ev.clientX;
          const dynamicMax = Math.min(maxWidth, window.innerWidth / 3);
          setWidth(Math.min(dynamicMax, Math.max(minWidth, raw)));
        });
      };

      const onMouseUp = () => {
        activeRef.current = false;
        setIsResizing(false);

        // Discard any pending rAF — no more updates after release
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor     = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor     = "col-resize";
      document.body.style.userSelect = "none";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, minWidth, maxWidth],
  );

  return [width, startResizing, setWidth, isResizing];
}
