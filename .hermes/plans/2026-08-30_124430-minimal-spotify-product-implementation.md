# Minimal Spotify Client Product Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn the validated Spotify API, interaction, and Electron-shell spikes into a maintainable personal macOS application without regressing the behaviors Johan tested.

**Architecture:** Keep Spotify credentials, Web API calls, context caching, device selection, and playback commands in Electron's main process. Replace the spike's loopback HTTP boundary with a narrow, validated IPC contract exposed through a context-isolated preload bridge. Build a static TypeScript renderer that preserves the validated compact UI and keyboard model while product code moves under `src/`; retain `spikes/` as immutable evidence and comparison material.

**Tech Stack:** Electron 44, TypeScript, esbuild, Node's test runner, `tsx` for TypeScript tests, Spotify Web API, Authorization Code with PKCE, and macOS Keychain.

---

## Outcome and acceptance criteria

The first product milestone is a runnable development application, not a packaged release. It is complete when all of the following are true:

- `npm run desktop` builds and launches product code from `src/`, not spike code.
- PKCE login and refresh-token persistence continue to use macOS Keychain; neither refresh nor access tokens cross into the renderer.
- The renderer has no Node globals and receives only the typed operations exposed by the preload bridge.
- The active playlist or album appears as a compact list; inaccessible or absent contexts use the validated `Current + Queue` fallback.
- Keyboard selection remains independent of the playing row.
- Up/Down, `C-p`/`C-n`, Home/End, Enter, Space, mouse selection, and double-click retain the validated behavior.
- Scrolling the playing row off-screen prevents later track changes from stealing the viewport; the explicit reveal action remains available.
- The playlist chooser lists, filters, and starts every playlist returned by `/me/playlists`, including followed playlists whose item enumeration may return `403`.
- Starting a playlist with no active playback prefers an active Spotify Connect device, then an exact local-hostname match, and never guesses between unrelated inactive devices.
- Previous, next, seek, shuffle, repeat, and explicit device selection are available through the same compact interface.
- API failures, expired authorization, no-device state, rate limiting, and unsupported contexts are visible to the user rather than console-only failures.
- Unit, controller, IPC, and build checks pass, followed by the documented live acceptance run.

## Validated constraints to preserve

- Owned playlists and albums can expose stable complete lists.
- Followed playlists can expose metadata while playlist-item enumeration returns `403`.
- A known inaccessible playlist context plus a queued track's `offset.uri` can still preserve that playback context.
- Playback initiated from an artist page can have no context URI; that mode is display-only unless detached track playback is added deliberately.
- Queue fallback consists of the current item plus a bounded upcoming window, not the complete source list.
- One-second foreground polling produced approximately one-second visible convergence and is the current safe default.
- Spotify playback should remain on a Spotify Connect device; do not embed audio or add the Web Playback SDK.
- Global show/hide shortcuts, always-on-top, packaging, signing, auto-update, playlist editing, recommendations, and public distribution are deferred unless Johan explicitly pulls them into scope.

## Target source layout

```text
src/
├── main/
│   ├── app.ts
│   ├── ipc.ts
│   └── window.ts
├── preload/
│   └── preload.ts
├── renderer/
│   ├── app.ts
│   ├── index.html
│   ├── model.ts
│   └── styles.css
└── spotify/
    ├── api.ts
    ├── auth.ts
    ├── context.ts
    ├── controller.ts
    ├── keychain.ts
    └── types.ts
scripts/
└── build.mjs
test/
├── api.test.ts
├── context.test.ts
├── controller.test.ts
├── ipc.test.ts
├── model.test.ts
└── server-boundary-regression.test.ts
```

The `server-boundary-regression` test should prove that product startup does not open a loopback application server. The OAuth callback listener remains an intentional short-lived exception during login.

## IPC contract

Define one typed renderer-facing contract and validate every payload again in the main process:

```ts
export interface SpotifyControllerApi {
  getState(): Promise<ViewState>;
  listPlaylists(): Promise<PlaylistSummary[]>;
  selectPlaylist(uri: string): Promise<SelectionResult>;
  playRow(index: number): Promise<PlaybackResult>;
  togglePlayback(): Promise<PlaybackResult>;
  skip(direction: 'next' | 'previous'): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeat(mode: 'off' | 'context' | 'track'): Promise<void>;
  listDevices(): Promise<DeviceSummary[]>;
  selectDevice(deviceId: string): Promise<void>;
}
```

