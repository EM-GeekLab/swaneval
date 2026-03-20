"use client";

import { useState, useRef, useEffect } from "react";
import { useImportJobs, type ImportJob } from "@/lib/stores/import-jobs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Check, X, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ImportProgressHub() {
  const { jobs, removeJob, clearDone } = useImportJobs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount = jobs.filter(
    (j) => j.status === "importing" || j.status === "pending",
  ).length;
  const hasJobs = jobs.length > 0;
  const doneCount = jobs.filter(
    (j) => j.status === "done" || j.status === "failed",
  ).length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-open when new job starts
  useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount]);

  if (!hasJobs) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-medium transition-all",
          activeCount > 0
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        {activeCount > 0 ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        {activeCount > 0
          ? `导入中 (${activeCount})`
          : `已完成 (${doneCount})`}
      </button>

      {open && (
        <Card className="absolute top-full right-0 mt-2 w-80 shadow-xl rounded-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <span className="text-xs font-medium">数据集导入</span>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={clearDone}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                清除已完成
              </button>
            )}
          </div>

          {/* Job list */}
          <div className="max-h-64 overflow-auto">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onRemove={removeJob} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function JobRow({
  job,
  onRemove,
}: {
  job: ImportJob;
  onRemove: (id: string) => void;
}) {
  const elapsed = job.finishedAt
    ? Math.round((job.finishedAt - job.startedAt) / 1000)
    : Math.round((Date.now() - job.startedAt) / 1000);

  // Tick for elapsed time while importing
  const [, setTick] = useState(0);
  useEffect(() => {
    if (job.status !== "importing") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [job.status]);

  return (
    <div className="px-3 py-2.5 border-b last:border-0 group/job">
      <div className="flex items-center gap-2">
        {/* Status icon */}
        <div className="shrink-0">
          {job.status === "importing" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
          {job.status === "pending" && (
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {job.status === "done" && (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          )}
          {job.status === "failed" && (
            <X className="h-3.5 w-3.5 text-destructive" />
          )}
        </div>

        {/* Name + source */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{job.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {job.source}
            {job.status === "importing" && ` · ${elapsed}s`}
            {job.status === "done" && ` · ${elapsed}s`}
          </p>
        </div>

        {/* Remove button */}
        {(job.status === "done" || job.status === "failed") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover/job:opacity-100 transition-opacity"
            onClick={() => onRemove(job.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {job.status === "importing" && (
        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{
              width: `${Math.min(90, Math.sqrt(elapsed) * 15)}%`,
              transition: "width 1s ease-out",
            }}
          />
        </div>
      )}

      {/* Error message */}
      {job.status === "failed" && job.error && (
        <p className="mt-1 text-[10px] text-destructive truncate">
          {job.error}
        </p>
      )}
    </div>
  );
}
