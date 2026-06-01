// Webview script for Claude Usage Monitor sidebar.
// Loaded via webview.asWebviewUri — NOT bundled by esbuild.
// CSP: script-src ${webview.cspSource} — no inline handlers.
//
// The extension host pre-renders the panel HTML (see sidebarView.ts
// renderUsagePanel) and posts it as { type: 'panel', html } messages.
// This script just swaps it into #usage-root.

(function () {
  'use strict';

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.type !== 'panel') return;

    var root = document.getElementById('usage-root');
    if (!root) return;

    // SAFETY: `message.html` is rendered server-side by renderUsagePanel
    // (src/ui/sidebarView.ts) which HTML-escapes every untrusted string
    // (session labels, ids, slugs). The webview CSP is
    // `default-src 'none'; script-src {cspSource}` — no inline scripts
    // can run even if a malicious string slipped past the escaper. The
    // webview only ever receives messages from the extension host
    // (webviewView.webview.postMessage), not from any cross-origin window.
    // CodeQL flags this as `js/xss-through-dom`; the alert is dismissed
    // per-instance in the Security tab as a known false-positive.
    root.innerHTML = message.html;
  });
}());
