import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  required?: boolean;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, required = false, error, htmlFor, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && " *"}
      </Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
