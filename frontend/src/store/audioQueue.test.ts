import { shuffleTracks, trackCandidates } from './audioQueue';

test('advances in playlist order and only wraps when repeating', () => {
  expect(trackCandidates(['a', 'b', 'c'], 'b', 1, false)).toEqual(['c']);
  expect(trackCandidates(['a', 'b', 'c'], 'c', 1, true)).toEqual(['a', 'b', 'c']);
  expect(trackCandidates(['a', 'b', 'c'], 'a', -1, true)).toEqual(['c', 'b', 'a']);
  expect(trackCandidates(['a'], 'a', 1, true)).toEqual(['a']);
  expect(trackCandidates(['a'], 'a', 1, false)).toEqual([]);
});

test('shuffles each track once and avoids starting with the preceding final track', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const order = shuffleTracks(ids, 'a');
  expect(order.slice().sort()).toEqual(ids);
  expect(order[0]).not.toBe('a');
  expect(trackCandidates(order, order[0], 1, false)).toEqual(order.slice(1));
});
