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

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-primary/10">
          <span className="text-sm font-medium text-primary">{initials}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium truncate">{user?.email}</span>
          <span className="text-xs text-muted-foreground">Signed in</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile"><UserCircle className="h-4 w-4 mr-2" />Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/portfolio/settings"><Briefcase className="h-4 w-4 mr-2" />Portfolio settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings"><Settings className="h-4 w-4 mr-2" />App settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}