"use client";

import { useRef } from "react";

/**
 * Event flyer: a thumbnail you can tap to see it full size.
 * Uses the native <dialog>, so Esc and the back gesture close it too.
 */
export function Flyer({ src, eventName, sample = false }: { src: string; eventName: string; sample?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alt = `${eventName} flyer${sample ? " (sample)" : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="group block w-full max-w-sm overflow-hidden rounded-sm border border-line bg-white text-left lg:max-w-none"
        aria-label={`View ${alt} full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full transition group-hover:opacity-90" />
        <span className="block border-t border-line px-3 py-2 text-sm text-muted group-hover:text-ink">
          Tap to view full size
        </span>
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close(); // click outside the image
        }}
        className="m-auto max-h-[95vh] max-w-[95vw] bg-transparent p-0 backdrop:bg-ink/70"
      >
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="font-display rounded-sm bg-white px-4 py-2 text-sm font-bold text-ink"
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[85vh] w-auto rounded-sm bg-white" />
        </div>
      </dialog>
    </>
  );
}
