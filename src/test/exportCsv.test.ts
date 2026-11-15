import { describe, expect, it } from "vitest";
import { escapeCSVCell, serializeCSV } from "@/lib/exportCsv";

describe("CSV export", () => {
  it.each([
    ["=HYPERLINK(\"https://example.test\")", "'"],
    ["+SUM(1,2)", "'"],
    ["-1+2", "'"],
    ["@SUM(1,2)", "'"],
    [" \t=1+2", "'"],
    ["\r=1+2", "'"],
  ])("neutralizes a formula-leading value: %s", (value, prefix) => {
    expect(escapeCSVCell(value).replace(/^"|"$/g, "").startsWith(prefix)).toBe(true);
  });

  it("preserves ordinary text and escapes quotes, commas, and line breaks", () => {
    expect(serializeCSV(["Title", "Amount"], [
      ["Ordinary ticket", "1200 EUR"],
      ['Repair, "urgent"', "-100 EUR"],
      ["First\rSecond", "0"],
    ])).toBe('Title,Amount\nOrdinary ticket,1200 EUR\n"Repair, ""urgent""",\'-100 EUR\n"First\rSecond",0');
  });
});
