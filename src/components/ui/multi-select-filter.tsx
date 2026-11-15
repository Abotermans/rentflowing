import * as React from "react";
import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  iconClassName?: string;
  content?: React.ReactNode;
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
  emptyText,
  searchable = true,
}: MultiSelectFilterProps) {
  const { t } = useSettings();
  const [open, setOpen] = React.useState(false);
  const selectedSet = React.useMemo(() => new Set(values), [values]);
  const count = values.length;

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(values.filter(v => v !== value));
    else onChange([...values, value]);
  };

  const clearAll = () => onChange([]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative inline-flex max-w-full">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-label={count > 0 ? `${label} (${count})` : label}
            aria-expanded={open}
            className={cn(
              "h-9 justify-between gap-2 px-3 font-normal",
              count > 0 && "border-primary/50 pr-10",
              className,
            )}
          >
            <span className={cn("flex items-center gap-2 truncate", count > 0 && "text-primary")}>
              {Icon ? <Icon className={cn("h-3.5 w-3.5 shrink-0", count === 0 && "text-muted-foreground")} /> : null}
              <span className="truncate">{label}</span>
              {count > 0 ? (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                  {count}
                </span>
              ) : null}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {count > 0 && (
          <button
            type="button"
            aria-label={`${t("filter.clear")} ${label}`}
            title={`${t("filter.clear")} ${label}`}
            onClick={clearAll}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {searchable ? (
            <CommandInput placeholder={searchPlaceholder ?? t("filter.search")} className="h-9" />
          ) : null}
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText ?? t("filter.noResults")}</CommandEmpty>
            <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs text-muted-foreground">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => onChange(options.map(o => o.value))}
              >
                {t("filter.selectAll")}
              </button>
              <button
                type="button"
                className="hover:text-foreground disabled:opacity-50"
                onClick={() => onChange([])}
                disabled={count === 0}
              >
                {t("filter.clear")}
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
                    className={cn("flex items-center gap-2 cursor-pointer", checked && "text-primary")}
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
                      <OptIcon className={cn("h-3.5 w-3.5 shrink-0", checked ? "text-current" : "text-muted-foreground", !checked && opt.iconClassName)} />
                    ) : null}
                    <span className="min-w-0 truncate">{opt.content ?? opt.label}</span>
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
