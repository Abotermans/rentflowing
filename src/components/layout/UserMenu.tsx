import { Link, useNavigate } from "react-router-dom";
import { User, LogOut, Settings, UserCircle, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/context/SettingsContext";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();

  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({ title: t("userMenu.signOutFailed"), description: error.message, variant: "destructive" });
      return;
    }
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-primary/10" aria-label={t("userMenu.account")} title={t("userMenu.account")}>
          <span className="text-sm font-medium text-primary">{initials}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium truncate">{user?.email}</span>
          <span className="text-xs text-muted-foreground">{t("userMenu.signedIn")}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile"><UserCircle className="h-4 w-4 mr-2" />{t("userMenu.profile")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/portfolio/settings"><Briefcase className="h-4 w-4 mr-2" />{t("userMenu.portfolioSettings")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings"><Settings className="h-4 w-4 mr-2" />{t("userMenu.appSettings")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />{t("userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
