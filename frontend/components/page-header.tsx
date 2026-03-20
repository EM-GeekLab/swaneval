"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface PageHeaderProps {
  title: string;
  /** Stat chips shown next to the title */
  stats?: { label: string; value: number }[];
  /** Right-side action (e.g. add button) */
  action?: React.ReactNode;
}

export function PageHeader({ title, stats, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-5">
        <h1 className="text-lg font-semibold">{title}</h1>
        {stats && stats.length > 0 && (
          <div className="hidden sm:flex items-center gap-4 text-xs text-base-content/50">
            {stats.map((s) => (
              <span key={s.label}>
                {s.label}{" "}
                <span className="font-semibold text-base-content tabular-nums">
                  {s.value}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

interface SearchToolbarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

export function SearchToolbar({ value, onChange, placeholder = "搜索...", children }: SearchToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/50" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 h-8 rounded-full text-xs"
        />
      </div>
      {children}
    </div>
  );
}
