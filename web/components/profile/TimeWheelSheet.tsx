"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ALERT_STEP } from "@/lib/alertMeals";

const ROW = 40; // px per wheel row
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 / ALERT_STEP }, (_, i) => i * ALERT_STEP);
const HALVES = ["AM", "PM"];

/**
 * One scrolling column of an iPhone-style time picker: the row in the middle band is the picked one. Scrolls with a
 * finger or the mouse wheel, snaps to rows, and works from the keyboard (arrow keys move one row).
 */
function Wheel({ label, values, index, onChange }: { label: string; values: string[]; index: number; onChange: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Start on the picked row, without animating.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ROW;
    // Only on open: later changes come from the scroll itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (i: number) => {
    const clamped = Math.max(0, Math.min(values.length - 1, i));
    ref.current?.scrollTo({ top: clamped * ROW, behavior: "smooth" });
    onChange(clamped);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${label}-${index}`}
      tabIndex={0}
      onScroll={() => {
        clearTimeout(settle.current);
        settle.current = setTimeout(() => ref.current && onChange(Math.round(ref.current.scrollTop / ROW)), 80);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          pick(index + (e.key === "ArrowDown" ? 1 : -1));
        }
      }}
      className="relative z-10 h-[200px] w-20 snap-y snap-mandatory overflow-y-scroll rounded-lg outline-none [mask-image:linear-gradient(transparent,#000_35%,#000_65%,transparent)] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-scrollbar]:hidden"
    >
      <div aria-hidden className="h-20" />
      {values.map((v, i) => (
        <div
          key={v}
          id={`${label}-${i}`}
          role="option"
          aria-selected={i === index}
          onClick={() => pick(i)}
          className="flex h-10 snap-center items-center justify-center text-[22px] tabular-nums"
        >
          {v}
        </div>
      ))}
      <div aria-hidden className="h-20" />
    </div>
  );
}

/**
 * The sheet that slides up to pick an alert time: hour, minute (in 15-minute steps, how often alerts go out) and AM/PM
 * wheels, like an iPhone's clock. `describe` says what the time being picked does ("This alert will cover lunch.").
 */
export function TimeWheelSheet({
  minute,
  onDone,
  onCancel,
  describe,
}: {
  minute: number;
  onDone: (minute: number) => void;
  onCancel: () => void;
  describe: (minute: number) => string;
}) {
  const [h, setH] = useState((Math.floor(minute / 60) + 11) % 12);
  const [m, setM] = useState(Math.round((minute % 60) / ALERT_STEP));
  const [pm, setPm] = useState(minute >= 720 ? 1 : 0);
  const picked = ((HOURS[h] % 12) + (pm ? 12 : 0)) * 60 + MINUTES[m];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <button type="button" onClick={onCancel} className="min-h-11 px-2 text-base font-medium text-accent">
            Cancel
          </button>
          <h2 id="time-sheet-title" className="text-base font-semibold">
            Alert time
          </h2>
          <button type="button" onClick={() => onDone(picked)} className="min-h-11 px-2 text-base font-bold text-accent">
            Done
          </button>
        </div>
        <div className="relative flex justify-center gap-1">
          <div aria-hidden className="pointer-events-none absolute inset-x-2 top-20 h-10 rounded-lg bg-background" />
          <Wheel label="Hour" values={HOURS.map(String)} index={h} onChange={setH} />
          <Wheel label="Minute" values={MINUTES.map((x) => String(x).padStart(2, "0"))} index={m} onChange={setM} />
          <Wheel label="AM or PM" values={HALVES} index={pm} onChange={setPm} />
        </div>
        <p className="mt-3 text-center text-[13px] text-muted" aria-live="polite">
          {describe(picked)}
        </p>
      </div>
    </div>
  );
}
