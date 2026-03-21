"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  steps: { title: string }[];
  activeStep: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, activeStep, onStepClick, className }: StepperProps) {
  return (
    <div className={cn("flex items-center w-full", className)}>
      {steps.map((step, i) => {
        const isCompleted = i < activeStep;
        const isActive = i === activeStep;
        const isClickable = isCompleted && onStepClick;
        return (
          <React.Fragment key={i}>
            {/* Step node */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(i)}
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium transition-all border-2",
                  isCompleted && "bg-primary border-primary text-primary-foreground cursor-pointer hover:brightness-110",
                  isActive && "border-primary text-primary bg-primary/10",
                  !isCompleted && !isActive && "border-muted-foreground/20 text-muted-foreground/50",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {step.title}
              </span>
            </div>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 rounded-full transition-colors mt-[-1.25rem]",
                  isCompleted ? "bg-primary" : "bg-muted-foreground/15",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
