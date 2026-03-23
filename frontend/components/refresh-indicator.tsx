"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Subtle refresh indicator shown during background refetches.
 * Only visible when isFetching=true and isLoading=false.
 */
export function RefreshIndicator({
  isFetching,
  isLoading,
  className,
}: {
  isFetching: boolean;
  isLoading: boolean;
  className?: string;
}) {
  if (!isFetching || isLoading) return null;
  return (
    <div className={cn(
      "inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 animate-in fade-in duration-300",
      className,
    )}>
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>刷新中</span>
    </div>
  );
}
