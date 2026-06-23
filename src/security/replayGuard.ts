const blockedReplaySignals = ["/__l5e/", "rrweb-record", "rrweb"];

function valueHasReplaySignal(value: unknown) {
  const text = String(value || "").toLowerCase();
  return blockedReplaySignals.some((signal) => text.includes(signal));
}

function isReplayScript(node: Node | null): node is HTMLScriptElement {
  if (!(node instanceof HTMLScriptElement)) return false;
  return (
    valueHasReplaySignal(node.getAttribute("src")) ||
    valueHasReplaySignal(node.getAttribute("data-replay")) ||
    valueHasReplaySignal(node.getAttribute("data-replay-url")) ||
    valueHasReplaySignal(node.getAttribute("data-replay-script-url"))
  );
}

function neutralizeReplayScript(node: Node | null) {
  if (!isReplayScript(node)) return false;
  node.type = "application/x-rentflow-blocked-replay";
  node.removeAttribute("src");
  node.removeAttribute("data-replay");
  node.removeAttribute("data-replay-url");
  node.removeAttribute("data-replay-script-url");
  node.remove();
  return true;
}

function scrubTree(node: Node | null) {
  if (!node) return false;
  const blocked = neutralizeReplayScript(node);
  if (node instanceof Element) {
    node.querySelectorAll("script").forEach(neutralizeReplayScript);
  }
  return blocked;
}

function wrapNodeInsertion(methodName: "appendChild" | "insertBefore" | "replaceChild") {
  const original = Node.prototype[methodName];
  Node.prototype[methodName] = function (...args: Parameters<typeof original>) {
    const node = args[0] as Node | null;
    if (scrubTree(node)) return node;
    return original.apply(this, args);
  } as typeof original;
}

export function installReplayGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__RENTFLOW_REPLAY_GUARD__) return;

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (
      this instanceof HTMLScriptElement &&
      /^(src|data-replay|data-replay-url|data-replay-script-url)$/i.test(name) &&
      valueHasReplaySignal(value)
    ) {
      this.type = "application/x-rentflow-blocked-replay";
      return;
    }
    return originalSetAttribute.apply(this, [name, value]);
  };

  wrapNodeInsertion("appendChild");
  wrapNodeInsertion("insertBefore");
  wrapNodeInsertion("replaceChild");

  scrubTree(document);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(scrubTree);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.__RENTFLOW_REPLAY_GUARD__ = true;
  document.documentElement.setAttribute("data-rentflow-replay-guard", "active");
}

declare global {
  interface Window {
    __RENTFLOW_REPLAY_GUARD__?: boolean;
  }
}
