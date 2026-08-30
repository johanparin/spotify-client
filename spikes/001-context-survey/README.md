# 001: Authenticated context survey

## Question

Given PKCE-authenticated access and active playback, when we sample five to ten real contexts, can we classify each context, fetch its contents where allowed, and reliably map the current item into that list?

## Approach

Use a zero-dependency Node CLI with the system browser, an explicit loopback redirect, and macOS Keychain storage. Capture current playback, the complete playlist or album context when available, the queue fallback, mapping success, and endpoint timings as JSON Lines.

This directly tests the highest product risk while avoiding Electron, bundlers, and embedded playback. Spotify's February 2026 Development Mode behavior means playlist contents may be absent or forbidden unless Johan owns or collaborates on the playlist.

## Evidence to collect

For five to ten commonly used contexts, run `npm run probe -- survey "label"` and record:

- context type and URI;
- full-list access and item count;
- whether the current item maps to the list;
- queue length and usefulness when context access fails;
- shuffle and repeat state;
- endpoint response timings.

## Results

Ten observations covered startup without active playback and five representative playback scenarios:

- Johan's owned public `Pop Hits` playlist exposed all 37 tracks and mapped the current track exactly, both with shuffle disabled and enabled.
- Ava Max's `Heaven & Hell` album exposed all 16 tracks and mapped the current track exactly.
- The followed `Chessbrah Lounge` playlist exposed metadata but returned `403` for playlist items, as documented for Development Mode.
- Playing an individual track from an artist page returned no context URI.
- The queue endpoint supplied the current item plus 20 upcoming items for both inaccessible and absent contexts.

Observed survey API calls took 118–368 ms, with a 161 ms median. Context names and ownership are now recorded automatically. A probe defect that omitted the current item from fallback rendering was found and fixed.

## Verdict: PARTIAL

The main context classes in Johan's sample behave consistently and support a useful compact list, but the survey did not reach five to ten distinct source contexts and did not cover collaborative playlists, Spotify-generated mixes, local files, advertisements, or episodes. The evidence is sufficient to continue the feasibility spike, not to claim complete context coverage.

### Recommendation for the real build

Treat playlist and album contexts as full-list mode. Treat `403`, missing context, and unsupported context types as current-plus-queue mode. Preserve the fallback reason in the UI so limited navigation is explicit rather than surprising.
