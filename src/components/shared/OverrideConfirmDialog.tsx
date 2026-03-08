import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ValidationResult } from "@/lib/integrity/types";

interface OverrideConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validation: ValidationResult;
  actionLabel: string;
  onOverride: (reason: string) => void;
}

const MIN_REASON_LENGTH = 10;

export function OverrideConfirmDialog({
  open,
  onOpenChange,
  validation,
  actionLabel,
  onOverride,
}: OverrideConfirmDialogProps) {
  const [reason, setReason] = useState("");

  const canConfirm = reason.trim().length >= MIN_REASON_LENGTH;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onOverride(reason.trim());
    setReason("");
    onOpenChange(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setReason("");
    onOpenChange(v);
  };

  const allIssues = [
    ...validation.blockers.map(b => ({ type: "blocker" as const, message: b.message })),
    ...validation.warnings.map(w => ({ type: "warning" as const, message: w.message })),
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <ShieldAlert className="h-5 w-5" />
            Override Required
          </DialogTitle>
          <DialogDescription>
            This action bypasses normal integrity safeguards. A reason is required and will be recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning banner */}
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="space-y-1">
              {allIssues.map((issue, i) => (
                <p key={i} className="text-xs text-foreground">
                  {issue.message}
                </p>
              ))}
            </div>
          </div>

          {/* Recommended action */}
          {validation.recommendedAction && (
            <p className="text-xs text-muted-foreground italic">
              Recommended: {validation.recommendedAction}
            </p>
          )}

          {/* Reason field */}
          <div className="space-y-2">
            <Label htmlFor="override-reason" className="text-sm font-medium">
              Override Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="override-reason"
              placeholder="Explain why this override is necessary (min. 10 characters)..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
            {reason.length > 0 && reason.trim().length < MIN_REASON_LENGTH && (
              <p className="text-xs text-destructive">
                Reason must be at least {MIN_REASON_LENGTH} characters ({MIN_REASON_LENGTH - reason.trim().length} more needed)
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
