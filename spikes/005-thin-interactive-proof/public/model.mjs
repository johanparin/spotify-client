export function normalizeNavigationKey(event) {
  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    if (event.key.toLowerCase() === 'n') return 'ArrowDown';
    if (event.key.toLowerCase() === 'p') return 'ArrowUp';
  }
  return event.key;
}

export function moveSelection(index, key, length) {
  if (length <= 0) return -1;
  const current = Math.max(0, Math.min(index, length - 1));

  if (Number.isInteger(key)) return Math.max(0, Math.min(key, length - 1));
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'ArrowDown') return Math.min(length - 1, current + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return current;
}

export function reconcileSelection(items, selectedUri, previousIndex) {
  if (!items.length) return -1;
  const byUri = items.findIndex((item) => item.uri === selectedUri);
  if (byUri >= 0) return byUri;
  return Math.max(0, Math.min(previousIndex, items.length - 1));
}

export function shouldAutoReveal({
  nextPlayingUri,
  previousPlayingUri,
  previousPlayingVisible,
}) {
  if (!nextPlayingUri || nextPlayingUri === previousPlayingUri) return false;
  return !previousPlayingUri || previousPlayingVisible;
}