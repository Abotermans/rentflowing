export function singleRowMutationError(
  error: { message: string } | null,
  rows: readonly { id: string }[] | null,
  action: string,
): string | null {
  if (error) return error.message;
  if (!Array.isArray(rows) || rows.length !== 1) {
    return `${action} did not change a row. It may have been removed or access was denied.`;
  }
  return null;
}
