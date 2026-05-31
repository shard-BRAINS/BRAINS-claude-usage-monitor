# Manual verification checklist

These steps cover behaviour that cannot be verified by the automated e2e smoke
tests due to VSCode API limitations (no public enumeration of status bar items,
no programmatic way to trigger a notification assert).

## 1 — Install the VSIX

```
code --install-extension BRAINS-claude-usage-monitor-0.1.0.vsix
```

Restart VSCode when prompted.

## 2 — Status bar and sidebar view

Open VSCode. Observe the bottom status bar shows a label of the form
`Claude <number>` with the appropriate colour:

- green when total tokens < warningTokens (default 100 000)
- yellow when total tokens >= warningTokens
- red when total tokens >= criticalTokens (default 160 000)

Open the "Claude Usage" activity-bar view in the left sidebar. Observe rows for
input / output / cache-read / cache-write tokens and a progress bar scaled to
the critical threshold.

With an active Claude Code session running in another VSCode window the values
should update within approximately two seconds of each new message.

## 3 — Once-per-session nudge

Configure `claudeUsageMonitor.criticalTokens` to a low value (for example
1 000) via File > Preferences > Settings. Interact with Claude Code until the
token total crosses that threshold. A non-modal "Start fresh chat" information
message should appear exactly once for that session.

Reload the VSCode window (`Developer: Reload Window` from the command palette)
and cross the threshold again. The nudge should fire once more, confirming that
the flag resets with the workspace state.
