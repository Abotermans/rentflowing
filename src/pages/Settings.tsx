import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Globe } from "lucide-react";
import { LOCALE_LABELS, type Locale } from "@/i18n/translations";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { locale, setLocale, t } = useSettings();
  const { toast } = useToast();

  const handleLocaleChange = (value: string) => {
    setLocale(value as Locale);
    toast({ title: t("settings.saved") });
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

        {/* Placeholder for future settings sections */}
      </div>
    </div>
  );
}
