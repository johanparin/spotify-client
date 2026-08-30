# 005: Thin interactive proof

## Question

Given validated Spotify API behavior, when a minimal keyboard-driven track list is rendered, can keyboard selection remain independent of the playing row while automatic reveal keeps playback visible without fighting manual scrolling?

## Approach

Serve a dependency-free HTML, CSS, and JavaScript interface from a loopback-only Node server. The server reuses the PKCE, Keychain, and Spotify API code from spike 001; the browser never receives an access or refresh token.

Run it with:

```text
npm run ui
```

Then open `http://127.0.0.1:43822` in Brave.

The proof supports:

- Up/Down and Home/End to move selection independently of playback.
- Enter or double-click to play the selected row.
- Space to toggle play/pause.
- `F` or the off-screen indicator to reveal the playing row without moving selection. Track changes follow automatically only when the previous playing row was visible; scrolling it off-screen disables automatic following until playback is explicitly revealed.
- `P` or the Playlists button to open a searchable playlist chooser; `C-n`, `C-p`, arrows, and Enter work inside it.
- One-second playback polling, with context contents cached until the context changes.
- Full context and bounded `Current + Queue` modes.

## Verdict: VALIDATED

Automated model and server checks pass, and the live Spotify state endpoint returns a normalized view without exposing credentials. In Brave, keyboard movement, row playback, and double-click playback worked after removing two rendering races: polling no longer restores a selection captured before the request, and unchanged lists retain their DOM rows rather than replacing the first click's target before the second click.

The interaction model is viable. Live testing confirmed that selection remains independent, scrolling the playing row off-screen prevents external track changes from moving the viewport, the off-screen indicator appears, and `F` reveals playback without changing selection. Desktop-specific behavior remains a separate later Electron proof rather than part of this interaction spike.

The playlist endpoint returned all 54 playlists currently available to Johan, including ten owned by other accounts. Live testing in Brave confirmed that filtering, keyboard navigation, and Enter selection switch playback to the chosen playlist and load its context without using Spotify's GUI.
