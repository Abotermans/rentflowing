import { AlertTriangle, XCircle, Lightbulb, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ValidationResult } from "@/lib/integrity/types";

interface StatusTransitionAlertProps {
  validation: ValidationResult | null;
}

export function StatusTransitionAlert({ validation }: StatusTransitionAlertProps) {
  if (!validation || (validation.allowed && validation.warnings.length === 0)) return null;

  return (
    <div className="space-y-2 mt-2">
      {validation.blockers.length > 0 && (
        <Alert variant="destructive" className="py-2 flex items-center gap-3 [&>svg]:static [&>svg]:translate-y-0 [&>svg~*]:pl-0">
          <XCircle className="h-4 w-4 shrink-0" />
          <AlertDescription>
            <div className="text-xs space-y-0.5">
              {validation.blockers.map(b => (
                <div key={b.code}>{b.message}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {validation.warnings.length > 0 && (
        <Alert className="py-2 flex items-center gap-3 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600 [&>svg]:static [&>svg]:translate-y-0 [&>svg~*]:pl-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <AlertDescription>
            <div className="text-xs space-y-0.5">
              {validation.warnings.map(w => (
                <div key={w.code}>{w.message}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!validation.allowed && validation.overrideAllowed && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>This can be overridden on save for exceptional cases.</span>
        </div>
      )}
      {validation.recommendedAction && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{validation.recommendedAction}</span>
        </div>
      )}
    </div>
  );
}
