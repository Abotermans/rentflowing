import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlurSaveInput } from "@/components/shared/BlurSaveInput";

describe("BlurSaveInput", () => {
  it("keeps typing local and saves the complete value on blur", async () => {
    const onCommit = vi.fn().mockResolvedValue(true);
    render(<BlurSaveInput value="" ariaLabel="Identifier" onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Identifier" });

    fireEvent.change(input, { target: { value: "Key 12" } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Key 12");

    fireEvent.blur(input);
    await waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith("Key 12"));
  });

  it("restores the persisted value if saving fails", async () => {
    const onCommit = vi.fn().mockResolvedValue(false);
    render(<BlurSaveInput value="Original" ariaLabel="Identifier" onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Identifier" });

    fireEvent.change(input, { target: { value: "Unsaved" } });
    fireEvent.blur(input);
    await waitFor(() => expect(input).toHaveValue("Original"));
  });

  it("skips a write when the field is unchanged", () => {
    const onCommit = vi.fn();
    render(<BlurSaveInput value="Original" ariaLabel="Identifier" onCommit={onCommit} />);
    fireEvent.blur(screen.getByRole("textbox", { name: "Identifier" }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not commit a disabled field", () => {
    const onCommit = vi.fn();
    render(<BlurSaveInput value="Original" ariaLabel="Identifier" onCommit={onCommit} disabled />);
    const input = screen.getByRole("textbox", { name: "Identifier" });
    expect(input).toBeDisabled();
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
