import { usePortfolio } from "@/context/PortfolioContext";

export function canWritePortfolioData(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function usePortfolioWriteAccess(): boolean {
  const { currentPortfolio } = usePortfolio();
  return canWritePortfolioData(currentPortfolio?.role);
}
