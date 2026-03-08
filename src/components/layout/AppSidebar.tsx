import { LayoutDashboard, Building2, DoorOpen, Users, FileText, CreditCard, Wrench, HardHat, BarChart3, Settings, Coins } from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
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
  { titleKey: "nav.costs", url: "/costs", icon: Coins },
  { titleKey: "nav.reports", url: "/reports", icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { t } = useSettings();
  const collapsed = state === "collapsed";

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
              {items.map((item) => (
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
