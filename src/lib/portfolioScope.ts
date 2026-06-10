/**
 * Seed mock data carries this sentinel portfolioId until the first real
 * portfolio loads and "claims" the demo dataset (one-time migration in
 * AppContext). After that, all entities carry a real portfolio id.
 */
export const DEMO_PORTFOLIO_ID = "__demo__";

/** localStorage key that records which real portfolio absorbed the demo seed. */
export const LS_DEMO_SEEDED_KEY = "demo:seededPortfolioId";