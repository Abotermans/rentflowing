import { PRIORITY_ICONS, PRIORITY_CLASSES } from "@/lib/filterIcons";
import { MAINTENANCE_PRIORITY_KEYS, type MaintenancePriority } from "@/types/maintenance";
import { useSettings } from "@/context/SettingsContext";

export function PriorityLabel({ priority }: { priority: MaintenancePriority }) {
  const { t } = useSettings();
  const Icon = PRIORITY_ICONS[priority];
  const colorClass = PRIORITY_CLASSES[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {t(MAINTENANCE_PRIORITY_KEYS[priority])}
    </span>
  );
}