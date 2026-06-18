import * as React from "react";
import { cn } from "@/lib/utils";

export type LeaseBannerTone = "warning" | "destructive" | "info";

/**
 * Uniform banner used at the top of lease-related pages.
 * Every banner shares the same shell, height, padding, icon size, typography
 * and action-area layout so they stack as a visually consistent column.
 */
export function LeaseBanner({
  tone,
  icon: Icon,
  title,
  description,
  actions,
}: {
  tone: LeaseBannerTone;
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const toneClass =
    tone === "destructive"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : tone === "warning"
      ? "border-warning/50 bg-warning/10 text-warning"
      : "border-border bg-muted/40 text-foreground";
  return (
    <div
      role="alert"
      className={cn(
        "w-full min-h-[64px] rounded-lg border px-4 py-3",
        "flex items-center gap-3",
        toneClass,
      )}
    >
      <Icon className="h-5 w-5 shrink-0 self-center" />
      <div className="flex-1 min-w-0 flex flex-col justify-center leading-snug">
        <span className="text-sm font-medium">{title}</span>
        {description && (
          <span className="text-xs opacity-90 mt-0.5">{description}</span>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}