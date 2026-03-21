"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Check, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PresetItem {
  key: string;
  name: string;
  description: string;
  tags?: string;
  badge?: string;
  /** Already imported */
  done?: boolean;
  /** Currently importing */
  importing?: boolean;
  /** Import progress 0-1 */
  importProgress?: number;
  /** Import phase text */
  importPhase?: string;
}

interface PresetListPanelProps {
  title: string;
  items: PresetItem[];
  loading?: boolean;
  multi?: boolean;
  selected: string[];
  onSelectionChange: (keys: string[]) => void;
  onConfirm: (keys: string[]) => void;
  confirmLabel?: string;
  confirming?: boolean;
  error?: string;
}

export function PresetListPanel({
  title,
  items,
  loading,
  multi = true,
  selected,
  onSelectionChange,
  onConfirm,
  confirmLabel = "导入",
  confirming,
  error,
}: PresetListPanelProps) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? items.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()) ||
          (p.tags ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const toggle = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (item?.done || item?.importing) return;
    if (multi) {
      onSelectionChange(
        selected.includes(key)
          ? selected.filter((k) => k !== key)
          : [...selected, key],
      );
    } else {
      onSelectionChange(selected[0] === key ? [] : [key]);
    }
  };

  const activeItems = items.filter(
    (i) => selected.includes(i.key) && !i.done && !i.importing,
  );

  return (
    <Card className="w-[22vw] shadow-2xl rounded-2xl flex flex-col max-h-[70vh]">
      <div className="px-4 pt-4 pb-2 space-y-2 shrink-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mb-2" />
            <p className="text-xs">加载中...</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {search ? "无匹配项" : "暂无预设"}
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((item) => {
              const isSelected = selected.includes(item.key);
              const isDisabled = item.done || item.importing;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => toggle(item.key)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2.5 text-left transition-all",
                    isDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : isSelected
                        ? "bg-primary/[0.08] ring-1 ring-primary/30"
                        : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex gap-2.5">
                    {/* Checkbox — top-aligned */}
                    <div
                      className={cn(
                        "shrink-0 mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30",
                        item.done && "border-emerald-500 bg-emerald-500",
                      )}
                    >
                      {(isSelected || item.done) && (
                        <Check className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{item.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.done && (
                            <Badge variant="success" className="text-[9px]">已导入</Badge>
                          )}
                          {item.badge && !item.done && (
                            <Badge variant="outline" className="text-[9px] font-normal">{item.badge}</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                      {item.importing && (
                        <div className="mt-1.5 space-y-1">
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{
                                width: `${Math.max((item.importProgress ?? 0) * 100, 3)}%`,
                                transition: "width 0.5s ease-out",
                              }}
                            />
                          </div>
                          {item.importPhase && (
                            <p className="text-[9px] text-muted-foreground truncate">{item.importPhase}</p>
                          )}
                        </div>
                      )}
                      {item.tags && !item.importing && (
                        <div className="flex items-center gap-1 mt-1.5">
                          {item.tags.split(",").slice(0, 4).map((t) => (
                            <Badge key={t.trim()} variant="secondary" className="text-[9px] font-normal">
                              {t.trim()}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer action — consistent padding */}
      <div className="shrink-0 px-3 py-3 border-t space-y-2">
        {error && (
          <div className="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
            {error}
          </div>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={activeItems.length === 0 || confirming}
          onClick={() => onConfirm(selected.filter((k) => {
            const item = items.find((i) => i.key === k);
            return item && !item.done && !item.importing;
          }))}
        >
          {confirming ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {confirmLabel}
          {activeItems.length > 0 && ` (${activeItems.length})`}
        </Button>
      </div>
    </Card>
  );
}
