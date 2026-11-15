import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { OverrideProvider } from "@/context/OverrideContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { AuthProvider } from "@/context/AuthContext";
import { PortfolioProvider } from "@/context/PortfolioContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSettings } from "@/context/SettingsContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Properties = lazy(() => import("./pages/Properties"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const Units = lazy(() => import("./pages/Units"));
const UnitDetail = lazy(() => import("./pages/UnitDetail"));
const Tenants = lazy(() => import("./pages/Tenants"));
const TenantDetail = lazy(() => import("./pages/TenantDetail"));
const Leases = lazy(() => import("./pages/Leases"));
const LeaseDetail = lazy(() => import("./pages/LeaseDetail"));
const Payments = lazy(() => import("./pages/Payments"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const MaintenanceDetail = lazy(() => import("./pages/MaintenanceDetail"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorDetail = lazy(() => import("./pages/VendorDetail"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const CostCategories = lazy(() => import("./pages/CostCategories"));
const CostEntries = lazy(() => import("./pages/CostEntries"));
const AllocationRules = lazy(() => import("./pages/AllocationRules"));
const CostsAllocations = lazy(() => import("./pages/CostsAllocations"));
const Profile = lazy(() => import("./pages/Profile"));
const PortfolioSettings = lazy(() => import("./pages/PortfolioSettings"));
const Login = lazy(() => import("./pages/auth/Login"));
const Signup = lazy(() => import("./pages/auth/Signup"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/auth/AcceptInvite"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteFallback() {
  const { t } = useSettings();
  return <div role="status" className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">{t("common.loading")}</div>;
}

const App = () => (
  <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PortfolioProvider>
              <SettingsProvider>
              <AppProvider>
                <OverrideProvider>
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                    {/* Public auth routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/accept-invite/:token" element={<AcceptInvite />} />

                    {/* Protected app */}
                    <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/properties" element={<Properties />} />
                  <Route path="/properties/:id" element={<PropertyDetail />} />
                  <Route path="/units" element={<Units />} />
                  <Route path="/units/:id" element={<UnitDetail />} />
                  <Route path="/tenants" element={<Tenants />} />
                  <Route path="/tenants/:id" element={<TenantDetail />} />
                  <Route path="/leases" element={<Leases />} />
                  <Route path="/leases/:id" element={<LeaseDetail />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/maintenance" element={<Maintenance />} />
                  <Route path="/maintenance/:id" element={<MaintenanceDetail />} />
                  <Route path="/vendors" element={<Vendors />} />
                  <Route path="/vendors/:id" element={<VendorDetail />} />
                  <Route path="/costs" element={<CostEntries />} />
                  <Route path="/costs/categories" element={<CostCategories />} />
                  <Route path="/costs/entries" element={<CostEntries />} />
                  <Route path="/costs/rules" element={<AllocationRules />} />
                  <Route path="/costs/allocations" element={<CostsAllocations />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/portfolio/settings" element={<PortfolioSettings />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </OverrideProvider>
              </AppProvider>
              </SettingsProvider>
            </PortfolioProvider>
          </AuthProvider>
        </BrowserRouter>
  </TooltipProvider>
);

export default App;
