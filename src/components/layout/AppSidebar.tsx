import { LayoutDashboard, Building2, DoorOpen, Users, FileText, CreditCard, Wrench, HardHat, BarChart3, Settings, Coins, Tags, Settings2, PieChart, ChevronRight } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import type { TranslationKey } from "@/i18n/translations";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

const items: { titleKey: TranslationKey; url: string; icon: typeof LayoutDashboard }[] = [
  { titleKey: "nav.dashboard", url: "/", icon: LayoutDashboard },
  { titleKey: "nav.properties", url: "/properties", icon: Building2 },
  { titleKey: "nav.units", url: "/units", icon: DoorOpen },
  { titleKey: "nav.tenants", url: "/tenants", icon: Users },
  { titleKey: "nav.leases", url: "/leases", icon: FileText },
  { titleKey: "nav.payments", url: "/payments", icon: CreditCard },
  { titleKey: "nav.maintenance", url: "/maintenance", icon: Wrench },
  { titleKey: "nav.vendors", url: "/vendors", icon: HardHat },
  { titleKey: "nav.reports", url: "/reports", icon: BarChart3 },
];

const costsChildren: { titleKey: TranslationKey; url: string; icon: typeof LayoutDashboard }[] = [
  { titleKey: "costs.entries", url: "/costs/entries", icon: FileText },
  { titleKey: "costs.categories", url: "/costs/categories", icon: Tags },
  { titleKey: "costs.allocationRules", url: "/costs/rules", icon: Settings2 },
  { titleKey: "costs.allocations", url: "/costs/allocations", icon: PieChart },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { t } = useSettings();
  const { pathname } = useLocation();
  const collapsed = state === "collapsed";
  const costsActive = pathname.startsWith("/costs");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg text-sidebar-foreground">{t("common.appName")}</span>
          </div>
        )}
        {collapsed && <Building2 className="h-6 w-6 text-primary mx-auto" />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.slice(0, 8).map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild tooltip={t(item.titleKey)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{t(item.titleKey)}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Charges & Taxes — collapsible group */}
              <Collapsible defaultOpen={costsActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip={t("nav.costs")}
                      className={`hover:bg-sidebar-accent/50 ${costsActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""}`}
                    >
                      <Coins className="h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span>{t("nav.costs")}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </>
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {costsChildren.map((child) => (
                        <SidebarMenuSubItem key={child.url}>
                          <SidebarMenuSubButton asChild isActive={pathname === child.url}>
                            <RouterNavLink to={child.url}>
                              <child.icon className="h-3.5 w-3.5" />
                              <span>{t(child.titleKey)}</span>
                            </RouterNavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {items.slice(8).map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild tooltip={t(item.titleKey)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{t(item.titleKey)}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("nav.settings")}>
              <NavLink
                to="/settings"
                className="hover:bg-sidebar-accent/50"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <Settings className="h-4 w-4" />
                {!collapsed && <span>{t("nav.settings")}</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
