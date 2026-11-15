import { afterEach, describe, expect, it } from "vitest";
import { installReplayGuard } from "@/security/replayGuard";

const originalAppendChild = Node.prototype.appendChild;
const originalInsertBefore = Node.prototype.insertBefore;
const originalReplaceChild = Node.prototype.replaceChild;
const originalSetAttribute = Element.prototype.setAttribute;

afterEach(() => {
  Node.prototype.appendChild = originalAppendChild;
  Node.prototype.insertBefore = originalInsertBefore;
  Node.prototype.replaceChild = originalReplaceChild;
  Element.prototype.setAttribute = originalSetAttribute;
  delete window.__RENTFLOW_REPLAY_GUARD__;
  document.body.replaceChildren();
});

describe("replay guard", () => {
  it("removes replay scripts inside a fragment before insertion while preserving other nodes", () => {
    installReplayGuard();
    const container = document.createElement("div");
    const fragment = document.createDocumentFragment();
    const replay = document.createElement("script");
    replay.src = "/__l5e/recorder.js";
    const safe = document.createElement("span");
    safe.textContent = "safe";
    fragment.append(replay, safe);

    container.appendChild(fragment);

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("safe");
    expect(replay.type).toBe("application/x-rentflow-blocked-replay");
    expect(replay.hasAttribute("src")).toBe(false);
  });
});
