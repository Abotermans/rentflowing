import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useToast } from "@/hooks/use-toast";
import { isValidEmail } from "@/lib/validation";

export default function Profile() {
  const { user, updatePassword } = useAuth();
  const { portfolios, refresh } = usePortfolio();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [defaultPortfolioId, setDefaultPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const newEmailValid = newEmail.trim().length > 0 && isValidEmail(newEmail);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setPhone(data.phone ?? "");
        setDefaultPortfolioId(data.default_portfolio_id);
      }
      setLoading(false);
    })();
  }, [user]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq("id", user.id);
    setBusy(false);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else toast({ title: "Profile saved" });
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailValid) {
      toast({ title: "Invalid email", description: "Enter a valid email address before updating your account.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setBusy(false);
    if (error) toast({ title: "Could not update email", description: error.message, variant: "destructive" });
    else toast({ title: "Check your inbox", description: "Confirm the change from both your old and new email." });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await updatePassword(newPassword);
    setBusy(false);
    if (error) toast({ title: "Could not update password", description: error.message, variant: "destructive" });
    else { toast({ title: "Password updated" }); setNewPassword(""); }
  };

  const setAsDefault = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ default_portfolio_id: id }).eq("id", user.id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    setDefaultPortfolioId(id);
    toast({ title: "Default portfolio updated" });
  };

  const leavePortfolio = async (id: string) => {
    if (!user) return;
    const ok = window.confirm("Leave this portfolio? You'll lose access to its data.");
    if (!ok) return;
    const { error } = await supabase.from("portfolio_members").delete().match({ portfolio_id: id, user_id: user.id });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    await refresh();
    toast({ title: "Left portfolio" });
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <UserCircle className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Profile</h1>
      </div>
      <Separator />

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal info</TabsTrigger>
          <TabsTrigger value="security">Email & password</TabsTrigger>
          <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="fn">First name</Label><Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="ln">Last name</Label><Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="ph">Phone</Label><Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <Button type="submit" disabled={busy}>Save</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Email</CardTitle><CardDescription>Current: {user?.email}</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={changeEmail} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="ne">New email</Label><Input id="ne" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-invalid={!newEmailValid} required /></div>
                <Button type="submit" disabled={busy || !newEmailValid}>Update email</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Password</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="np">New password</Label><Input id="np" type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
                <Button type="submit" disabled={busy || newPassword.length < 8}>Update password</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolios" className="mt-4">
          <Card>
            <CardHeader><CardTitle>My portfolios</CardTitle><CardDescription>Portfolios you belong to.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {portfolios.map((p) => (
                <div key={p.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{p.name}</span>
                    <Badge variant="secondary" className="capitalize">{p.role}</Badge>
                    {defaultPortfolioId === p.id && <Badge variant="outline">Default</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {defaultPortfolioId !== p.id && (
                      <Button size="sm" variant="outline" onClick={() => setAsDefault(p.id)}>Set as default</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => leavePortfolio(p.id)}>Leave</Button>
                  </div>
                </div>
              ))}
              {portfolios.length === 0 && <p className="text-sm text-muted-foreground">You don't belong to any portfolio.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
