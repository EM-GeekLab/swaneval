"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Persist a selected item ID in the URL query string.
 * Survives page refresh. Returns [selectedId, setSelectedId].
 */
export function useUrlSelection(
  paramName: string,
  validIds?: string[],
): [string | null, (id: string | null) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdRaw(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set(paramName, id);
    else params.delete(paramName);
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, paramName]);

  // Restore from URL on mount
  useEffect(() => {
    const idParam = searchParams.get(paramName);
    if (idParam && !selectedId) {
      // If validIds provided, only restore if the ID exists in the list
      if (!validIds || validIds.includes(idParam)) {
        setSelectedIdRaw(idParam);
      }
    }
  }, [searchParams, selectedId, paramName, validIds]);

  return [selectedId, setSelectedId];
}
