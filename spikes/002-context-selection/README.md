# 002: Context-preserving track selection

## Question

Given an accessible playlist or album, when a selected row is started using `context_uri` and `offset.uri`, does Spotify retain the original context and play the expected track with shuffle both disabled and enabled?

## Approach

Use `npm run probe -- play ROW --yes`, then immediately capture playback state and compare the requested track, returned context URI, shuffle state, and observed list position. Test several rows in at least one playlist and one album.

## Results

With shuffle enabled on the owned `Pop Hits` playlist, requesting row 35 using the playlist context URI and Miley Cyrus's track URI started the expected track. Spotify retained the original playlist context, retained shuffle, and playback state mapped the new current item exactly to row 35.

The stronger fallback case also worked. `Chessbrah Lounge` returned `403` for playlist items, but its context URI and queue track URIs remained available. Requesting queue row 2 with the inaccessible playlist's `context_uri` and the queued track's `offset.uri` started Solomun's `Hypnotize` and retained the original playlist context.

## Verdict: VALIDATED

Context-preserving arbitrary row selection works for accessible contexts and for queued tracks from an inaccessible playlist. Shuffle does not prevent selecting the requested track or retaining the context.

### Recommendation for the real build

Use context rows when the full list is available. In fallback mode, prepend the current item to the queue and permit selection of any queued row using the known context URI plus that row's track URI. Disable arbitrary selection only when playback has no context URI.
