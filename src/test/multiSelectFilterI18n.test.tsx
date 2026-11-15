import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTranslation } from "@/i18n/translations";
import type { Locale, TranslationKey } from "@/i18n/translations";

const mock = vi.hoisted(() => ({ locale: "en" as Locale }));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ t: (key: TranslationKey) => getTranslation(mock.locale, key) }),
}));

import { MultiSelectFilter } from "@/components/ui/multi-select-filter";

describe("multi-select filter translations", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it.each([
    { locale: "en" as Locale, search: "Search…", selectAll: "Select all", clear: "Clear", empty: "No results found" },
    { locale: "fr" as Locale, search: "Rechercher…", selectAll: "Tout sélectionner", clear: "Effacer", empty: "Aucun résultat" },
  ])("uses $locale labels for the shared filter menu", ({ locale, search, selectAll, clear, empty }) => {
    mock.locale = locale;
    const onChange = vi.fn();
    const props = { label: "Status", options: [{ value: "open", label: "Open" }], onChange };
    const { rerender } = render(<MultiSelectFilter {...props} values={[]} />);

    fireEvent.click(screen.getByText("Status"));
    expect(screen.getByRole("button", { name: selectAll })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: clear })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(search), { target: { value: "missing" } });
    expect(screen.getByText(empty)).toBeInTheDocument();

    rerender(<MultiSelectFilter {...props} values={["open"]} />);
    expect(screen.getByRole("combobox", { name: "Status (1)" })).toBeInTheDocument();
    const clearButton = screen.getByRole("button", { name: `${clear} Status` });
    expect(clearButton.tagName).toBe("BUTTON");
    expect(clearButton).toHaveAttribute("type", "button");
    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
