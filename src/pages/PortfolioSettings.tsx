import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Trash2, Mail, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolio } from "@/context/PortfolioContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isValidEmail } from "@/lib/validation";

type Role = "owner" | "admin" | "editor" | "viewer";

export default function PortfolioSettings() {
  const { currentPortfolio, currentPortfolioId, refresh } = usePortfolio();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const callerRole = currentPortfolio?.role as Role | undefined;
  const isOwner = callerRole === "owner";
  const canManage = isOwner || callerRole === "admin";

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [locale, setLocale] = useState("en");
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);

  // Add-member form
  const [newEmail, setNewEmail] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");
  const [addBusy, setAddBusy] = useState(false);
  const inviteEmailValid = inviteEmail.trim().length > 0 && isValidEmail(inviteEmail);
  const newEmailValid = newEmail.trim().length > 0 && isValidEmail(newEmail);
  const canAddMember = newEmailValid && newPassword.length >= 8 && !addBusy;

  // Delete portfolio
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!currentPortfolio) return;
    setName(currentPortfolio.name);
    setCurrency(currentPortfolio.default_currency);
    setLocale(currentPortfolio.default_locale);
  }, [currentPortfolio]);

  const loadMembers = async () => {
    if (!currentPortfolioId) return;
    const { data } = await supabase
      .from("portfolio_members")
      .select("id, user_id, role, joined_at")
      .eq("portfolio_id", currentPortfolioId);
    setMembers(data ?? []);
    const { data: invs } = await supabase
      .from("portfolio_invitations")
      .select("*")
      .eq("portfolio_id", currentPortfolioId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setInvites(invs ?? []);
  };

  useEffect(() => { loadMembers(); }, [currentPortfolioId]);

  if (!currentPortfolio) return <div className="text-sm text-muted-foreground">No portfolio selected.</div>;

  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("portfolios")
      .update({ name, default_currency: currency, default_locale: locale })
      .eq("id", currentPortfolio.id);
    setBusy(false);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else { toast({ title: "Portfolio updated" }); refresh(); }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentPortfolioId) return;
    if (!inviteEmailValid) {
      toast({ title: "Invalid email", description: "Enter a valid email address before creating an invitation.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("portfolio_invitations").insert({
      portfolio_id: currentPortfolioId,
      email: inviteEmail,
      role: inviteRole,
      invited_by: user.id,
    });
    setBusy(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Invitation created", description: "Copy the link from the list and share it with them." });
    setInviteEmail("");
    loadMembers();
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from("portfolio_invitations").delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    loadMembers();
  };

  const removeMember = async (id: string, userId: string) => {
    if (userId === user?.id) { toast({ title: "Use 'Leave' from your profile.", variant: "destructive" }); return; }
    const { error } = await supabase.from("portfolio_members").delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    loadMembers();
  };

  const changeRole = async (id: string, role: Role) => {
    const { error } = await supabase.from("portfolio_members").update({ role }).eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    loadMembers();
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPortfolioId) return;
    if (!newEmailValid) {
      toast({ title: "Invalid email", description: "Enter a valid email address before adding a member.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Member passwords must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setAddBusy(true);
    const { data, error } = await supabase.functions.invoke("create-portfolio-user", {
      body: {
        portfolio_id: currentPortfolioId,
        email: newEmail,
        password: newPassword,
        role: newRole,
        first_name: newFirst || null,
        last_name: newLast || null,
      },
    });
    setAddBusy(false);
    if (error) {
      toast({ title: "Could not add member", description: error.message, variant: "destructive" });
      return;
    }
    const resp = data as { created?: boolean; email?: string };
    toast({
      title: resp?.created ? "User created & added" : "Existing user added",
      description: resp?.created
        ? `Share the password with ${resp.email}. They can sign in immediately.`
        : `${resp?.email} now has access to this portfolio.`,
    });
    setNewEmail(""); setNewFirst(""); setNewLast(""); setNewPassword(""); setNewRole("editor");
    loadMembers();
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/accept-invite/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  const deletePortfolio = async () => {
    if (!currentPortfolio) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("portfolios").delete().eq("id", currentPortfolio.id);
    setDeleteBusy(false);
    if (error) {
      toast({ title: "Could not delete portfolio", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Portfolio deleted" });
    setDeleteOpen(false);
    setDeleteConfirm("");
    await refresh();
    navigate("/");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Briefcase className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Portfolio settings</h1>
      </div>
      <Separator />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader><CardTitle>General</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveGeneral} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="pn">Name</Label><Input id="pn" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Default currency</Label>
                    <Select value={currency} onValueChange={setCurrency} disabled={!canManage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="CHF">CHF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Default language</Label>
                    <Select value={locale} onValueChange={setLocale} disabled={!canManage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={busy || !canManage}>Save</Button>
              </form>
            </CardContent>
          </Card>

          {isOwner && (
            <Card className="mt-4 border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive">Danger zone</CardTitle>
                <CardDescription>
                  Permanently delete this portfolio and all of its data (properties, units, leases, tenants, payments, etc.). This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(""); }}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete portfolio
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this portfolio?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete <strong>{currentPortfolio.name}</strong> and every record it contains. This cannot be undone.
                        <br /><br />
                        To confirm, type the portfolio name below:
                        <span className="block font-mono mt-1">{currentPortfolio.name}</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="Type portfolio name to confirm"
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={deleteBusy || deleteConfirm !== currentPortfolio.name}
                        onClick={(e) => { e.preventDefault(); deletePortfolio(); }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteBusy ? "Deleting…" : "Delete portfolio"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Members</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-muted-foreground border rounded-md p-3 mb-2 leading-relaxed">
                <strong>Owner</strong> — full control, including deleting the portfolio and managing other owners.{" "}
                <strong>Admin</strong> — manage settings, members, and all data, but cannot delete the portfolio or touch owners.{" "}
                <strong>Editor</strong> — edit business data.{" "}
                <strong>Viewer</strong> — read-only.
              </div>
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{m.user_id === user?.id ? (user?.email ?? "You") : "Portfolio member"}</span>
                    {m.user_id === user?.id && <Badge variant="outline">You</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage && m.user_id !== user?.id && !(m.role === "owner" && !isOwner) ? (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as Role)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                    )}
                    {canManage && m.user_id !== user?.id && !(m.role === "owner" && !isOwner) && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeMember(m.id, m.user_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {canManage && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Add a member</CardTitle>
                <CardDescription>Create a new user with a password and add them to this portfolio. They can sign in immediately with the credentials you set.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={addMember} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="ne">Email</Label>
                      <Input id="ne" type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-invalid={!newEmailValid} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nf">First name</Label>
                      <Input id="nf" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nl">Last name</Label>
                      <Input id="nl" value={newLast} onChange={(e) => setNewLast(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="np">Password (min 8 chars)</Label>
                      <Input id="np" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" disabled={!canAddMember}>{addBusy ? "Adding…" : "Create & add"}</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invitations" className="mt-4 space-y-4">
          {canManage && (
            <Card>
              <CardHeader><CardTitle>Invite by email</CardTitle><CardDescription>The invitee opens the link and joins your portfolio.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={sendInvite} className="flex gap-2">
                  <Input type="email" placeholder="email@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} aria-invalid={!inviteEmailValid} required />
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={busy || !inviteEmailValid}><Mail className="h-4 w-4 mr-2" />Invite</Button>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Pending invitations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {invites.length === 0 && <p className="text-sm text-muted-foreground">No pending invitations.</p>}
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="capitalize">{i.role}</span> · expires {new Date(i.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyInviteLink(i.token)}><Copy className="h-3.5 w-3.5 mr-1" />Copy link</Button>
                    {canManage && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => revokeInvite(i.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
