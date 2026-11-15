import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogContent, FormDialogFooter } from "@/components/shared/FormDialog";
import { Button } from "@/components/ui/button";

let root: Root;
let container: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function mount(element: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(element));
}

describe("shared form dialogs", () => {
  it("keeps the header and actions outside the scrolling form body", () => {
    mount(
      <Dialog open>
        <FormDialogContent size="wide" className="overflow-y-auto p-6">
          <DialogHeader><DialogTitle>Add lease</DialogTitle></DialogHeader>
          <div><label htmlFor="reference">Reference</label><input id="reference" /></div>
          <FormDialogFooter><Button variant="outline">Cancel</Button><Button>Add lease</Button></FormDialogFooter>
        </FormDialogContent>
      </Dialog>,
    );
    const dialog = document.querySelector('[role="dialog"]')!;
    const body = dialog.querySelector('input')!.parentElement!.parentElement!;
    const footer = dialog.querySelector('[data-form-dialog-footer]')!;
    expect(body.className).toContain("overflow-y-auto");
    expect(body.contains(footer)).toBe(false);
    expect(body.contains(dialog.querySelector("h2"))).toBe(false);
    expect(footer.parentElement).toBe(dialog);
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).toContain("max-h-[90dvh]");
    expect(dialog.className).toContain("max-w-[1080px]");
    expect(dialog.className).toContain("w-[calc(100vw_-_2rem)]");
  });

  it("Cancel closes the dialog without submitting the form", () => {
    const save = vi.fn();
    function Example() {
      const [open, setOpen] = useState(true);
      return <Dialog open={open} onOpenChange={setOpen}>
        <FormDialogContent>
          <DialogHeader><DialogTitle>Create portfolio</DialogTitle></DialogHeader>
          <form id="test-form" onSubmit={event => { event.preventDefault(); save(); }}><input aria-label="Name" /></form>
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="test-form">Create</Button>
          </FormDialogFooter>
        </FormDialogContent>
      </Dialog>;
    }
    mount(<Example />);
    const buttons = Array.from(document.querySelectorAll("button"));
    act(() => buttons.find(button => button.textContent === "Create")!.click());
    expect(save).toHaveBeenCalledTimes(1);
    act(() => buttons.find(button => button.textContent === "Cancel")!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
