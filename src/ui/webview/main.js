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
    if (root) {
      root.innerHTML = message.html;
    }
  });
}());
