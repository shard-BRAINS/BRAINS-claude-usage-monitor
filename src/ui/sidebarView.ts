import * as vscode from 'vscode';
import type { TranscriptWatcher } from '../transcripts/watcher';
import type { HoverCardData } from './hoverCard';
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
      ? `Oldest rolls off in ${countdownFormat(session.nextResetAt - nowMs)}`
      : 'Oldest rolls off in —';

  const weeklyResetStr =
    weekly.nextResetAt !== undefined
      ? `Oldest rolls off in ${countdownFormat(weekly.nextResetAt - nowMs)}`
      : 'Oldest rolls off in —';

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

  <h4 class="panel-subtitle">Recently active sessions (last 5)</h4>
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
    private readonly getHoverData: () => HoverCardData,
  ) {}

  private _postPanel(): void {
    if (this._webview === undefined) return;
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

    const listener = (): void => {
      this._postPanel();
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

    // CSP: deny everything by default; allow only same-origin (webview) style and script.
    // SVG progress bars are inlined as <svg> markup, so no img-src is needed.
    // 'unsafe-inline' on style-src-attr permits VS Code's themed inline style
    // attributes that the sparkline/progress fragments use; it's scoped to
    // attributes, not <style> blocks.
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource}`,
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
    <div class="usage-panel"><div class="panel-row muted">Loading…</div></div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
