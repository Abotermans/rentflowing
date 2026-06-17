import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortfolio } from "@/context/PortfolioContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function PortfolioSwitcher() {
  const { portfolios, currentPortfolio, switchPortfolio, refresh, loading } = usePortfolio();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const createPortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("portfolios")
      .insert({ name: name.trim(), created_by: user.id })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      toast({ title: "Could not create portfolio", description: error?.message, variant: "destructive" });
      return;
    }
    setBusy(false);
    await refresh();
    switchPortfolio(data.id);
    setName("");
    setCreateOpen(false);
    toast({ title: "Portfolio created" });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 max-w-[220px]" disabled={loading && !currentPortfolio}>
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {currentPortfolio?.name ?? (loading ? "Loading…" : "No portfolio")}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1" align="end">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Switch portfolio</div>
          <div className="max-h-64 overflow-auto">
            {portfolios.map((p) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
                onClick={() => { switchPortfolio(p.id); setOpen(false); }}
              >
                <Check className={cn("h-3.5 w-3.5", currentPortfolio?.id === p.id ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
              </button>
            ))}
          </div>
          <div className="border-t my-1" />
          <button
            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent text-left"
            onClick={() => { setOpen(false); setCreateOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create new portfolio</span>
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create portfolio</DialogTitle></DialogHeader>
          <form onSubmit={createPortfolio} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolio-name">Name</Label>
              <Input id="portfolio-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Paris Residential" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}