import * as vscode from 'vscode';
import type { TranscriptWatcher } from '../transcripts/watcher';
import type { SessionTotals } from '../transcripts/types';
import type { ThresholdsGetter } from './statusBar';
import type { HoverCardData } from './hoverCard';

// ---------------------------------------------------------------------------
// Legacy pure rendering helper — kept for backward compat with sidebarView.test.ts
// ---------------------------------------------------------------------------

/** Row keys that map to SessionTotals fields. */
const ROW_KEYS: Array<{ key: string; field: keyof SessionTotals }> = [
  { key: 'input', field: 'input' },
  { key: 'output', field: 'output' },
  { key: 'cache-read', field: 'cacheRead' },
  { key: 'cache-create', field: 'cacheCreate' },
  { key: 'total', field: 'total' },
];

/**
 * Pure helper: compute formatted row values and progress bar width from
 * totals + thresholds.  Returned values are ready to inject into the DOM.
 */
export function renderRows(
  totals: SessionTotals,
  thresholds: { warning: number; critical: number },
): { rows: Record<string, string>; progressWidthPercent: string } {
  const rows: Record<string, string> = {};
  for (const { key, field } of ROW_KEYS) {
    rows[key] = (totals[field] as number).toLocaleString('en-US');
  }

  const raw = thresholds.critical > 0 ? (totals.total / thresholds.critical) * 100 : 0;
  const clamped = Math.min(Math.max(raw, 0), 100);
  const progressWidthPercent = `${Math.round(clamped)}%`;

  return { rows, progressWidthPercent };
}

// ---------------------------------------------------------------------------
// New panel renderer — produces HTML fragments mirroring the hover card
// ---------------------------------------------------------------------------

import { commaFormat, relativeTime, countdownFormat, percentageLabel as percentLabel } from './formatters';
import { renderProgressBarSvg, renderSparklineSvg } from './svg';

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Produces HTML fragments for the usage panel, mirroring the hover card structure.
 * Exported for unit testing.
 */
