# Architecture

Trackside is a compact macOS controller for playback occurring on Spotify Connect devices. It does not stream or embed audio.

## Process boundaries

Electron's main process owns Spotify authorization, credentials, Web API requests, playback commands, context caching, and error recovery. The sandboxed React renderer owns presentation, selection, keyboard interaction, and optimistic interface updates.

The preload script exposes a narrow typed controller API through Electron IPC. It does not expose Node.js, arbitrary HTTP requests, access tokens, refresh tokens, filesystem access, or shell execution to the renderer. Every IPC payload is validated again in the main process.

```text
React renderer
      │ typed controller operations
      ▼
context-isolated preload
      │ validated Electron IPC
      ▼
main-process controller
      ├── Spotify Web API
      └── macOS Keychain
```

## Authentication

Authorization uses the OAuth Authorization Code flow with PKCE. The public Client ID and refresh token are stored in macOS Keychain. Access tokens remain in memory in the main process and are never sent to the renderer.

The system browser handles Spotify sign-in. A short-lived callback listener binds to `127.0.0.1`, checks the callback path and random OAuth state, and closes after authorization or timeout. The application never requests a client secret.

An `invalid_grant` response deletes the unusable refresh token instead of retrying indefinitely. The renderer then offers authorization again.

## Playback state

The controller normalizes Spotify responses into renderer-safe state rather than forwarding raw API objects. The state explicitly represents no playback, no device, a restricted device, advertisements, unsupported items, inaccessible contexts, throttling, and offline operation.

The active playlist or album supplies the preferred track list. If Spotify exposes playback metadata but denies enumeration of the context, the controller falls back to the current item plus Spotify's queue. Context and queue results are cached only while their identifying state remains valid.

The renderer keeps at most one state poll in flight. It polls approximately once per second while visible and slows while hidden. A revision counter prevents a response started before a user action from overwriting the action's optimistic state. Transient network failures and rate limits preserve the last usable track list and mark it stale.

## Spotify API transport

The transport attaches the access token only in the main process, parses successful and unsuccessful responses, and returns safe errors without exposing upstream response bodies to the interface. A `429` response establishes a central backoff period from `Retry-After`; requests during that period are suppressed locally.

## Platform-specific code

The React interface, Spotify controller, Web API transport, and most Electron code are portable. macOS-specific behavior is isolated to Keychain access, launching the authorization browser through `/usr/bin/open`, and conventional macOS window lifecycle behavior.

Supporting Windows or Linux would require platform credential stores, a portable browser launcher, and small lifecycle adjustments. Electron's `shell.openExternal()` could replace the current browser-launch command across platforms.

## Validated product behavior

- Keyboard selection is independent of the playing row.
- A changing playing row does not steal the viewport after the user scrolls it away.
- Starting a playlist prefers an active device, then an exact local-hostname match, and never guesses between unrelated inactive devices.
- Playback remains on Spotify Connect devices.
- Renderer state and logs contain no Spotify credentials.
- Normal product startup opens no loopback application server; the OAuth callback is the intentional temporary exception.

The experiments under `spikes/` are retained as historical evidence. Product code lives under `src/` and does not import the spikes.
