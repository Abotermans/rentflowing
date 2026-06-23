import { useMemo } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2, ShieldAlert, Archive } from "lucide-react";
import { getDeletionImpact, IntegrityEntityType, ValidationResult } from "@/lib/integrity";
import { useIntegrityState } from "@/hooks/use-integrity-state";

interface DeleteDialogProps {
  entityType: IntegrityEntityType;
  entityId: string;
  entityLabel?: string;
  onDelete: (id: string) => void;
  trigger?: React.ReactNode;
}

export function DeleteDialog({ entityType, entityId, entityLabel, onDelete, trigger }: DeleteDialogProps) {
  const integrityState = useIntegrityState();
  const result: ValidationResult = useMemo(
    () => getDeletionImpact(entityType, entityId, integrityState),
    [entityType, entityId, integrityState]
  );

  const entityName = entityLabel || entityType;
  const isBlocked = !result.allowed;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Delete ${entityName}`} title={`Delete ${entityName}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isBlocked && <ShieldAlert className="h-5 w-5 text-destructive" />}
            {isBlocked ? `Cannot Delete ${capitalize(entityName)}` : `Delete ${capitalize(entityName)}?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {isBlocked ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    This {entityType} has dependencies that prevent deletion:
                  </p>
                  <ul className="space-y-1.5">
                    {result.blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                        {b.message}
                      </li>
                    ))}
                  </ul>
                  {result.warnings.length > 0 && (
                    <ul className="space-y-1">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="text-sm text-muted-foreground">
                          ⚠ {w.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.recommendedAction && (
                    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
                      <Archive className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Recommended:</span>{" "}
                        {result.recommendedAction}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    This action cannot be undone. This will permanently delete this {entityType}.
                  </p>
                  {result.warnings.length > 0 && (
                    <ul className="space-y-1">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="text-sm text-warning">
                          ⚠ {w.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{isBlocked ? "Close" : "Cancel"}</AlertDialogCancel>
          {!isBlocked && (
            <AlertDialogAction
              onClick={() => onDelete(entityId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