export function renderUsagePanel(data: HoverCardData): string {
  const { session, weekly, thisWindow, allSessions, nowMs } = data;

  const sessionResetStr =
    session.nextResetAt !== undefined
      ? `Reset in ${countdownFormat(session.nextResetAt - nowMs)}`
      : 'Reset in —';

  const weeklyResetStr =
    weekly.nextResetAt !== undefined
      ? `Reset in ${countdownFormat(weekly.nextResetAt - nowMs)}`
      : 'Reset in —';

  const sessionBarSvg = renderProgressBarSvg(session.used, session.limit, 220, 12);
  const weeklyBarSvg = renderProgressBarSvg(weekly.used, weekly.limit, 220, 12);
  const sparklineSvg = data.sparkline !== undefined
    ? renderSparklineSvg(data.sparkline, 220, 32)
    : '';

  let thisWindowHtml: string;
  if (thisWindow !== undefined) {
    const idTail = thisWindow.sessionId.length > 8
      ? thisWindow.sessionId.slice(-8)
      : thisWindow.sessionId;
    const cacheDenom = thisWindow.cacheRead + thisWindow.cacheCreate;
    const cacheRatioStr =
      cacheDenom > 0 ? `${((thisWindow.cacheRead / cacheDenom) * 100).toFixed(1)}%` : 'n/a';
    const lastActivityStr = relativeTime(nowMs, thisWindow.lastModified.getTime());

    thisWindowHtml = `
      <div class="panel-row"><span class="label">Session</span><code>${escape(idTail)}</code></div>
      <div class="panel-row"><span class="label">Cumulative</span><span class="value">${commaFormat(thisWindow.total)} tokens</span></div>
      <div class="panel-row"><span class="label">Last turn input</span><span class="value">${commaFormat(thisWindow.lastTurnInput)}</span></div>
      <div class="panel-row"><span class="label">Last turn output</span><span class="value">${commaFormat(thisWindow.lastTurnOutput)}</span></div>
      <div class="panel-row"><span class="label">Cache hit</span><span class="value">${cacheRatioStr}</span></div>
      <div class="panel-row"><span class="label">Last activity</span><span class="value">${lastActivityStr}</span></div>
    `;
  } else {
    thisWindowHtml = `<div class="panel-row muted">No session found for this workspace</div>`;
  }

  const top5 = allSessions.slice(0, 5);
  const sessionListHtml = top5.length === 0
    ? `<div class="panel-row muted">No sessions found</div>`
    : top5.map((s) => {
        const idTail = s.sessionId.length > 8 ? s.sessionId.slice(-8) : s.sessionId;
        const activityStr = relativeTime(nowMs, s.lastActivityMs);
        return `<div class="panel-row session-item">
          <span class="label"><code>${escape(s.label)}</code> / <code>${escape(idTail)}</code></span>
          <span class="value">${commaFormat(s.total)} · ${activityStr}</span>
        </div>`;
      }).join('\n');

  return `
<div class="usage-panel">
  <h3 class="panel-title">Claude Usage</h3>

  <div class="window-section">
    <div class="panel-row">
      <span class="label">${escape(session.windowLabel)}</span>
      <span class="value">${commaFormat(session.used)} tokens &middot; ${percentLabel(session.used, session.limit)} &middot; ${sessionResetStr}</span>
    </div>
    <div class="progress-row">${sessionBarSvg}</div>
  </div>

  <div class="window-section">
    <div class="panel-row">
      <span class="label">${escape(weekly.windowLabel)}</span>
      <span class="value">${commaFormat(weekly.used)} tokens &middot; ${percentLabel(weekly.used, weekly.limit)} &middot; ${weeklyResetStr}</span>
    </div>
    <div class="progress-row">${weeklyBarSvg}</div>
  </div>

  ${sparklineSvg !== '' ? `<div class="window-section">
    <div class="panel-row"><span class="label">Last hour</span></div>
    <div class="progress-row">${sparklineSvg}</div>
  </div>` : ''}

  <hr>

  <h4 class="panel-subtitle">This window</h4>
  ${thisWindowHtml}

  <hr>

  <h4 class="panel-subtitle">All sessions (last 5 by activity)</h4>
  ${sessionListHtml}
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// WebviewViewProvider
// ---------------------------------------------------------------------------

export class UsageSidebarProvider implements vscode.WebviewViewProvider {
  private _webview: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly watcher: TranscriptWatcher,
    private readonly getThresholds: ThresholdsGetter,
    private readonly getHoverData?: () => HoverCardData,
  ) {}

  private _postPanel(): void {
    if (this._webview === undefined || this.getHoverData === undefined) {
      return;
    }
    void this._webview.webview.postMessage({
      type: 'panel',
      html: renderUsagePanel(this.getHoverData()),
    });
  }

  public refresh(): void {
    this._postPanel();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._webview = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    const listener = (totals: SessionTotals): void => {
      if (this.getHoverData !== undefined) {
        this._postPanel();
      } else {
        void webviewView.webview.postMessage({
          type: 'totals',
          totals,
          thresholds: this.getThresholds(),
        });
      }
    };

    this.watcher.on('change', listener);

    webviewView.onDidDispose(() => {
      this._webview = undefined;
      this.watcher.off('change', listener);
    });
  }

  // ---------------------------------------------------------------------------
  // Private: HTML shell
  // ---------------------------------------------------------------------------

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'style.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'),
    );

    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `script-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} https: data:`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Claude Usage</title>
</head>
<body>
  <div id="usage-root">
    <div class="container">
      <div class="row row-input">
        <span class="label">Input</span>
        <span class="value" id="value-input">0</span>
      </div>
      <div class="row row-output">
        <span class="label">Output</span>
        <span class="value" id="value-output">0</span>
      </div>
      <div class="row row-cache-read">
        <span class="label">Cache read</span>
        <span class="value" id="value-cache-read">0</span>
      </div>
      <div class="row row-cache-create">
        <span class="label">Cache create</span>
        <span class="value" id="value-cache-create">0</span>
      </div>
      <div class="row row-total">
        <span class="label">Total</span>
        <span class="value" id="value-total">0</span>
      </div>
      <div class="progress">
        <div class="progress-fill" id="progress-fill" style="width:0%"></div>
      </div>
    </div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
