import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

const variantMap: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-base-300/60 text-base-content/70",
  destructive: "bg-error/10 text-error",
  outline: "border border-base-300 text-base-content/70",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantMap[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
