# 004: State synchronization and polling

## Question

Given playback changes in another Spotify client, when the probe polls playback state at practical intervals, how quickly and consistently do track, progress, device, shuffle, and repeat state converge?

## Approach

Use `npm run probe -- watch SECONDS INTERVAL_MS` while changing playback externally. Compare 500 ms, 1000 ms, and 2000 ms intervals, record endpoint latency and 429 behavior, and choose the slowest cadence that still feels immediate.

## Results

A 45-second watch polled playback state every 1000 ms while Johan paused and resumed from the official Spotify client. The changes were detected after 937 ms and 1015 ms respectively. The corresponding API calls took 117 ms and 137 ms. Context URI, device, current item, shuffle, and repeat state remained stable.

## Verdict: PARTIAL

A one-second cadence gives approximately one-second visible convergence and is practical for the compact controller. The spike did not yet compare 500 ms and 2000 ms cadences, exercise device transfer or track changes during the watch, or encounter a `429` quota response.

### Recommendation for the real build

Start with one-second foreground polling and slow or suspend it when the window is hidden. Optimistically update state after commands, then reconcile with the next poll. Respect `429` and `Retry-After` if observed in longer use.
