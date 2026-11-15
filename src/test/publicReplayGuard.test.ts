// @vitest-environment node
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

describe("public replay guard", () => {
  it("blocks scripts in fragments and preserves replaceChild's return value", async () => {
    const source = await readFile(new URL("../../public/security/replay-guard.js", import.meta.url), "utf8");
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
    try {
      dom.window.eval(source);
      const { document } = dom.window;
      const container = document.createElement("div");
      const oldChild = document.createElement("span");
      container.appendChild(oldChild);
      const replay = document.createElement("script");
      replay.src = "/__l5e/recorder.js";
      const result = container.replaceChild(replay, oldChild);

      expect(result).toBe(oldChild);
      expect(container.firstChild).toBe(oldChild);
      expect(replay.hasAttribute("src")).toBe(false);

      const fragment = document.createDocumentFragment();
      const nestedReplay = document.createElement("script");
      nestedReplay.src = "/__l5e/fragment-recorder.js";
      const safe = document.createElement("span");
      safe.textContent = "safe";
      fragment.append(nestedReplay, safe);
      container.appendChild(fragment);

      expect(container.querySelector("script")).toBeNull();
      expect(container.textContent).toBe("safe");
      expect(dom.window.__RENTFLOW_REPLAY_GUARD__).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
