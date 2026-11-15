import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface BlurSaveInputProps {
  value: string;
  onCommit: (value: string) => Promise<boolean>;
  className?: string;
  placeholder?: string;
  inputMode?: "decimal" | "text";
  ariaLabel?: string;
  disabled?: boolean;
}

export function BlurSaveInput({ value, onCommit, className, placeholder, inputMode, ariaLabel, disabled = false }: BlurSaveInputProps) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const save = async () => {
    if (disabled || saving || draft === value) return;
    setSaving(true);
    try {
      if (!await onCommit(draft)) setDraft(value);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      aria-label={ariaLabel}
      className={className}
      disabled={disabled || saving}
      inputMode={inputMode}
      onBlur={() => { void save(); }}
      onChange={event => setDraft(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
      placeholder={placeholder}
      value={draft}
    />
  );
}
