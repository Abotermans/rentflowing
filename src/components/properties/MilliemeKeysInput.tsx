import { useState } from "react";
import { Input } from "@/components/ui/input";
import { DEFAULT_MILLIEME_KEY } from "@/types";

function parseKeys(value: string): string[] {
  const keys = [...new Set(value.split(",").map(key => key.trim()).filter(Boolean))];
  return keys.includes(DEFAULT_MILLIEME_KEY) ? keys : [DEFAULT_MILLIEME_KEY, ...keys];
}

interface MilliemeKeysInputProps {
  keys: string[];
  onChange: (keys: string[]) => void;
}

export function MilliemeKeysInput({ keys, onChange }: MilliemeKeysInputProps) {
  const [draft, setDraft] = useState(() => keys.join(", "));

  return (
    <Input
      value={draft}
      onChange={event => {
        setDraft(event.target.value);
        onChange(parseKeys(event.target.value));
      }}
      onBlur={() => setDraft(parseKeys(draft).join(", "))}
      placeholder="general, lift, heating"
    />
  );
}
