import { parseNonNegativeMoney } from "@/lib/validation";

export class GuaranteeAlreadyExistsError extends Error {
  constructor() {
    super("This lease already has a guarantee. Edit the existing guarantee instead.");
    this.name = "GuaranteeAlreadyExistsError";
  }
}

export type GuaranteeInput = {
  expectedAmount: string;
  receivedAmount: string;
  retentionAmount: string;
  releaseDate: string;
};

export type GuaranteeField = keyof GuaranteeInput;
export type GuaranteeError = "nonNegativeAmount" | "invalidAmount" | "retentionExceedsReceived" | "retentionRequiresRelease";

export function validateGuaranteeInput(input: GuaranteeInput): Partial<Record<GuaranteeField, GuaranteeError>> {
  const errors: Partial<Record<GuaranteeField, GuaranteeError>> = {};
  for (const field of ["expectedAmount", "receivedAmount", "retentionAmount"] as const) {
    const value = input[field].trim();
    if (value && parseNonNegativeMoney(value) === null) {
      const numeric = Number(value.replace(",", "."));
      errors[field] = Number.isFinite(numeric) && numeric < 0 ? "nonNegativeAmount" : "invalidAmount";
    }
  }

  const retention = parseNonNegativeMoney(input.retentionAmount);
  const received = parseNonNegativeMoney(input.receivedAmount) ?? 0;
  if (!errors.retentionAmount && retention !== null && retention > 0) {
    if (!input.releaseDate) errors.retentionAmount = "retentionRequiresRelease";
    else if (!errors.receivedAmount && retention > received) errors.retentionAmount = "retentionExceedsReceived";
  }
  return errors;
}
