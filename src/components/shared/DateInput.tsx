import { type ComponentProps, useEffect, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDate, parseDisplayDate } from "@/lib/formatters";

type DateInputProps = Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string | null | undefined;
  onChange: (value: string) => void;
};

function isoToDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parseDisplayDate(value);
  if (!parsed) return undefined;
  const [year, month, day] = parsed.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateInput({ value, onChange, className, onBlur, onClick, onFocus, placeholder, disabled, min, max, ...props }: DateInputProps) {
  const [displayValue, setDisplayValue] = useState(value ? formatDate(value) : "");
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const selectedDate = isoToDate(value);
  const [month, setMonth] = useState<Date>(selectedDate ?? new Date());
  const minDate = typeof min === "string" ? isoToDate(min) : undefined;
  const maxDate = typeof max === "string" ? isoToDate(max) : undefined;

  useEffect(() => {
    setDisplayValue(value ? formatDate(value) : "");
    setInvalid(false);
    const nextSelected = isoToDate(value);
    if (nextSelected) setMonth(nextSelected);
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        placeholder={placeholder ?? "DD/MM/YYYY"}
        value={displayValue}
        disabled={disabled}
        min={min}
        max={max}
        aria-invalid={invalid || props["aria-invalid"]}
        className={cn(
          "h-full w-full pr-9",
          (invalid || props["aria-invalid"]) && "border-destructive focus-visible:ring-destructive",
        )}
        onFocus={event => {
          onFocus?.(event);
        }}
        onClick={event => {
          onClick?.(event);
        }}
        onChange={event => {
          const nextDisplay = event.target.value;
          setDisplayValue(nextDisplay);
          if (!nextDisplay.trim()) {
            setInvalid(false);
            onChange("");
            return;
          }
          const parsed = parseDisplayDate(nextDisplay);
          if (parsed) {
            setInvalid(false);
            onChange(parsed);
            const parsedDate = isoToDate(parsed);
            if (parsedDate) setMonth(parsedDate);
          } else if (nextDisplay.trim().length >= 10) {
            onChange("");
          }
        }}
        onBlur={event => {
          const parsed = parseDisplayDate(displayValue);
          if (displayValue.trim() && !parsed) {
            setInvalid(true);
            onChange("");
          } else {
            setInvalid(false);
            setDisplayValue(parsed ? formatDate(parsed) : "");
          }
          onBlur?.(event);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Choose date"
            disabled={disabled}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            month={month}
            onMonthChange={setMonth}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={date => {
              if (!date) return;
              const isoDate = dateToISO(date);
              setDisplayValue(formatDate(isoDate));
              setInvalid(false);
              setMonth(date);
              onChange(isoDate);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
