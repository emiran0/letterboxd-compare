"use client";

import { useEffect, useRef } from "react";

/**
 * Group Comparison modal shell (issue #3).
 *
 * Pure presentation + open/close behaviour: backdrop click, Escape, and the
 * close button all dismiss it, and body scroll is locked while open. The list
 * inputs and the compare action are filled in by later issues (#4, #5+); for
 * now the body is a scaffold so the entry point can be wired and tested on its
 * own. The classic two-list flow on the home page is untouched.
 */
export default function GroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

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
          {/* List inputs land here in #4; the multi-list compare in #5/#6. */}
          <p className="modal-placeholder">List inputs coming next.</p>
        </div>
      </div>
    </div>
  );
}
