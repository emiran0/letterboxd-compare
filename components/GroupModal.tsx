"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GROUP_URLS_KEY } from "@/lib/group";

/** Minimum number of list fields a group comparison needs. */
const MIN_FIELDS = 3;

/**
 * Group Comparison modal (issues #3, #4, #6).
 *
 * Open/close behaviour: backdrop click, Escape, and the close button all
 * dismiss it, and body scroll is locked while open. The body holds a dynamic
 * set of list inputs, at least three, with no hard cap, each removable down to
 * the minimum. Compare stashes the entered URLs in sessionStorage and navigates
 * to /group/results, which runs the multi-list comparison. The classic two-list
 * flow on the home page is untouched.
 */
export default function GroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [urls, setUrls] = useState<string[]>(() => Array(MIN_FIELDS).fill(""));
  const [error, setError] = useState<string | null>(null);

  function updateField(i: number, value: string) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }
  function addField() {
    setUrls((prev) => [...prev, ""]);
  }
  function removeField(i: number) {
    setUrls((prev) => (prev.length <= MIN_FIELDS ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function compare() {
    const entries = urls.map((u) => u.trim()).filter(Boolean);
    // De-duplicate case-insensitively while keeping the first spelling.
    const seen = new Set<string>();
    const unique = entries.filter((u) => {
      const key = u.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length < 2) {
      setError("Enter at least two different lists to compare.");
      return;
    }
    sessionStorage.setItem(GROUP_URLS_KEY, JSON.stringify(unique));
    router.push("/group/results");
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
          Compare three or more lists at once and see what every list shares, plus what&apos;s unique
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
        {error ? <p className="error">{error}</p> : null}
        <div className="modal-foot">
          <button type="button" className="primary" onClick={compare}>
            Compare lists
          </button>
        </div>
      </div>
    </div>
  );
}
