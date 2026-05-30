import * as React from "react";
import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  iconClassName?: string;
}

export interface MultiSelectFilterProps {
  label: string;
  icon?: LucideIcon;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a built-in search box inside the popover. Default: true. */
  searchable?: boolean;
}

export function MultiSelectFilter({
  label,
  icon: Icon,
  options,
  values,
  onChange,
  className,
  searchPlaceholder,
  emptyText = "No results",
  searchable = true,
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);
  const selectedSet = React.useMemo(() => new Set(values), [values]);
  const count = values.length;

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(values.filter(v => v !== value));
    else onChange([...values, value]);
  };

  const clearAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 justify-between gap-2 px-3 font-normal",
            count > 0 && "border-primary/50",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : null}
            <span className="truncate">{label}</span>
            {count > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {count}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {count > 0 ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={clearAll}
                className="rounded p-0.5 hover:bg-muted text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </span>
            ) : null}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {searchable ? (
            <CommandInput placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`} className="h-9" />
          ) : null}
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <div className="flex items-center justify-between px-2 py-1.5 border-b text-[11px] text-muted-foreground">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => onChange(options.map(o => o.value))}
              >
                Select all
              </button>
              <button
                type="button"
                className="hover:text-foreground disabled:opacity-50"
                onClick={() => onChange([])}
                disabled={count === 0}
              >
                Clear
              </button>
            </div>
            <CommandGroup>
              {options.map(opt => {
                const checked = selectedSet.has(opt.value);
                const OptIcon = opt.icon;
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => toggle(opt.value)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border border-input shrink-0",
                        checked ? "bg-primary border-primary text-primary-foreground" : "bg-background",
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {OptIcon ? (
                      <OptIcon className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0", opt.iconClassName)} />
                    ) : null}
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}