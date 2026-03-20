"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";

interface CreateModalProps {
  open: boolean;
  position: { top: number; right: number } | null;
  formDirty: boolean;
  onClose: () => void;
  onShake: () => void;
  title: string;
  children: React.ReactNode;
  /** Optional panel rendered to the left of the main card */
  sidePanel?: React.ReactNode;
}

export function CreateModal({
  open,
  position,
  formDirty,
  onClose,
  onShake,
  title,
  children,
  sidePanel,
}: CreateModalProps) {
  if (!open || !position) return null;

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 bg-black/40 z-50 animate-backdrop-in"
          onClick={() => {
            if (formDirty) {
              onShake();
              return;
            }
            onClose();
          }}
        />,
        document.body,
      )}
      <div
        className="fixed z-[60] animate-modal-expand flex items-start gap-3"
        style={{
          top: position.top,
          right: position.right,
          transformOrigin: "top right",
        }}
      >
        {sidePanel && (
          <div className="animate-modal-expand" style={{ transformOrigin: "top right" }}>
            {sidePanel}
          </div>
        )}
        <Card className="w-[33vw] shadow-2xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <CardContent className="pt-0 max-h-[70vh] overflow-auto">
            {children}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
