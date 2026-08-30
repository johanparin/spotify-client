# 006: Electron desktop shell

## Question

Given the validated loopback-served interaction proof, when it is wrapped in a minimal Electron shell, does it behave like a useful compact macOS controller without exposing Spotify credentials to the renderer?

## Approach

Run the existing Node server on an ephemeral loopback port inside Electron's main process and load it into a sandboxed `BrowserWindow`. Keep context isolation enabled, Node integration disabled, new windows denied, and navigation constrained to the loopback origin.

This spike deliberately defers the global show/hide shortcut. It begins with standard macOS window lifecycle behavior and no always-on-top default.

Run it with:

```text
npm run desktop
```

## Evidence

- Electron 44.0.0 installed locally with no npm audit vulnerabilities.
- The real Electron process opened the controller from an ephemeral loopback port without browser chrome.
- CDP inspection found the expected title and compact controller DOM.
- The playlist chooser loaded all 54 available playlists inside Electron.
- Live selection started `Pop Hits` on the inactive local `JohansMacBookM1` Spotify Connect device, and the Electron view reconciled to its 37-track context. Johan then confirmed Enter and double-click playlist selection in the Electron window. The controller now selects an active device first, otherwise the device matching the local hostname, and refuses to guess between unrelated inactive devices.
- Both `process` and `require` were undefined in the renderer, confirming that Node integration remains unavailable there.
- The existing controller and interaction suite passes all 15 tests, including ephemeral server startup and deterministic device selection.
- Johan confirmed that the layout remains usable while resizing and that closing the window followed by clicking the Electron Dock icon recreates it.
- A normal application quit exited with status zero and closed the ephemeral loopback listener.

## Verdict: VALIDATED

The existing controller works as a compact, resizable macOS Electron application with a sandboxed renderer, standard close and Dock-reactivation behavior, and clean process shutdown. Global show/hide shortcuts and always-on-top behavior remain deliberately deferred product features rather than blockers for the shell architecture.
