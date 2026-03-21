"use client";

import { useState } from "react";

interface JsonImportBarProps {
  onImport: (text: string) => void;
  className?: string;
}

/**
 * Reusable "Import from clipboard | Import from file" bar.
 * Accepts a JSON string callback. Handles clipboard reading and file reading.
 */
export function JsonImportBar({ onImport, className }: JsonImportBarProps) {
  const [error, setError] = useState("");

  return (
    <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}>
      <button
        type="button"
        className="hover:text-foreground transition-colors"
        onClick={async () => {
          try {
            const text = await navigator.clipboard.readText();
            onImport(text);
          } catch {
            setError("无法读取剪贴板");
            setTimeout(() => setError(""), 3000);
          }
        }}
      >
        从剪贴板导入
      </button>
      <span className="text-border">|</span>
      <label className="hover:text-foreground transition-colors cursor-pointer">
        <input
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onImport(reader.result as string);
            reader.readAsText(file);
            e.target.value = "";
          }}
        />
        从文件导入
      </label>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
