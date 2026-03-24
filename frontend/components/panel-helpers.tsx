import * as React from "react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export function PanelField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 border-b border-dashed border-muted-foreground/20 min-w-4 translate-y-[-3px]" />
      <div className="text-right shrink-0 min-w-0">{value}</div>
    </div>
  );
}

export function InlineEditField({
  label,
  value,
  onSave,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (newValue: string) => void | Promise<void>;
  mono?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="text-xs">
      <dt className="text-muted-foreground mb-0.5">{label}</dt>
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className={cn("h-7 text-xs", mono && "font-mono")}
            placeholder={placeholder}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setEditing(false); setDraft(value); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <dd
          className={cn(
            "group flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors",
            mono && "font-mono text-[11px]",
            !value && "text-muted-foreground/50 italic",
          )}
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          <span className="break-all">{value || placeholder || "\u672A\u8BBE\u7F6E"}</span>
          <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
        </dd>
      )}
    </div>
  );
}
