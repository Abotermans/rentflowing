import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function mount(element: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')!;
}

describe("dialog viewport constraints", () => {
  it("keeps standard dialog content scrollable within the viewport", () => {
    const dialog = mount(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Details</DialogTitle>
          <div>Long content</div>
        </DialogContent>
      </Dialog>,
    );

    expect(dialog.className).toContain("max-h-[90dvh]");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("overscroll-contain");
  });

  it("keeps confirmation actions reachable when content grows", () => {
    const dialog = mount(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm change</AlertDialogTitle>
          <AlertDialogDescription>Review the change before confirming.</AlertDialogDescription>
          <button>Confirm</button>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(dialog.className).toContain("max-h-[90dvh]");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("overscroll-contain");
    expect(dialog.querySelector("button")?.textContent).toBe("Confirm");
  });
});
