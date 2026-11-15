import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrity", () => ({
  getDeletionImpact: () => ({ allowed: true, blockers: [], warnings: [] }),
}));
vi.mock("@/hooks/use-integrity-state", () => ({ useIntegrityState: () => ({}) }));

import { DeleteDialog } from "@/components/shared/DeleteDialog";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("DeleteDialog", () => {
  it("keeps the confirmation open when an asynchronous delete fails", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <DeleteDialog entityType="unit" entityId="unit-1" onDelete={async () => { throw new Error("Permission denied"); }} />,
    ));

    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Delete unit"]')?.click());
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Delete")?.click());

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Permission denied");
  });

  it("waits for a vendor deletion before closing a translated confirmation", async () => {
    let finishDelete!: () => void;
    const onDelete = vi.fn(() => new Promise<void>(resolve => { finishDelete = resolve; }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <DeleteDialog
        entityType="vendor"
        entityId="vendor-1"
        onDelete={onDelete}
        title="Supprimer le prestataire ?"
        description="Ce prestataire sera définitivement supprimé."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        pendingLabel="Suppression..."
      />,
    ));

    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Delete vendor"]')?.click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Supprimer le prestataire ?");
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Supprimer")?.click());

    expect(onDelete).toHaveBeenCalledWith("vendor-1");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Suppression...");
    await act(async () => finishDelete());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
