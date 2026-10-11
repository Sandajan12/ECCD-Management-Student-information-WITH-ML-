// Legacy MUI ButtonBase/TouchRipple: 550ms enter/exit, 80ms touch delay,
// currentColor at 0.3 opacity and a 2500ms keyboard-focus pulse.
import { useEffect, useRef, useState } from "react";
interface RippleState {
  id: number;
  x: number;
  y: number;
  size: number;
  leaving: boolean;
  pulse: boolean;
}
export default function LegacyRipple({ center = false }: { center?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ripples, setRipples] = useState<RippleState[]>([]);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    let id = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    };
    let touchTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingTouch: PointerEvent | undefined;
    const start = (event?: PointerEvent, pulse = false) => {
      const rect = host.getBoundingClientRect();
      const centered = center || !event || pulse;
      const x = centered
        ? Math.round(rect.width / 2)
        : Math.round(event.clientX - rect.left);
      const y = centered
        ? Math.round(rect.height / 2)
        : Math.round(event.clientY - rect.top);
      const size = centered
        ? Math.sqrt((2 * rect.width ** 2 + rect.height ** 2) / 3)
        : Math.hypot(
            Math.max(Math.abs(rect.width - x), x) * 2 + 2,
            Math.max(Math.abs(rect.height - y), y) * 2 + 2,
          );
      setRipples((rows) => [
        ...rows.filter((r) => !r.pulse),
        { id: ++id, x, y, size, leaving: false, pulse },
      ]);
    };
    const stop = (event?: Event) => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = undefined;
      }
      if (pendingTouch && event?.type === "pointerup") {
        start(pendingTouch);
        pendingTouch = undefined;
        later(() => stop(), 0);
        return;
      }
      pendingTouch = undefined;
      setRipples((rows) => rows.map((r) => ({ ...r, leaving: true })));
      const last = id;
      later(() => setRipples((rows) => rows.filter((r) => r.id > last)), 550);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        if (pendingTouch) return;
        pendingTouch = event;
        touchTimer = later(() => {
          pendingTouch = undefined;
          touchTimer = undefined;
          start(event);
        }, 80);
      } else start(event);
    };
    const focus = (event: FocusEvent) => {
      if ((event.target as HTMLElement).matches(":focus-visible"))
        start(undefined, true);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === " " && !event.repeat) start();
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", stop);
    host.addEventListener("pointercancel", stop);
    host.addEventListener("pointerleave", stop);
    host.addEventListener("focusin", focus);
    host.addEventListener("focusout", stop);
    host.addEventListener("keydown", keyboard);
    host.addEventListener("keyup", stop);
    return () => {
      timers.forEach(clearTimeout);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", stop);
      host.removeEventListener("pointercancel", stop);
      host.removeEventListener("pointerleave", stop);
      host.removeEventListener("focusin", focus);
      host.removeEventListener("focusout", stop);
      host.removeEventListener("keydown", keyboard);
      host.removeEventListener("keyup", stop);
    };
  }, [center]);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className={
            r.pulse
              ? "legacy-ripple-enter legacy-ripple-focus"
              : "legacy-ripple-enter"
          }
          style={{
            width: r.size,
            height: r.size,
            left: r.x - r.size / 2,
            top: r.y - r.size / 2,
          }}
        >
          <span
            className={`block size-full rounded-full bg-current ${r.leaving ? "legacy-ripple-exit" : r.pulse ? "legacy-ripple-pulse" : ""}`}
          />
        </span>
      ))}
    </span>
  );
}
