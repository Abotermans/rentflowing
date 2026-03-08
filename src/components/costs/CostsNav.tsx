import { useNavigate, useLocation } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";

const tabs = [
  { key: "costs.categories" as const, path: "/costs/categories" },
  { key: "costs.entries" as const, path: "/costs/entries" },
  { key: "costs.allocationRules" as const, path: "/costs/rules" },
  { key: "costs.allocations" as const, path: "/costs/allocations" },
];

export function CostsNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useSettings();

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {t(tab.key)}
          </button>
        );
      })}
    </div>
  );
}