Do not expose generic `fetch`, arbitrary Spotify paths, access tokens, shell execution, filesystem access, or an unrestricted IPC sender.

---

### Task 1: Establish the product build without changing runtime behavior

**Objective:** Add a minimal TypeScript/esbuild pipeline and prove Electron can launch a static product entry point.

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tsconfig.json`
- Create: `scripts/build.mjs`
- Create: `src/main/app.ts`
- Create: `src/preload/preload.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/app.ts`
- Create: `src/renderer/styles.css`
- Create: `test/build.test.ts`

**Steps:**

1. Add development dependencies `typescript`, `esbuild`, `tsx`, and `@types/node`; do not add a framework or packaging tool.
2. Write a failing build test that runs the build script in a temporary output directory and asserts the expected main, preload, renderer JavaScript, HTML, and CSS artifacts.
3. Run the focused test and confirm it fails because the pipeline does not yet exist.
4. Implement `scripts/build.mjs`: bundle main as ESM with Electron external, bundle preload as CommonJS with Electron external, bundle renderer for the browser, and copy static HTML/CSS.
5. Configure `tsconfig.json` for strict type checking and no emit.
6. Add scripts for `build`, `typecheck`, and `desktop`; `desktop` must build before launching Electron.
7. Launch the static shell once and verify it has no browser chrome and no renderer Node globals.
8. Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
9. Offer checkpoint commit `build: add TypeScript Electron pipeline`; do not commit without Johan's approval.

### Task 2: Port pure Spotify data and context logic

**Objective:** Move stable normalization, URI parsing, fallback, and row-mapping logic into typed product modules before moving side effects.

**Files:**

- Create: `src/spotify/types.ts`
- Create: `src/spotify/context.ts`
- Create: `test/context.test.ts`
- Reference only: `spikes/001-context-survey/lib/context.mjs`
- Reference only: `spikes/001-context-survey/test/context.test.mjs`

**Steps:**

1. Define narrow domain types for normalized tracks, playback context, context metadata, queue state, playlist summaries, devices, API timings, and renderer `ViewState`.
2. Port the five existing context tests to TypeScript and add cases for duplicate queue entries, nullable items, episodes or unsupported types, and inaccessible contexts.
3. Run the focused tests and confirm they fail before implementation.
4. Implement `parseSpotifyUri`, `normalizeItem`, `findCurrentIndex`, and `fallbackItems` with explicit null handling.
5. Preserve current matching semantics: URI first, then ID.
6. Decide and test whether queue fallback removes a duplicate current item when Spotify returns it as the first queued item; document the chosen behavior.
7. Run focused tests, the existing spike tests, typecheck, and the build.
8. Offer checkpoint commit `spotify: port typed context model`; do not commit without approval.

### Task 3: Port Keychain, PKCE, and API transport

**Objective:** Recreate authenticated Spotify access in product code while preserving the proven security boundary.

**Files:**

- Create: `src/spotify/keychain.ts`
- Create: `src/spotify/auth.ts`
- Create: `src/spotify/api.ts`
- Create: `test/api.test.ts`
- Reference only: `spikes/001-context-survey/lib/keychain.mjs`
- Reference only: `spikes/001-context-survey/lib/auth.mjs`
- Reference only: `spikes/001-context-survey/lib/spotify.mjs`

**Steps:**

1. Write transport tests using injected `fetch` responses for `204`, JSON success, non-JSON error bodies, `401`, `403`, and `429` with `Retry-After`.
2. Write tests for pagination and refresh-token rotation; never use live Keychain values in automated tests.
3. Port the Keychain service and account names exactly so existing authorization continues to work.
4. Port PKCE generation, system-browser authorization, loopback callback validation, token exchange, refresh, and rotated-refresh-token persistence.
5. Keep the loopback OAuth redirect at the registered `http://127.0.0.1:43821/callback` unless the Spotify application registration is deliberately changed.
6. Introduce typed errors with safe renderer-facing messages; retain status, reason, and retry metadata in the main process.
7. Run focused tests, typecheck, build, and the complete suite.
8. Perform one live `getState` call in the main process and verify that logs contain no token values.
9. Offer checkpoint commit `auth: port PKCE and Keychain services`; do not commit without approval.

