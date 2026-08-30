# 003: Queue fallback quality

## Question

Given an inaccessible or unsupported playback context, when current playback and the queue endpoint are combined, is the resulting compact list useful and stable enough for highlighting and navigation?

## Approach

Capture queue data for followed playlists, radio, recommendations, and any other context that cannot provide a full list. Compare duplicate behavior, item identity, list depth, and changes after external playback actions.

## Results

For `Chessbrah Lounge`, Spotify exposed playlist metadata but denied item access with `403`. The queue endpoint consistently supplied the current item plus 20 upcoming tracks. Selecting an upcoming queue row with the known playlist context URI retained that context and rebuilt the queue from the selected point.

Playing an individual track from an artist page returned no context URI. The same current-plus-20 list remained useful for visibility, but context-preserving arbitrary selection is impossible without a context URI.

## Verdict: PARTIAL

The fallback is useful and interactive for inaccessible playlists because Spotify still exposes their context URI. It is display-only for absent-context playback unless the client accepts detached URI playback as a separate behavior. It also lacks previous tracks and exposes only a bounded forward window.

### Recommendation for the real build

Show fallback mode explicitly as `Current + Queue`. Do not present it as the complete source list. Permit row selection when a context URI exists; otherwise retain normal transport controls and make arbitrary row playback a deliberate later product decision.
