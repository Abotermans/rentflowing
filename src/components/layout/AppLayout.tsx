import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/context/SettingsContext";
import { PortfolioSwitcher } from "./PortfolioSwitcher";
import { UserMenu } from "./UserMenu";
import { useAppData } from "@/context/AppContext";
import { useMemo, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getTenantFullName } from "@/types";

export function AppLayout() {
  const { t } = useSettings();
  const { loading, properties, units, tenants, leases } = useAppData();
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
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 bg-background sticky top-0 z-10 gap-4">
            <SidebarTrigger label={t("sidebar.toggle")} />
            <div className="flex-1 flex items-center justify-center max-w-md mx-auto">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("common.searchPlaceholder")}
                  className="pl-9 h-9 bg-muted/50 border-none focus-visible:bg-background focus-visible:ring-1"
                  readOnly
                  role="button"
                  onClick={() => setSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSearchOpen(true);
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PortfolioSwitcher />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading…</span>
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
