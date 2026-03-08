import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldX, AlertTriangle, Lightbulb, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidationResult, IntegrityWarning } from "@/lib/integrity/types";

interface IntegritySummaryPanelProps {
  title: string;
  deleteValidation: ValidationResult;
  additionalWarnings?: IntegrityWarning[];
  className?: string;
}

const severityDot: Record<IntegrityWarning["severity"], string> = {
  low: "bg-muted-foreground",
  medium: "bg-warning",
  high: "bg-destructive",
};

export function IntegritySummaryPanel({
  title,
  deleteValidation,
  additionalWarnings = [],
  className,
}: IntegritySummaryPanelProps) {
  const { allowed, blockers, warnings, recommendedAction } = deleteValidation;
  const allWarnings = [...warnings, ...additionalWarnings];
  const hasIssues = blockers.length > 0 || allWarnings.length > 0;

  if (!hasIssues) return null;

  // Build dependency summary from blockers
  const depCounts = blockers
    .filter((b) => b.count && b.count > 0)
    .map((b) => b.message);

  return (
    <Card className={cn("border", allowed ? "border-border" : "border-destructive/30", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Info className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
          {allowed ? (
            <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-xs font-medium gap-1">
              <ShieldCheck className="h-3 w-3" />
              Deletable
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-xs font-medium gap-1">
              <ShieldX className="h-3 w-3" />
              Delete blocked
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Dependency counts */}
        {depCounts.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {depCounts.map((msg, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground/40">·</span>}
                {msg}
              </span>
            ))}
          </div>
        )}

        {/* Non-count blockers */}
        {blockers.filter((b) => !b.count).length > 0 && (
          <ul className="space-y-1">
            {blockers
              .filter((b) => !b.count)
              .map((b) => (
                <li key={b.code} className="flex items-start gap-1.5 text-xs text-destructive">
                  <ShieldX className="h-3 w-3 mt-0.5 shrink-0" />
                  {b.message}
                </li>
              ))}
          </ul>
        )}

        {/* Warnings */}
        {allWarnings.length > 0 && (
          <ul className="space-y-1">
            {allWarnings.map((w) => (
              <li key={w.code} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0", severityDot[w.severity])} />
                {w.message}
              </li>
            ))}
          </ul>
        )}

        {/* Recommended action */}
        {recommendedAction && (
          <div className="flex items-start gap-1.5 text-xs text-primary font-medium pt-1 border-t border-border">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{recommendedAction}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
