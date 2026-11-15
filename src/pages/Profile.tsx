import { useEffect, useRef, useState } from "react";
import { CircleAlert, RotateCcw, UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { singleRowMutationError } from "@/lib/repo/mutationAcknowledgement";
import { useAuth } from "@/context/AuthContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { isValidEmail } from "@/lib/validation";

export default function Profile() {
  const { user, updatePassword } = useAuth();
  const { portfolios, refresh, switchPortfolio } = usePortfolio();
  const { t } = useSettings();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [defaultPortfolioId, setDefaultPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [leaveTargetId, setLeaveTargetId] = useState<string | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveBusyRef = useRef(false);

  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const newEmailValid = newEmail.trim().length > 0 && isValidEmail(newEmail);

  const userId = user?.id;
  const activeUserId = useRef(userId);
  activeUserId.current = userId;
  const accountGeneration = useRef(0);
  useEffect(() => {
    accountGeneration.current += 1;
    busyRef.current = false;
    leaveBusyRef.current = false;
    setBusy(false);
    setLeaveBusy(false);
    setNewEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setLeaveTargetId(null);
  }, [userId]);
  useEffect(() => {
    if (!userId) {
      setProfileLoadError(true);
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    setProfileLoadError(false);
    void (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        if (error || !data) throw error ?? new Error("Profile record unavailable");
        if (!current) return;
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setPhone(data.phone ?? "");
        setDefaultPortfolioId(data.default_portfolio_id);
        setLoadedUserId(userId);
      } catch {
        if (current) setProfileLoadError(true);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [userId, loadAttempt]);

  const runAccountAction = async (errorTitle: string, action: (isCurrent: () => boolean) => Promise<void>) => {
    if (busyRef.current) return;
    const actionUserId = userId;
    const generation = accountGeneration.current;
    const isCurrent = () => activeUserId.current === actionUserId && accountGeneration.current === generation;
    busyRef.current = true;
    setBusy(true);
    try {
      await action(isCurrent);
    } catch (error) {
      if (isCurrent()) {
        toast({
          title: errorTitle,
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await runAccountAction(t("profile.saveFailed"), async (isCurrent) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({ first_name: firstName, last_name: lastName, phone })
        .eq("id", user.id)
        .select("id");
      const failure = singleRowMutationError(error, data, "Profile update");
      if (failure) throw new Error(failure);
      if (isCurrent()) toast({ title: t("profile.saved") });
    });
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailValid) {
      toast({ title: t("profile.emailFailed"), description: t("profile.invalidEmail"), variant: "destructive" });
      return;
    }
    await runAccountAction(t("profile.emailFailed"), async (isCurrent) => {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      if (isCurrent()) {
        toast({ title: t("profile.emailConfirmTitle"), description: t("profile.emailConfirmDescription") });
      }
    });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAccountAction(t("profile.passwordFailed"), async (isCurrent) => {
      const { error } = await updatePassword(newPassword, currentPassword);
      if (error) throw error;
      if (!isCurrent()) return;
      toast({ title: t("profile.passwordUpdated") });
      setCurrentPassword("");
      setNewPassword("");
    });
  };

  const setAsDefault = async (id: string) => {
    if (!user) return;
    await runAccountAction(t("profile.defaultFailed"), async (isCurrent) => {
      const { data, error } = await supabase.from("profiles").update({ default_portfolio_id: id }).eq("id", user.id).select("id");
      const failure = singleRowMutationError(error, data, "Default portfolio update");
      if (failure) throw new Error(failure);
      if (!isCurrent()) return;
      setDefaultPortfolioId(id);
      switchPortfolio(id);
      toast({ title: t("profile.defaultUpdated") });
    });
  };

  const leavePortfolio = async () => {
    if (!user || !leaveTargetId || leaveBusyRef.current) return;
    const leavingUserId = user.id;
    const generation = accountGeneration.current;
    const isCurrent = () => activeUserId.current === leavingUserId && accountGeneration.current === generation;
    leaveBusyRef.current = true;
    setLeaveBusy(true);
    try {
      const { data, error } = await supabase.from("portfolio_members").delete()
        .match({ portfolio_id: leaveTargetId, user_id: user.id }).select("id");
      if (!isCurrent()) return;
      const failure = singleRowMutationError(error, data, "Leaving portfolio");
      if (failure) {
        toast({ title: t("profile.leaveFailed"), description: failure, variant: "destructive" });
        return;
      }
      setLeaveTargetId(null);
      toast({ title: t("profile.left") });
      try {
        await refresh();
        if (!isCurrent()) return;
        const { data: profile, error: profileError } = await supabase.from("profiles")
          .select("default_portfolio_id").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        if (isCurrent()) setDefaultPortfolioId(profile?.default_portfolio_id ?? null);
      } catch (refreshError) {
        if (isCurrent()) {
          toast({ title: t("common.portfolioLoadFailed"), description: refreshError instanceof Error ? refreshError.message : String(refreshError), variant: "destructive" });
        }
      }
    } catch (leaveError) {
      if (isCurrent()) {
        toast({ title: t("profile.leaveFailed"), description: leaveError instanceof Error ? leaveError.message : String(leaveError), variant: "destructive" });
      }
    } finally {
      if (isCurrent()) {
        leaveBusyRef.current = false;
        setLeaveBusy(false);
      }
    }
  };

  if (loading || (userId !== loadedUserId && !profileLoadError)) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  if (profileLoadError) return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      <div role="alert" className="flex flex-wrap items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{t("profile.loadFailed")}</p>
          <p className="text-sm text-muted-foreground">{t("profile.loadDescription")}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setLoadAttempt(attempt => attempt + 1)}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("common.retry")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <UserCircle className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      </div>
      <Separator />

      <Tabs defaultValue="personal">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="personal" className="shrink-0">{t("profile.personalTab")}</TabsTrigger>
          <TabsTrigger value="security" className="shrink-0">{t("profile.securityTab")}</TabsTrigger>
          <TabsTrigger value="portfolios" className="shrink-0">{t("profile.portfoliosTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("profile.personalTitle")}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="fn">{t("profile.firstName")}</Label><Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="ln">{t("profile.lastName")}</Label><Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="ph">{t("profile.phone")}</Label><Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <Button type="submit" disabled={busy}>{t("action.save")}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("profile.emailTitle")}</CardTitle><CardDescription>{t("profile.currentEmail")} {user?.email}</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={changeEmail} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="ne">{t("profile.newEmail")}</Label><Input id="ne" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-invalid={newEmail.length > 0 && !newEmailValid} required /></div>
                <Button type="submit" disabled={busy || !newEmailValid}>{t("profile.updateEmail")}</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("profile.passwordTitle")}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="cp">{t("profile.currentPassword")}</Label><Input id="cp" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
                <div className="space-y-2"><Label htmlFor="np">{t("profile.newPassword")}</Label><Input id="np" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
                <Button type="submit" disabled={busy || !currentPassword || newPassword.length < 8}>{t("profile.updatePassword")}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolios" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("profile.myPortfolios")}</CardTitle><CardDescription>{t("profile.portfoliosDescription")}</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {portfolios.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{p.name}</span>
                    <Badge variant="secondary">{t(`profile.role.${p.role}`)}</Badge>
                    {defaultPortfolioId === p.id && <Badge variant="outline">{t("profile.default")}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {defaultPortfolioId !== p.id && (
                      <Button size="sm" variant="outline" disabled={busy || leaveBusy} onClick={() => setAsDefault(p.id)}>{t("profile.setDefault")}</Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy || leaveBusy} onClick={() => setLeaveTargetId(p.id)}>{t("profile.leave")}</Button>
                  </div>
                </div>
              ))}
              {portfolios.length === 0 && <p className="text-sm text-muted-foreground">{t("profile.noPortfolios")}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AlertDialog open={leaveTargetId !== null} onOpenChange={(open) => { if (!open && !leaveBusy) setLeaveTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {portfolios.find((p) => p.id === leaveTargetId)?.name}. {t("profile.leaveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveBusy}>{t("action.cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={leaveBusy} onClick={() => void leavePortfolio()}>{t("profile.leave")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
