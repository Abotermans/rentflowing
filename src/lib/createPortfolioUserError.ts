type FunctionError = { message: string; context?: unknown };

export async function readCreatePortfolioUserError(error: FunctionError): Promise<string> {
  const context = error.context;
  if (!context || typeof context !== "object" || !("json" in context) || typeof context.json !== "function") {
    return error.message;
  }

  try {
    const payload: unknown = await context.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const body = payload as Record<string, unknown>;
      return typeof body.error === "string" && body.error ? body.error : error.message;
    }
  } catch {
    // Network and malformed responses fall back to the invocation error.
  }

  return error.message;
}
