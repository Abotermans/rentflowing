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
  if (node instanceof Element || node instanceof DocumentFragment || node instanceof Document) {
    node.querySelectorAll("script").forEach(neutralizeReplayScript);
  }
  return blocked;
}

function wrapNodeInsertions() {
  const originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function <T extends Node>(node: T): T {
    if (scrubTree(node)) return node;
    return originalAppendChild.call(this, node) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
    if (scrubTree(node)) return node;
    return originalInsertBefore.call(this, node, child) as T;
  };

  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function <T extends Node>(node: Node, child: T): T {
    if (scrubTree(node)) return child;
    return originalReplaceChild.call(this, node, child) as T;
  };
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

  wrapNodeInsertions();

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
