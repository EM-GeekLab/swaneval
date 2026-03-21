"use client";

import { useState } from "react";

interface JsonImportBarProps {
  onImport: (text: string) => void;
  className?: string;
}

/**
 * Reusable "Import from clipboard | Import from file" bar.
 * Validates JSON before passing to onImport. Shows inline errors.
 */
export function JsonImportBar({ onImport, className }: JsonImportBarProps) {
  const [error, setError] = useState("");

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  };

  const tryImport = (text: string) => {
    try {
      JSON.parse(text);
      onImport(text);
      setError("");
    } catch {
      showError("JSON 格式错误，请检查语法");
    }
  };

  return (
    <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}>
      <button
        type="button"
        className="hover:text-foreground transition-colors"
        onClick={async () => {
          try {
            const text = await navigator.clipboard.readText();
            tryImport(text);
          } catch {
            showError("无法读取剪贴板");
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
            reader.onload = () => tryImport(reader.result as string);
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
