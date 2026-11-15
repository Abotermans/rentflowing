import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MilliemeKeysInput } from "@/components/properties/MilliemeKeysInput";

function TestForm() {
  const [keys, setKeys] = useState(["general"]);
  return (
    <>
      <MilliemeKeysInput keys={keys} onChange={setKeys} />
      <output data-testid="keys">{keys.join("|")}</output>
    </>
  );
}

describe("millième key entry", () => {
  it("keeps the comma while typing and updates the form with the new key", () => {
    render(<TestForm />);
    const input = screen.getByPlaceholderText("general, lift, heating");

    fireEvent.change(input, { target: { value: "general," } });
    expect(input).toHaveValue("general,");
    fireEvent.change(input, { target: { value: "general, heating" } });
    expect(input).toHaveValue("general, heating");
    expect(screen.getByTestId("keys")).toHaveTextContent("general|heating");

    fireEvent.blur(input);
    expect(input).toHaveValue("general, heating");
  });

  it("retains the required general key and removes duplicate keys", () => {
    render(<TestForm />);
    const input = screen.getByPlaceholderText("general, lift, heating");

    fireEvent.change(input, { target: { value: "lift, lift" } });
    expect(input).toHaveValue("lift, lift");
    expect(screen.getByTestId("keys")).toHaveTextContent("general|lift");

    fireEvent.blur(input);
    expect(input).toHaveValue("general, lift");
  });
});
