import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/context/SettingsContext";
import { PortfolioSwitcher } from "./PortfolioSwitcher";
import { UserMenu } from "./UserMenu";
import { useAppData } from "@/context/AppContext";

export function AppLayout() {
  const { t } = useSettings();
  const { loading } = useAppData();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 bg-background sticky top-0 z-10 gap-4">
            <SidebarTrigger />
            <div className="flex-1 flex items-center justify-center max-w-md mx-auto">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("common.searchPlaceholder")}
                  className="pl-9 h-9 bg-muted/50 border-none focus-visible:bg-background focus-visible:ring-1"
                  readOnly
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
    </SidebarProvider>
  );
}
