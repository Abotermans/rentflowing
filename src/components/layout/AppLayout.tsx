import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";
import { PortfolioSwitcher } from "./PortfolioSwitcher";
import { UserMenu } from "./UserMenu";
import { useAppData } from "@/context/AppContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useMemo, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getTenantFullName } from "@/types";

export function AppLayout() {
  const { t } = useSettings();
  const { loading, loadError, retryLoad, properties, units, tenants, leases } = useAppData();
  const { loading: portfolioLoading, error: portfolioError, refresh: refreshPortfolios } = usePortfolio();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchItems = useMemo(() => [
    ...properties.map(p => ({ id: `property-${p.id}`, label: p.name, sub: p.referenceCode, href: `/properties/${p.id}`, group: "Properties" })),
    ...units.map(u => ({ id: `unit-${u.id}`, label: u.unitCode, sub: u.unitLabel, href: `/units/${u.id}`, group: "Units" })),
    ...tenants.map(tn => ({ id: `tenant-${tn.id}`, label: getTenantFullName(tn), sub: tn.email || tn.phone, href: `/tenants/${tn.id}`, group: "Tenants" })),
    ...leases.map(l => ({ id: `lease-${l.id}`, label: l.leaseReference, sub: l.lifecycleStage, href: `/leases/${l.id}`, group: "Leases" })),
  ], [properties, units, tenants, leases]);
  const groupedSearchItems = useMemo(() => {
    return ["Properties", "Units", "Tenants", "Leases"].map(group => ({
      group,
      items: searchItems.filter(item => item.group === group).slice(0, 20),
    })).filter(g => g.items.length > 0);
  }, [searchItems]);

  const goToResult = (href: string) => {
    setSearchOpen(false);
    navigate(href);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/20">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 sm:gap-4 sm:px-4">
            <SidebarTrigger label={t("sidebar.toggle")} className="md:hidden" />
            <div className="mx-auto flex min-w-0 max-w-xl flex-1 items-center justify-center">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("common.searchPlaceholder")}
                  className="h-9 cursor-pointer border-transparent bg-muted/60 pl-9 shadow-none hover:border-border hover:bg-muted focus-visible:bg-background focus-visible:ring-2"
                  readOnly
                  role="button"
                  onClick={() => setSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSearchOpen(true);
                  }}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <PortfolioSwitcher />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            {portfolioLoading || loading ? (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : portfolioError || loadError ? (
              <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
                <p className="font-medium text-foreground">{t("common.portfolioLoadFailed")}</p>
                <p className="text-sm text-muted-foreground break-words">{portfolioError ?? loadError}</p>
                <Button onClick={() => { if (portfolioError) void refreshPortfolios().catch(() => {}); else retryLoad(); }}>{t("common.retry")}</Button>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder={t("common.searchPlaceholder")} />
        <CommandList>
          <CommandEmpty>No matching records.</CommandEmpty>
          {groupedSearchItems.map(({ group, items }) => (
            <CommandGroup key={group} heading={group}>
              {items.map(item => (
                <CommandItem key={item.id} value={`${item.label} ${item.sub ?? ""}`} onSelect={() => goToResult(item.href)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.label}</p>
                    {item.sub && <p className="truncate text-xs text-muted-foreground">{item.sub}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  );
}
