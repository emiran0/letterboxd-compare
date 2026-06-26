"use client";

import { useEffect, useRef, useState } from "react";

/** Minimum number of list fields a group comparison needs. */
const MIN_FIELDS = 3;

/**
 * Group Comparison modal (issues #3, #4).
 *
 * Open/close behaviour: backdrop click, Escape, and the close button all
 * dismiss it, and body scroll is locked while open. The body holds a dynamic
 * set of list inputs — at least three, with no hard cap, each removable down to
 * the minimum. Wiring these up to the multi-list compare is a later issue
 * (#5/#6); for now the inputs are self-contained. The classic two-list flow on
 * the home page is untouched.
 */
export default function GroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [urls, setUrls] = useState<string[]>(() => Array(MIN_FIELDS).fill(""));

  function updateField(i: number, value: string) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }
  function addField() {
    setUrls((prev) => [...prev, ""]);
  }
  function removeField(i: number) {
    setUrls((prev) => (prev.length <= MIN_FIELDS ? prev : prev.filter((_, idx) => idx !== i)));
  }

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-modal-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="group-modal-title">Group Comparison</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="modal-sub">
          Compare three or more lists at once and see what every list shares — plus what&apos;s unique
          to each. Paste list URLs or usernames.
        </p>
        <div className="modal-body">
          <div className="group-fields">
            {urls.map((value, i) => (
              <div className="group-field" key={i}>
                <label className="group-field-label" htmlFor={`group-url-${i}`}>
                  List {i + 1}
                </label>
                <div className="group-field-row">
                  <input
                    id={`group-url-${i}`}
                    value={value}
                    onChange={(e) => updateField(i, e.target.value)}
                    placeholder="username or https://letterboxd.com/user/list/name/"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="group-remove"
                    onClick={() => removeField(i)}
                    disabled={urls.length <= MIN_FIELDS}
                    aria-label={`Remove list ${i + 1}`}
                    title={urls.length <= MIN_FIELDS ? `At least ${MIN_FIELDS} lists required` : "Remove this list"}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="ghost group-add" onClick={addField}>
            + Add list
          </button>
        </div>
      </div>
    </div>
  );
}
