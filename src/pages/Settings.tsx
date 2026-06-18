import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Globe, CalendarClock, LayoutGrid } from "lucide-react";
import { LOCALE_LABELS, type Locale } from "@/i18n/translations";
import { useToast } from "@/hooks/use-toast";
import { OPTIONAL_MODULES } from "@/config/modules";

export default function Settings() {
  const { locale, setLocale, t, receivableLeadDays, setReceivableLeadDays, isModuleHidden, setModuleHidden } = useSettings();
  const { toast } = useToast();

  const handleLocaleChange = (value: string) => {
    setLocale(value as Locale);
    toast({ title: t("settings.saved") });
  };

  const handleLeadDaysChange = (value: string) => {
    if (value === "") return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 120) return;
    setReceivableLeadDays(n);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
        </div>
      </div>

      <Separator />

      <div className="max-w-2xl space-y-6">
        {/* General Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.general")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.language")}</CardTitle>
              </div>
              <CardDescription>{t("settings.languageDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={locale} onValueChange={handleLocaleChange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {/* Receivables Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.receivables")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.receivableLeadDays")}</CardTitle>
              </div>
              <CardDescription>{t("settings.receivableLeadDaysDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  className="w-32"
                  value={receivableLeadDays}
                  onChange={(e) => handleLeadDaysChange(e.target.value)}
                  onBlur={() => toast({ title: t("settings.saved") })}
                />
                <span className="text-sm text-muted-foreground">{t("settings.daysBeforeDue")}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation / Modules visibility */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.navigation")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.modulesVisibility")}</CardTitle>
              </div>
              <CardDescription>{t("settings.modulesVisibilityDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {OPTIONAL_MODULES.map((mod, idx) => {
                const hidden = isModuleHidden(mod.key);
                const id = `module-toggle-${mod.key}`;
                return (
                  <div key={mod.key}>
                    {idx > 0 && <Separator className="my-2" />}
                    <div className="flex items-start justify-between gap-4 py-2">
                      <div className="min-w-0">
                        <Label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
                          {t(mod.labelKey)}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{t(mod.descriptionKey)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {hidden ? t("settings.moduleHidden") : t("settings.moduleVisible")}
                        </span>
                        <Switch
                          id={id}
                          checked={!hidden}
                          onCheckedChange={(checked) => {
                            setModuleHidden(mod.key, !checked);
                            toast({ title: t("settings.saved") });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
