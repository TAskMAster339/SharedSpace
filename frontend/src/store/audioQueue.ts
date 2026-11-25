export function shuffleTracks(ids: string[], avoidFirst?: string): string[] {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === avoidFirst) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

export function trackCandidates(
  order: string[],
  current: string,
  direction: -1 | 1,
  repeat: boolean,
) {
  const index = order.indexOf(current);
  if (index < 0) return [];
  if (direction === 1) {
    return repeat
      ? [...order.slice(index + 1), ...order.slice(0, index + 1)]
      : order.slice(index + 1);
  }
  const previous = order.slice(0, index).reverse();
  return repeat ? [...previous, ...order.slice(index).reverse()] : previous;
}