### Task 4: Build the product controller service

**Objective:** Consolidate playback state, cached context, queue fallback, playlist enumeration, and deterministic device selection behind a tested service.

**Files:**

- Create: `src/spotify/controller.ts`
- Create: `test/controller.test.ts`
- Reference only: `spikes/005-thin-interactive-proof/controller.mjs`
- Reference only: `spikes/005-thin-interactive-proof/test/controller.test.mjs`

**Steps:**

1. Port the existing controller tests, including playlist pagination, cache reuse, empty-playlist refusal, device-ID URL encoding, active-device preference, local-hostname preference, and ambiguous-device refusal.
2. Add tests for context cache invalidation, queue refresh on current-track change, absent playback, playlist-item `403`, no context URI, and malformed row indexes.
3. Implement dependency-injected token and request providers so tests never touch Spotify.
4. Preserve the five-minute playlist cache and context-URI cache unless evidence supports changing them.
5. Return renderer-safe `ViewState` objects with no raw Spotify response and no credentials.
6. Add controller methods for previous, next, seek, shuffle, repeat, device listing, and explicit device transfer; write a failing request-shape test before each method.
7. Clamp seek positions to the current item duration and validate repeat modes and device IDs in the controller, not the renderer alone.
8. Run focused tests, typecheck, build, and the complete suite.
9. Offer checkpoint commit `spotify: add typed controller service`; do not commit without approval.

### Task 5: Replace the loopback UI server with typed IPC

**Objective:** Make the Electron main/preload boundary the only product control plane.

**Files:**

- Create: `src/main/ipc.ts`
- Modify: `src/main/app.ts`
- Modify: `src/preload/preload.ts`
- Create: `src/renderer/global.d.ts`
- Create: `test/ipc.test.ts`
- Create: `test/server-boundary-regression.test.ts`

**Steps:**

