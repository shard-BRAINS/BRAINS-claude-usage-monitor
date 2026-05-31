// Webview script for Claude Usage Monitor sidebar.
// Loaded via webview.asWebviewUri — NOT bundled by esbuild.
// CSP: script-src ${webview.cspSource} — no inline handlers.

(function () {
  'use strict';

  function commaFormat(n) {
    return Number(n).toLocaleString('en-US');
  }

  function percentLabel(used, limit) {
    if (limit === null || limit === undefined) return 'n/a';
    if (used > limit) return '>100%';
    return (used / limit * 100).toFixed(1) + '%';
  }

  function progressWidthPct(used, limit) {
    if (!limit || limit <= 0) return '0%';
    return Math.min(Math.round(used / limit * 100), 100) + '%';
  }

  function relativeTime(nowMs, thenMs) {
    var diffMs = nowMs - thenMs;
    var diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return diffSec + 's ago';
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + 'm ago';
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    return Math.floor(diffHr / 24) + 'd ago';
  }

  function countdownFormat(remainingMs) {
    if (remainingMs <= 0) return 'Reset due';
    var totalMin = Math.floor(remainingMs / 60000);
    if (totalMin < 60) return totalMin + 'm';
    var hours = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    return hours + 'h ' + mins + 'm';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderHoverData(data) {
    var session = data.session;
    var weekly = data.weekly;
    var thisWindow = data.thisWindow;
    var allSessions = data.allSessions || [];
    var nowMs = data.nowMs || Date.now();

    var sessionResetStr = session.nextResetAt != null
      ? 'Reset in ' + countdownFormat(session.nextResetAt - nowMs)
      : 'Reset in —';

    var weeklyResetStr = weekly.nextResetAt != null
      ? 'Reset in ' + countdownFormat(weekly.nextResetAt - nowMs)
      : 'Reset in —';

    var html = '<div class="usage-panel">';
    html += '<h3 class="panel-title">Claude Usage</h3>';

    // Session window
    html += '<div class="window-section">';
    html += '<div class="panel-row">';
    html += '<span class="label">' + escapeHtml(session.windowLabel) + '</span>';
    html += '<span class="value">' + commaFormat(session.used) + ' tokens &middot; ' + percentLabel(session.used, session.limit) + ' &middot; ' + sessionResetStr + '</span>';
    html += '</div>';
    html += '<div class="progress"><div class="progress-fill" style="width:' + progressWidthPct(session.used, session.limit) + '"></div></div>';
    html += '</div>';

    // Weekly window
    html += '<div class="window-section">';
    html += '<div class="panel-row">';
    html += '<span class="label">' + escapeHtml(weekly.windowLabel) + '</span>';
    html += '<span class="value">' + commaFormat(weekly.used) + ' tokens &middot; ' + percentLabel(weekly.used, weekly.limit) + ' &middot; ' + weeklyResetStr + '</span>';
    html += '</div>';
    html += '<div class="progress"><div class="progress-fill" style="width:' + progressWidthPct(weekly.used, weekly.limit) + '"></div></div>';
    html += '</div>';

    html += '<hr>';
    html += '<h4 class="panel-subtitle">This window</h4>';

    if (thisWindow) {
      var idTail = thisWindow.sessionId.length > 8 ? thisWindow.sessionId.slice(-8) : thisWindow.sessionId;
      var cacheDenom = (thisWindow.cacheRead || 0) + (thisWindow.cacheCreate || 0);
      var cacheRatio = cacheDenom > 0 ? ((thisWindow.cacheRead / cacheDenom) * 100).toFixed(1) + '%' : 'n/a';
      var lastActivity = thisWindow.lastModified
        ? relativeTime(nowMs, new Date(thisWindow.lastModified).getTime())
        : 'unknown';

      html += '<div class="panel-row"><span class="label">Session</span><code>' + escapeHtml(idTail) + '</code></div>';
      html += '<div class="panel-row"><span class="label">Cumulative</span><span class="value">' + commaFormat(thisWindow.total) + ' tokens</span></div>';
      html += '<div class="panel-row"><span class="label">Last turn input</span><span class="value">' + commaFormat(thisWindow.lastTurnInput || 0) + '</span></div>';
      html += '<div class="panel-row"><span class="label">Last turn output</span><span class="value">' + commaFormat(thisWindow.lastTurnOutput || 0) + '</span></div>';
      html += '<div class="panel-row"><span class="label">Cache hit</span><span class="value">' + cacheRatio + '</span></div>';
      html += '<div class="panel-row"><span class="label">Last activity</span><span class="value">' + lastActivity + '</span></div>';
    } else {
      html += '<div class="panel-row muted">No session found for this workspace</div>';
    }

    html += '<hr>';
    html += '<h4 class="panel-subtitle">All sessions (last 5 by activity)</h4>';

    var top5 = allSessions.slice(0, 5);
    if (top5.length === 0) {
      html += '<div class="panel-row muted">No sessions found</div>';
    } else {
      top5.forEach(function (s) {
        var idTail = s.sessionId.length > 8 ? s.sessionId.slice(-8) : s.sessionId;
        var activityStr = relativeTime(nowMs, s.lastActivityMs);
        html += '<div class="panel-row session-item">';
        html += '<span class="label"><code>' + escapeHtml(s.label) + '</code> / <code>' + escapeHtml(idTail) + '</code></span>';
        html += '<span class="value">' + commaFormat(s.total) + ' &middot; ' + activityStr + '</span>';
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message) return;

    if (message.type === 'panel') {
      // Pre-rendered panel HTML from the extension (includes SVG bars + sparkline).
      var root = document.getElementById('usage-root');
      if (root) {
        root.innerHTML = message.html;
      }
      return;
    }

    if (message.type === 'hoverData') {
      // Legacy client-side renderer (kept for backward compat with older extension hosts).
      var root2 = document.getElementById('usage-root');
      if (root2) {
        root2.innerHTML = renderHoverData(message.data);
      }
      return;
    }

    if (message.type === 'totals') {
      // Legacy format — update individual value spans
      var totals = message.totals;
      var thresholds = message.thresholds;

      var mapping = {
        input: totals.input,
        output: totals.output,
        'cache-read': totals.cacheRead,
        'cache-create': totals.cacheCreate,
        total: totals.total,
      };

      Object.keys(mapping).forEach(function (key) {
        var el = document.getElementById('value-' + key);
        if (el) {
          el.textContent = commaFormat(mapping[key]);
        }
      });

      var fill = document.getElementById('progress-fill');
      if (fill) {
        var pct = thresholds.critical > 0
          ? Math.min(Math.max(totals.total / thresholds.critical * 100, 0), 100)
          : 0;
        fill.style.width = pct + '%';
      }
    }
  });
}());
