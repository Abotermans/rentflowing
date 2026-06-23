(function () {
  var blockedSignals = ["/__l5e/", "rrweb-record", "rrweb"];

  function valueHasReplaySignal(value) {
    var text = String(value || "").toLowerCase();
    return blockedSignals.some(function (signal) {
      return text.indexOf(signal) !== -1;
    });
  }

  function isReplayScript(node) {
    if (!node || node.nodeType !== 1 || String(node.tagName).toLowerCase() !== "script") return false;
    return (
      valueHasReplaySignal(node.getAttribute("src")) ||
      valueHasReplaySignal(node.getAttribute("data-replay")) ||
      valueHasReplaySignal(node.getAttribute("data-replay-url")) ||
      valueHasReplaySignal(node.getAttribute("data-replay-script-url"))
    );
  }

  function neutralizeReplayScript(node) {
    if (!isReplayScript(node)) return false;
    node.type = "application/x-rentflow-blocked-replay";
    node.removeAttribute("src");
    node.removeAttribute("data-replay");
    node.removeAttribute("data-replay-url");
    node.removeAttribute("data-replay-script-url");
    if (node.parentNode) node.parentNode.removeChild(node);
    return true;
  }

  function scrubTree(node) {
    if (!node) return false;
    var blocked = neutralizeReplayScript(node);
    if (node.querySelectorAll) {
      node.querySelectorAll("script").forEach(neutralizeReplayScript);
    }
    return blocked;
  }

  function wrapNodeInsertion(methodName) {
    var original = Node.prototype[methodName];
    if (!original) return;
    Node.prototype[methodName] = function () {
      var node = arguments[0];
      if (scrubTree(node)) return node;
      return original.apply(this, arguments);
    };
  }

  var originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (
      String(this.tagName).toLowerCase() === "script" &&
      /^(src|data-replay|data-replay-url|data-replay-script-url)$/i.test(name) &&
      valueHasReplaySignal(value)
    ) {
      this.type = "application/x-rentflow-blocked-replay";
      return;
    }
    return originalSetAttribute.apply(this, arguments);
  };

  wrapNodeInsertion("appendChild");
  wrapNodeInsertion("insertBefore");
  wrapNodeInsertion("replaceChild");

  scrubTree(document);
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(scrubTree);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.__RENTFLOW_REPLAY_GUARD__ = true;
  document.documentElement.setAttribute("data-rentflow-replay-guard", "active");
})();