1. Write failing tests that enumerate the allowed IPC methods and reject unknown channels, malformed playlist URIs, non-integer rows, invalid seek positions, invalid repeat modes, and invalid device IDs.
2. Implement one main-process handler per operation rather than a generic dispatch endpoint.
3. Expose the narrow `SpotifyControllerApi` with `contextBridge.exposeInMainWorld`.
4. Add renderer type declarations for the bridge without adding Node types to renderer code.
5. Load the renderer with `BrowserWindow.loadFile` from `dist/renderer/index.html`.
6. Add a restrictive Content Security Policy that permits only local scripts/styles and denies remote connections; Spotify calls occur only in main.
7. Preserve `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, denied new windows, and denied navigation.
8. Add the regression test proving product startup does not call `listen` or expose `/api/*`; keep spike 005's loopback server untouched as evidence.
9. Run IPC tests, typecheck, build, full tests, and a renderer inspection confirming `process` and `require` are undefined.
10. Offer checkpoint commit `security: replace loopback UI API with IPC`; do not commit without approval.

### Task 6: Port the validated renderer behavior

**Objective:** Move the tested interaction model and compact UI into `src/renderer` without redesigning it.

**Files:**

- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Create or modify: `src/renderer/model.ts`
- Modify: `src/renderer/app.ts`
- Create: `test/model.test.ts`
- Reference only: `spikes/005-thin-interactive-proof/public/model.mjs`
- Reference only: `spikes/005-thin-interactive-proof/public/ui.mjs`

**Steps:**

1. Port all existing model tests before moving UI behavior.
2. Add tests for `C-n`/`C-p` modifier handling, selection preservation across refresh, initial selection, empty lists, filtered playlist selection, and reveal policy based on previous playing-row visibility.
3. Port rendering with stable DOM rows so polling cannot destroy a double-click target.
4. Read selection after asynchronous state retrieval so in-flight polling cannot restore stale keyboard selection.
5. Keep text selection disabled on track and playlist rows and prevent default browser double-click word selection.
6. Keep playlist filtering local and preserve current-context marking.
7. Route all operations through `window.spotifyController`; do not import Electron or Node modules in renderer code.
8. Replace console-only action failures with a compact visible status area and retain actionable messages inside open dialogs.
9. Run model tests, typecheck, build, complete tests, and the established live keyboard checklist.
10. Offer checkpoint commit `ui: port validated compact controller`; do not commit without approval.

### Task 7: Add the remaining MVP playback controls

**Objective:** Complete routine playback control without turning the interface into a Spotify clone.

**Files:**

- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/model.ts`
- Modify: `test/model.test.ts`
- Modify: `src/spotify/controller.ts`
- Modify: `test/controller.test.ts`

**Steps:**

1. Add previous and next controls with tooltips and keyboard bindings that do not conflict with `C-p`/`C-n`.
2. Add a compact progress display and seek control; do not poll more frequently than necessary merely to animate elapsed time.
3. Add shuffle and repeat controls with visible current state and optimistic updates followed by reconciliation.
4. Add a device chooser showing active, restricted, and unavailable states; explicit selection takes precedence over hostname fallback.
5. Add incremental track filtering or jump behavior only after writing down its exact selection and Enter semantics; avoid conflating filtering with playlist search.
6. Disable unavailable operations based on playback actions or state rather than letting every click fail remotely.
7. Add focused tests for every transition and error rollback.
8. Run tests, typecheck, build, and live verification against the local device and one alternate device only if Johan approves the transfer.
9. Offer checkpoint commit `controls: complete compact playback actions`; do not commit without approval.

### Task 8: Harden polling, authorization recovery, and error states

**Objective:** Make the application quiet and predictable during normal Spotify and network failures.

**Files:**

- Modify: `src/spotify/api.ts`
- Modify: `src/spotify/auth.ts`
- Modify: `src/spotify/controller.ts`
- Modify: `src/renderer/app.ts`
- Create or modify: `test/api.test.ts`
- Create or modify: `test/controller.test.ts`

**Steps:**

1. Keep one in-flight state poll at a time and prevent late responses from overwriting newer action results.
2. Poll around once per second while visible; slow or suspend polling while hidden or minimized.
3. Honor `429` and `Retry-After` centrally and expose a non-alarming throttled status.
4. On `invalid_grant`, clear invalid token material through the Keychain abstraction and offer reauthorization; do not retry refresh indefinitely.
5. Distinguish no playback, no device, restricted device, unsupported item, advertisement, inaccessible context, offline/network error, and authorization failure.
6. Preserve the last usable list during transient failures while clearly marking state as stale.
7. Add deterministic tests using injected clocks and deferred promises for stale response ordering, backoff, hidden-window polling, and optimistic rollback.
8. Run focused tests, typecheck, build, and complete tests.
9. Offer checkpoint commit `reliability: harden polling and recovery`; do not commit without approval.

### Task 9: Finish Electron lifecycle and development ergonomics

**Objective:** Make the development application pleasant to run while leaving packaging and global shortcuts deferred.

**Files:**

- Modify: `src/main/app.ts`
- Create or modify: `src/main/window.ts`
- Modify: `package.json`
- Modify: `README.md`
- Create: `test/window.test.ts`

**Steps:**

1. Separate window creation from app startup so lifecycle behavior is testable with a narrow BrowserWindow factory seam.
2. Preserve standard macOS close and Dock-reactivation behavior validated in spike 006.
3. Persist safe window bounds only if the default size proves annoying; do not add a general settings framework for one value.
4. Ensure normal quit stops polling and exits without listeners or child processes.
5. Keep DevTools closed by default and do not enable a remote-debugging port in normal scripts.
6. Document `npm install`, `npm test`, `npm run typecheck`, `npm run build`, and `npm run desktop`.
7. Run a clean-install check after temporarily moving `node_modules` aside or in a disposable worktree; do not delete the working installation without approval.
8. Offer checkpoint commit `desktop: finish development lifecycle`; do not commit without approval.

### Task 10: Run the product acceptance pass and retire spike execution paths

**Objective:** Prove the product source preserves the spike findings, then make product commands the default while retaining spike evidence.

**Files:**

- Modify: `README.md`
- Modify: `package.json`
- Modify: relevant `spikes/*/README.md` only to link to the product implementation; do not rewrite evidence
- Update the private product notes after Johan confirms the product pass.

**Steps:**

1. Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
2. Launch `npm run desktop` without remote debugging.
3. Verify an owned playlist: complete rows, exact mapping, Enter and double-click selection, shuffle preservation.
4. Verify a followed inaccessible playlist: visible metadata, `Current + Queue` label, queued-row playback preserving context.
5. Verify playlist filtering and selection with `C-n`/`C-p` and Enter.
6. Verify manual scrolling and external track changes do not steal the viewport; use the explicit reveal action.
7. Verify previous, next, play/pause, seek, shuffle, repeat, and explicit device selection.
8. Verify no playback, no active device, and reauthorization messages are visible and actionable.
9. Close, reactivate from the Dock, and quit; verify clean exit and no unexpected loopback listener.
10. Confirm renderer isolation again: `process` and `require` remain undefined and no credentials appear in renderer state or logs.
11. Make `npm run desktop` point only to product code; retain explicit `probe` or `spike:*` commands for evidence and troubleshooting.
12. Update the durable Shared Wiki brief with the acceptance result and remaining deferred features.
13. Offer final milestone commit `app: complete minimal Spotify controller MVP`; do not commit or push without Johan's explicit approval.

---

## Test and validation matrix

| Layer | Automated evidence | Live evidence |
|---|---|---|
| Pure model | URI parsing, normalization, selection, filtering, reveal policy | Keyboard and pointer feel |
| Spotify transport | response parsing, pagination, refresh, rate limits | one authenticated state read |
| Controller | cache behavior, request shapes, fallback, device choice | owned and followed playlists |
| IPC | channel allowlist and payload rejection | renderer can perform only exposed operations |
| Renderer | state transitions and stable selection | double-click, `C-p`/`C-n`, scrolling |
| Electron | build artifacts, window factory, shutdown seam | resize, Dock reactivation, clean quit |
| Security | CSP, no loopback product server, no generic IPC | `process`/`require` absent; no token leakage |

## Files that remain evidence, not production dependencies

- `spikes/001-context-survey/**`
- `spikes/002-context-selection/**`
- `spikes/003-queue-fallback/**`
- `spikes/004-state-sync/**`
- `spikes/005-thin-interactive-proof/**`
- `spikes/006-electron-shell/**`
- `observations/context-surveys.jsonl` remains local and ignored

Production modules may initially be ported from these files, but imports from `src/` back into `spikes/` should be prohibited once each migration task is complete.

## Risks and tradeoffs

- Replacing loopback HTTP with IPC improves the product security boundary but creates an Electron-only renderer. That is acceptable because browser deployment is not a product requirement; the spike remains available for browser-level experimentation.
- TypeScript and esbuild add tooling, but the type boundary is valuable for renderer/main isolation and Spotify's nullable response shapes. Avoid adding React, a state framework, Electron Forge, or a settings framework until a concrete need appears.
- Spotify Development Mode behavior can change. Keep response parsing defensive, surface unknown states, and preserve the authenticated probe for quick revalidation.
- Starting playback on an inactive device is inherently ambiguous when several devices are available. Never silently choose an unrelated remote device; explicit device selection is the product solution.
- One-second polling is proven but not free. Centralize polling and backoff so UI components cannot create duplicate loops.
- Followed playlists may be selectable but not enumerable. The UI must continue to label queue fallback honestly rather than presenting it as the complete playlist.

## Open decisions for Johan

These do not block Tasks 1–6:

- Whether global show/hide should return, and which shortcut to use.
- Whether always-on-top should be available and whether it should persist.
- Exact previous/next and playlist-chooser keyboard bindings beyond those already validated.
- Whether track typing should filter, jump incrementally, or offer both modes.
- Whether selecting a device should also transfer current playback immediately.
- Whether packaging/signing is worth doing after the development MVP is stable.

## Handoff prompt for the dedicated Codex session

```text
Implement the minimal Spotify client product from the repository plan at `.hermes/plans/2026-08-30_124430-minimal-spotify-product-implementation.md`. Read `README.md`, the relevant spike verdicts under `spikes/`, and the private product notes before changing code. Start with Task 1 and work task-by-task with tests first. Treat spikes as evidence, not production modules. Preserve renderer isolation and never expose Spotify credentials. Do not commit or push without my explicit approval.
```
