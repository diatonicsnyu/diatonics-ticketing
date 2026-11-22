"use client";

import dynamic from "next/dynamic";

/**
 * The scanner reads this phone's saved guest list and scan history when it
 * starts, so it only runs in the browser (no server rendering).
 */
export const DoorClient = dynamic(() => import("./DoorApp").then((m) => m.DoorApp), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center bg-page p-8 text-center text-lg font-semibold text-muted">
      Starting the door app…
    </div>
  ),
});
