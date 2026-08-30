export interface NavigationEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
}

export interface UriItem {
  uri: string | null;
}

export function normalizeNavigationKey(event: NavigationEvent): string {
  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    if (event.key.toLocaleLowerCase() === 'n') return 'ArrowDown';
    if (event.key.toLocaleLowerCase() === 'p') return 'ArrowUp';
  }
  return event.key;
}

export function moveSelection(
  index: number,
  key: string | number,
  length: number,
): number {
  if (length <= 0) return -1;
  const current = Math.max(0, Math.min(index, length - 1));
  if (Number.isInteger(key)) {
    return Math.max(0, Math.min(key as number, length - 1));
  }
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'ArrowDown') return Math.min(length - 1, current + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return current;
}

export function reconcileSelection(
  items: readonly UriItem[],
  selectedUri: string | null,
  previousIndex: number,
): number {
  if (items.length === 0) return -1;
  const byUri = selectedUri
    ? items.findIndex((item) => item.uri === selectedUri)
    : -1;
  if (byUri >= 0) return byUri;
  return Math.max(0, Math.min(previousIndex, items.length - 1));
}

export function filterByText<T extends { name: string; owner: string | null }>(
  items: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...items];
  return items.filter((item) => {
    const text = `${item.name} ${item.owner ?? ''}`.toLocaleLowerCase();
    return text.includes(normalizedQuery);
  });
}

export function shouldAutoReveal({
  nextPlayingUri,
  previousPlayingUri,
  previousPlayingVisible,
}: {
  nextPlayingUri: string | null;
  previousPlayingUri: string | null;
  previousPlayingVisible: boolean;
}): boolean {
  if (!nextPlayingUri || nextPlayingUri === previousPlayingUri) return false;
  return !previousPlayingUri || previousPlayingVisible;
}
