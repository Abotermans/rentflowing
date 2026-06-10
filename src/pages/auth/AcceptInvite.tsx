import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useToast } from "@/hooks/use-toast";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { refresh, switchPortfolio } = usePortfolio();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await supabase
        .from("portfolio_invitations")
        .select("id, portfolio_id, email, role, expires_at, accepted_at, portfolios:portfolio_id(name)")
        .eq("token", token)
        .maybeSingle();
      setInvite(data);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
            <CardDescription>This invitation link is invalid or has been revoked.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild className="w-full"><Link to="/login">Go to sign in</Link></Button></CardContent>
        </Card>
      </div>
    );
  }

  const expired = new Date(invite.expires_at) < new Date();
  const alreadyAccepted = !!invite.accepted_at;

  const accept = async () => {
    if (!user) {
      navigate(`/signup?invite=${token}`);
      return;
    }
    if (user.email?.toLowerCase() !== String(invite.email).toLowerCase()) {
      toast({ title: "Wrong account", description: `This invite is for ${invite.email}. Sign in with that email.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error: memberErr } = await supabase
      .from("portfolio_members")
      .insert({ portfolio_id: invite.portfolio_id, user_id: user.id, role: invite.role });
    if (memberErr && !memberErr.message.includes("duplicate")) {
      setBusy(false);
      toast({ title: "Failed to join", description: memberErr.message, variant: "destructive" });
      return;
    }
    await supabase.from("portfolio_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    await refresh();
    switchPortfolio(invite.portfolio_id);
    setBusy(false);
    toast({ title: "Joined portfolio" });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join {invite.portfolios?.name ?? "portfolio"}</CardTitle>
          <CardDescription>
            You've been invited as <strong>{invite.role}</strong> ({invite.email}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {expired && <p className="text-sm text-destructive">This invitation has expired.</p>}
          {alreadyAccepted && <p className="text-sm text-muted-foreground">This invitation was already accepted.</p>}
          {!expired && !alreadyAccepted && (
            user ? (
              <Button className="w-full" onClick={accept} disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</Button>
            ) : (
              <>
                <Button asChild className="w-full"><Link to={`/login?next=/accept-invite/${token}`}>Sign in to accept</Link></Button>
                <Button asChild variant="outline" className="w-full"><Link to={`/signup?invite=${token}`}>Create an account</Link></Button>
              </>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}