"use client";

import { useState, useEffect } from "react";

/**
 * Self-contained elapsed time display that updates every second.
 * Isolates the 1s interval re-render to just this tiny component
 * instead of the entire parent page tree.
 */
export function ElapsedTime({
  since,
  className,
}: {
  since: string | null;
  className?: string;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return null;

  const seconds = Math.floor(
    (Date.now() - new Date(since).getTime()) / 1000,
  );
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const display = h > 0
    ? `${h}h ${m}m ${s}s`
    : m > 0
      ? `${m}m ${s}s`
      : `${s}s`;

  return <span className={className}>{display}</span>;
}
