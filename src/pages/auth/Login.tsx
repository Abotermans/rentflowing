import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isValidEmail } from "@/lib/validation";
import { safeReturnPath } from "@/lib/safeReturnPath";
import { useSignupAvailability } from "@/hooks/useSignupAvailability";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nextParam = new URLSearchParams(location.search).get("next");
  const nextPath = nextParam ? safeReturnPath(nextParam) : "/";
  const { toast } = useToast();
  const signupAvailability = useSignupAvailability();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const emailValid = email.trim().length > 0 && isValidEmail(email);
  const canSubmit = emailValid && password.length > 0 && !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) {
      toast({ title: "Check your email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      return;
    }
    const from = safeReturnPath((location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? nextPath);
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Access your portfolios and properties</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={email.length > 0 && !emailValid} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={!canSubmit}>{busy ? "Signing in…" : "Sign in"}</Button>
            <p className="min-h-5 text-sm text-center text-muted-foreground">
              {signupAvailability !== "disabled" && signupAvailability !== "checking" && (
                <>No account? <Link to={nextPath === "/" ? "/signup" : `/signup?next=${encodeURIComponent(nextPath)}`} className="text-primary hover:underline">Create one</Link></>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
