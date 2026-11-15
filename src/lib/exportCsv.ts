export function escapeCSVCell(value: string): string {
  // Spreadsheet applications can execute formulas even inside quoted CSV cells.
  const safeValue = /^[\s\uFEFF\u200B]*[=+\-@]/u.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue)) return `"${safeValue.replace(/"/g, '""')}"`;
  return safeValue;
}

export function serializeCSV(headers: string[], rows: string[][]): string {
  return [
    headers.map(escapeCSVCell).join(","),
    ...rows.map(row => row.map(escapeCSVCell).join(",")),
  ].join("\n");
}

export function exportToCSV(filename: string, headers: string[], rows: string[][]) {
  const csvContent = serializeCSV(headers, rows);
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
