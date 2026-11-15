import { useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortfolio } from "@/context/PortfolioContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createPortfolioConfirmed } from "@/lib/repo/portfolioCreation";

export function PortfolioSwitcher() {
  const { portfolios, currentPortfolio, switchPortfolio, refresh, loading } = usePortfolio();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingCreation = useRef<{ userId: string; id: string } | null>(null);
  const activeUserId = useRef(user?.id);
  activeUserId.current = user?.id;

  const createPortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || busy) return;
    const requestedName = name.trim();
    if (pendingCreation.current?.userId !== user.id) {
      pendingCreation.current = { userId: user.id, id: crypto.randomUUID() };
    }
    const attempt = pendingCreation.current;
    setBusy(true);
    try {
      await createPortfolioConfirmed({ id: attempt.id, name: requestedName, created_by: user.id });
      if (activeUserId.current !== user.id) return;
      pendingCreation.current = null;
      setName("");
      setCreateOpen(false);
      try {
        await refresh();
        switchPortfolio(attempt.id);
        toast({ title: t("portfolioSwitcher.created") });
      } catch (error) {
        toast({
          title: t("portfolioSwitcher.refreshFailed"),
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    } catch (error) {
      if (activeUserId.current === user.id) {
        toast({
          title: t("portfolioSwitcher.createFailed"),
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 max-w-[220px]" disabled={loading && !currentPortfolio}>
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {currentPortfolio?.name ?? (loading ? t("common.loading") : t("portfolioSwitcher.none"))}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1" align="end">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("portfolioSwitcher.switch")}</div>
          <div className="max-h-64 overflow-auto">
            {portfolios.map((p) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
                onClick={() => { switchPortfolio(p.id); setOpen(false); }}
              >
                <Check className={cn("h-3.5 w-3.5", currentPortfolio?.id === p.id ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{t(`profile.role.${p.role}`)}</span>
              </button>
            ))}
          </div>
          <div className="border-t my-1" />
          <button
            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
            onClick={() => { setOpen(false); setCreateOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t("portfolioSwitcher.createNew")}</span>
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("portfolioSwitcher.createTitle")}</DialogTitle></DialogHeader>
          <form id="create-portfolio-form" onSubmit={createPortfolio} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolio-name">{t("portfolioSwitcher.name")}</Label>
              <Input id="portfolio-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("portfolioSwitcher.namePlaceholder")} />
            </div>
          </form>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("action.cancel")}</Button>
              <Button type="submit" form="create-portfolio-form" disabled={busy || !name.trim()}>{busy ? t("portfolioSwitcher.creating") : t("action.create")}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
