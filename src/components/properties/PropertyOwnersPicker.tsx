import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, X, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import type { PropertyOwnerType } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function PropertyOwnersPicker({ selectedIds, onChange }: Props) {
  const { propertyOwners, createPropertyOwner } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PropertyOwnerType>("individual");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selected = useMemo(
    () => selectedIds.map(id => propertyOwners.find(o => o.id === id)).filter(Boolean) as typeof propertyOwners,
    [selectedIds, propertyOwners],
  );

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };

  const openCreate = () => {
    setNewName(search.trim());
    setNewType("individual");
    setCreateOpen(true);
    setOpen(false);
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: t("common.validationError"), description: t("propertyOwners.nameRequired"), variant: "destructive" });
      return;
    }
    const created = createPropertyOwner({ name, type: newType });
    onChange([...selectedIds, created.id]);
    setCreateOpen(false);
    setSearch("");
  };

  const typeIcon = (type: PropertyOwnerType) => type === "corporation" ? Building2 : User;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn("w-full justify-between gap-2 font-normal", selected.length === 0 && "text-muted-foreground")}
          >
            <span className="truncate">
              {selected.length === 0
                ? t("propertyOwners.pickerPlaceholder")
                : `${selected.length} ${selected.length === 1 ? t("propertyOwners.singular") : t("propertyOwners.plural")}`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t("propertyOwners.searchPlaceholder")}
              className="h-9"
            />
            <CommandList className="max-h-64">
              <CommandEmpty>
                <button type="button" onClick={openCreate} className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded">
                  <Plus className="h-4 w-4" />
                  {t("propertyOwners.createNew")}{search.trim() ? `: "${search.trim()}"` : ""}
                </button>
              </CommandEmpty>
              <CommandGroup>
                {propertyOwners.map(o => {
                  const checked = selectedSet.has(o.id);
                  const Icon = typeIcon(o.type);
                  return (
                    <CommandItem
                      key={o.id}
                      value={`${o.name} ${o.type}`}
                      onSelect={() => toggle(o.id)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <span className={cn("flex h-4 w-4 items-center justify-center rounded border border-input shrink-0", checked ? "bg-primary border-primary text-primary-foreground" : "bg-background")}>
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{o.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                        {t(o.type === "corporation" ? "propertyOwners.type.corporation" : "propertyOwners.type.individual")}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <div className="border-t">
                <button type="button" onClick={openCreate} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                  <Plus className="h-4 w-4" />
                  {t("propertyOwners.createNew")}
                </button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(o => {
            const Icon = typeIcon(o.type);
            return (
              <Badge key={o.id} variant="secondary" className="gap-1 pr-1 font-normal">
                <Icon className="h-3 w-3" />
                <span>{o.name}</span>
                <button type="button" onClick={() => toggle(o.id)} className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("propertyOwners.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="po-name">{t("propertyOwners.name")} *</Label>
              <Input id="po-name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>{t("propertyOwners.type")} *</Label>
              <Select value={newType} onValueChange={v => setNewType(v as PropertyOwnerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">{t("propertyOwners.type.individual")}</SelectItem>
                  <SelectItem value="corporation">{t("propertyOwners.type.corporation")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={submitCreate}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}