import { supabase } from "@/integrations/supabase/client";

interface PortfolioCreation {
  id: string;
  name: string;
  created_by: string;
}

function matchesCreatedPortfolio(row: Partial<PortfolioCreation> | null, expected: PortfolioCreation): boolean {
  return row?.id === expected.id && row.name === expected.name && row.created_by === expected.created_by;
}

export async function createPortfolioConfirmed(expected: PortfolioCreation): Promise<string> {
  let insertError: Error | null = null;
  let inserted: Partial<PortfolioCreation> | null = null;
  try {
    const result = await supabase.from("portfolios")
      .insert(expected)
      .select("id,name,created_by")
      .single();
    insertError = result.error;
    inserted = result.data;
  } catch (error) {
    insertError = error instanceof Error ? error : new Error(String(error));
  }
  if (!insertError && matchesCreatedPortfolio(inserted, expected)) return expected.id;
  if (!insertError && inserted) {
    throw new Error("The database returned a different portfolio. Reload before retrying.");
  }

  let persisted: Partial<PortfolioCreation> | null = null;
  try {
    const result = await supabase.from("portfolios")
      .select("id,name,created_by")
      .eq("id", expected.id)
      .maybeSingle();
    if (result.error) throw result.error;
    persisted = result.data;
  } catch {
    throw new Error("Portfolio save outcome could not be verified. Reload before retrying with the same details.");
  }
  if (matchesCreatedPortfolio(persisted, expected)) return expected.id;
  if (persisted) {
    throw new Error("The saved portfolio differs from the requested details. Reload before retrying.");
  }
  throw insertError ?? new Error("The database did not confirm the new portfolio. Reload before retrying.");
}
