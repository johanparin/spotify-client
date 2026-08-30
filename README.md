# Minimal Spotify client feasibility spike

This repository tests whether Spotify's current Development Mode Web API can support a compact, keyboard-driven Spotify Connect controller. It contains a zero-dependency Node probe and a loopback-served HTML interaction proof rather than Electron.

The durable product brief is `/Users/johan/Obsidian/Shared Wiki/Computing/minimal-spotify-client.md`.

## Spike order

1. Authenticated context survey.
2. Context-preserving track selection.
3. Queue fallback quality.
4. State synchronization and polling.
5. Thin interactive proof.

There is a checkpoint after the context survey and another after the API-only spikes. See each directory under `spikes/` for its question and eventual verdict.

## Prerequisites

- Node.js 22 or newer; no npm install is required.
- A Spotify Premium account.
- A Spotify Development Mode application.
- `http://127.0.0.1:43821/callback` registered exactly as a redirect URI in the Spotify developer dashboard.

The probe stores the public client ID and OAuth refresh token in macOS Keychain under the service `minimal-spotify-client`. It never uses or requests a client secret. Spotify access tokens expire after one hour; current documentation says dashboard-app refresh tokens expire after six months.

## Commands

```sh
npm run probe -- configure
npm run probe -- login
npm run probe -- survey "context label"
npm run probe -- view
npm run probe -- play 3 --yes
npm run probe -- watch 60 1000
npm run ui
npm test
```

`configure` prompts for the public client ID. `survey` appends sanitized playback and context metadata to `observations/context-surveys.jsonl`, which is ignored by Git. `play` uses a one-based row number and requires `--yes` because it changes active playback. `ui` serves the interactive proof at `http://127.0.0.1:43822`; it includes track and playlist keyboard navigation while keeping Spotify credentials in the Node process.
