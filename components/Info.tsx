"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A small explanation attached to a heading.
 *
 * The browser's own tooltip is slow to appear, unstyled, and cannot hold more
 * than a line comfortably. Most of what needs explaining here is two sentences
 * about what a number means, so it gets a real box: on hover, on focus, and on
 * click so it works by keyboard and on a touchscreen.
 */
export default function Info({
  children, title, align = "left"
}: {
  children: React.ReactNode;
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  // A pinned box stays until dismissed, so it can be read without keeping the
  // pointer perfectly still.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setPinned(false); setOpen(false); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPinned(false); setOpen(false); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const visible = open || pinned;

  return (
    <span className="info" ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        type="button"
        className={`info-mark ${visible ? "on" : ""}`}
        aria-label={title ? `About ${title}` : "More information"}
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
      >
        ?
      </button>
      {visible && (
        <span className={`info-box info-${align}`} id={id} role="tooltip">
          {title && <strong className="info-title">{title}</strong>}
          <span className="info-body">{children}</span>
        </span>
      )}
    </span>
  );
}
