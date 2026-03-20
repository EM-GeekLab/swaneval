import { create } from "zustand";

export interface ImportJob {
  id: string;
  name: string;
  source: string;
  status: "pending" | "importing" | "done" | "failed";
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface ImportJobStore {
  jobs: ImportJob[];
  addJob: (job: Omit<ImportJob, "status" | "startedAt">) => void;
  updateJob: (id: string, patch: Partial<ImportJob>) => void;
  removeJob: (id: string) => void;
  clearDone: () => void;
}

export const useImportJobs = create<ImportJobStore>((set) => ({
  jobs: [],
  addJob: (job) =>
    set((s) => ({
      jobs: [
        { ...job, status: "importing", startedAt: Date.now() },
        ...s.jobs,
      ],
    })),
  updateJob: (id, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),
  removeJob: (id) =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
  clearDone: () =>
    set((s) => ({
      jobs: s.jobs.filter((j) => j.status === "importing" || j.status === "pending"),
    })),
}));
