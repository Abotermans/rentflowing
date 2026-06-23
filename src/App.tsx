import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { OverrideProvider } from "@/context/OverrideContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { AuthProvider } from "@/context/AuthContext";
import { PortfolioProvider } from "@/context/PortfolioContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Properties from "./pages/Properties";
import PropertyDetail from "./pages/PropertyDetail";
import Owners from "./pages/Owners";
import Listings from "./pages/Listings";
import Units from "./pages/Units";
import UnitDetail from "./pages/UnitDetail";
import Tenants from "./pages/Tenants";
import TenantDetail from "./pages/TenantDetail";
import Leases from "./pages/Leases";
import LeaseDetail from "./pages/LeaseDetail";
import Payments from "./pages/Payments";
import Maintenance from "./pages/Maintenance";
import MaintenanceDetail from "./pages/MaintenanceDetail";
import Vendors from "./pages/Vendors";
import VendorDetail from "./pages/VendorDetail";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import CostCategories from "./pages/CostCategories";
import CostEntries from "./pages/CostEntries";
import AllocationRules from "./pages/AllocationRules";
import CostsAllocations from "./pages/CostsAllocations";
import Profile from "./pages/Profile";
import PortfolioSettings from "./pages/PortfolioSettings";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import AcceptInvite from "./pages/auth/AcceptInvite";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient(); // force HMR refresh

const App = () => (
  <SettingsProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PortfolioProvider>
              <AppProvider>
                <OverrideProvider>
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
                  <Route path="/owners" element={<Owners />} />
                  <Route path="/listings" element={<Listings />} />
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
                </OverrideProvider>
              </AppProvider>
            </PortfolioProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </SettingsProvider>
);

export default App;
