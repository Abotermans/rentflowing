import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/context/AuthContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/context/SettingsContext";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { refresh, switchPortfolio } = usePortfolio();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Database["public"]["Functions"]["get_portfolio_invitation"]["Returns"][number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_portfolio_invitation", { _token: token });
        if (cancelled) return;
        setLoadError(error?.message ?? null);
        setInvite(data?.[0] ?? null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>;

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{loadError ? t("invite.unavailable") : t("invite.notFound")}</CardTitle>
            <CardDescription>{loadError ?? t("invite.invalidLink")}</CardDescription>
          </CardHeader>
          <CardContent><Button asChild className="w-full"><Link to="/login">{t("invite.goToSignIn")}</Link></Button></CardContent>
        </Card>
      </div>
    );
  }

  const expired = new Date(invite.expires_at) < new Date();
  const alreadyAccepted = !!invite.accepted_at;
  const [descriptionBeforeRole, descriptionAfterRole] = t("invite.description").split("{role}");

  const accept = async () => {
    if (!token) return;
    if (!user) {
      navigate(`/signup?invite=${token}`);
      return;
    }
    if (user.email?.toLowerCase() !== String(invite.email).toLowerCase()) {
      toast({ title: t("invite.wrongAccount"), description: t("invite.wrongAccountDescription").replace("{email}", invite.email), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      let joinedPortfolioId: string | null = null;
      let acceptanceError: string | null = null;
      try {
        const result = await supabase.rpc("accept_portfolio_invitation", { _token: token });
        joinedPortfolioId = result.error ? null : result.data;
        acceptanceError = result.error?.message ?? null;
      } catch (error) {
        acceptanceError = error instanceof Error ? error.message : String(error);
      }
      if (joinedPortfolioId && joinedPortfolioId !== invite.portfolio_id) {
        toast({ title: t("invite.joinFailed"), description: t("invite.portfolioMismatch"), variant: "destructive" });
        return;
      }
      if (!joinedPortfolioId) {
        let membership: { portfolio_id: string } | null = null;
        let membershipError: string | null = null;
        try {
          const result = await supabase
            .from("portfolio_members")
            .select("portfolio_id")
            .eq("portfolio_id", invite.portfolio_id)
            .eq("user_id", user.id)
            .maybeSingle();
          membership = result.data;
          membershipError = result.error?.message ?? null;
        } catch (error) {
          membershipError = error instanceof Error ? error.message : String(error);
        }
        if (membershipError) {
          toast({ title: t("invite.verifyFailed"), description: `${acceptanceError ?? t("invite.noAcceptanceResponse")}; ${t("invite.membershipCheckFailed").replace("{error}", membershipError)}`, variant: "destructive" });
          return;
        }
        if (membership?.portfolio_id !== invite.portfolio_id) {
          toast({ title: t("invite.joinFailed"), description: acceptanceError ?? t("invite.acceptFailed"), variant: "destructive" });
          return;
        }
        joinedPortfolioId = invite.portfolio_id;
      }
      try {
        await refresh();
      } catch (loadError) {
        switchPortfolio(joinedPortfolioId);
        toast({
          title: t("invite.refreshFailed"),
          description: loadError instanceof Error ? loadError.message : String(loadError),
          variant: "destructive",
        });
        navigate("/", { replace: true });
        return;
      }
      switchPortfolio(joinedPortfolioId);
      toast({ title: t("invite.joined") });
      navigate("/", { replace: true });
    } catch (error) {
      toast({ title: t("invite.joinFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="break-words">{t("invite.joinTitle").replace("{portfolio}", invite.portfolio_name ?? t("invite.portfolio"))}</CardTitle>
          <CardDescription>
            {descriptionBeforeRole}<strong>{t(`profile.role.${invite.role}`)}</strong>{descriptionAfterRole.replace("{email}", invite.email)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {expired && <p className="text-sm text-destructive">{t("invite.expired")}</p>}
          {alreadyAccepted && <p className="text-sm text-muted-foreground">{t("invite.alreadyAccepted")}</p>}
          {!expired && !alreadyAccepted && (
            user ? (
              <Button className="w-full" onClick={accept} disabled={busy}>{busy ? t("invite.joining") : t("invite.accept")}</Button>
            ) : (
              <>
                <Button asChild className="w-full"><Link to={`/login?next=${encodeURIComponent(`/accept-invite/${token}`)}`}>{t("invite.signInToAccept")}</Link></Button>
                <Button asChild variant="outline" className="w-full"><Link to={`/signup?invite=${encodeURIComponent(token ?? "")}`}>{t("invite.createAccount")}</Link></Button>
              </>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
