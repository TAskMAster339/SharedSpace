import { create } from 'zustand';
import { ApiError } from '../api/client';
import { getDirectoryContents } from '../api/directories';
import { getFavorites } from '../api/favorites';
import { getFileContentUrl } from '../api/files';
import { useToastStore } from '../hooks/useToast';
import { shuffleTracks, trackCandidates } from './audioQueue';
import { useAuthStore } from './authStore';

export interface PlaybackTrack {
  id: string;
  src: string;
  name: string;
  cover?: string;
  collection?: string;
  directoryId?: string;
  favoriteCursor?: string;
}

interface PlaybackState {
  track?: PlaybackTrack;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: 'off' | 'playlist' | 'track';
  shuffle: boolean;
  compact: boolean;
  loadingNext: boolean;
}

export const useAudioPlayback = create<PlaybackState>(() => ({
  playing: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  repeat: 'off',
  shuffle: false,
  compact: false,
  loadingNext: false,
}));

let player: HTMLAudioElement | null = null;
let revision = 0;
let shuffleOrder: string[] = [];

export function bindAudioPlayer(element: HTMLAudioElement | null) {
  player = element;
}

function reportPlaybackError() {
  useToastStore.getState().showToast('Не удалось воспроизвести трек', 'error');
}

export function resumeTrack() {
  if (!player || !useAudioPlayback.getState().track) return;
  void player.play().catch((error: DOMException) => {
    if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') reportPlaybackError();
  });
}

export function playTrack(track: PlaybackTrack, preserveOrder = false, autoplay = true) {
  if (!preserveOrder) shuffleOrder = [];
  if (!player) return;
  const current = useAudioPlayback.getState();
  if (current.track?.id !== track.id) {
    revision++;
    useAudioPlayback.setState({
      track,
      playing: false,
      position: 0,
      duration: 0,
      loadingNext: false,
    });
    player.src = track.src;
  } else if (current.track.src !== track.src) {
    useAudioPlayback.setState({ track });
    if (player.error) player.src = track.src;
  }
  if (autoplay) resumeTrack();
}

export function toggleTrack(track?: PlaybackTrack) {
  if (!player) return;
  if (track && track.id !== useAudioPlayback.getState().track?.id) {
    playTrack(track);
  } else if (player.paused) {
    resumeTrack();
  } else {
    player.pause();
  }
}

export function pauseTrack() {
  player?.pause();
}

export function stopTrack() {
  revision++;
  shuffleOrder = [];
  if (player) player.loop = false;
  useAudioPlayback.setState({
    repeat: 'off',
    shuffle: false,
    track: undefined,
    playing: false,
    position: 0,
    duration: 0,
    compact: false,
    loadingNext: false,
  });
  if (!player) return;
  player.pause();
  player.removeAttribute('src');
  player.load();
}

export function seekTrack(position: number) {
  if (player) player.currentTime = position;
  useAudioPlayback.setState({ position });
}

export function setTrackVolume(volume: number) {
  if (player) {
    player.volume = volume;
    player.muted = false;
  }
  useAudioPlayback.setState({ volume, muted: false });
}

export function toggleTrackMute() {
  const muted = !useAudioPlayback.getState().muted;
  if (player) player.muted = muted;
  useAudioPlayback.setState({ muted });
}

export function toggleTrackRepeat(hasPlaylist = true) {
  const current = useAudioPlayback.getState().repeat;
  const repeat =
    current === 'off'
      ? hasPlaylist
        ? 'playlist'
        : 'track'
      : current === 'playlist'
        ? 'track'
        : 'off';
  if (player) player.loop = repeat === 'track';
  useAudioPlayback.setState({ repeat });
}

export function toggleTrackShuffle() {
  shuffleOrder = [];
  useAudioPlayback.setState((state) => ({ shuffle: !state.shuffle }));
}

export function trackPath(track: PlaybackTrack) {
  const path = `/files/${track.id}`;
  if (!track.favoriteCursor) return path;
  return `${path}?${new URLSearchParams({ playlist: 'favorites', cursor: track.favoriteCursor })}`;
}

export async function advanceTrack(direction: -1 | 1) {
  const { track, loadingNext } = useAudioPlayback.getState();
  const accessToken = useAuthStore.getState().accessToken;
  if (!track || !accessToken || loadingNext || (!track.directoryId && !track.favoriteCursor))
    return;
  const request = ++revision;
  useAudioPlayback.setState({ loadingNext: true });
  try {
    const { repeat, shuffle } = useAudioPlayback.getState();
    const playlistRepeat = repeat === 'playlist';
    let entries: Omit<PlaybackTrack, 'src'>[];
    if (track.favoriteCursor) {
      if (!shuffle && !playlistRepeat && direction === 1) {
        let cursor: string | undefined = track.favoriteCursor;
        while (cursor && revision === request) {
          const page = await getFavorites(accessToken, { purpose: 'audio', limit: 20, cursor });
          if (await playCandidates(page.favorites.map(favoriteTrack))) return;
          cursor = page.next_cursor;
        }
        return;
      }
      const { favorites } = await getFavorites(accessToken, { purpose: 'audio' });
      entries = favorites.map(favoriteTrack);
    } else if (track.directoryId) {
      const directory = await getDirectoryContents(accessToken, track.directoryId);
      entries = directory.files
        .filter((entry) => entry.mime_type.startsWith('audio/'))
        .map((entry) => ({
          id: entry.id,
          name: entry.filename,
          cover: entry.cover_url ?? directory.cover_url,
          collection: directory.name,
          directoryId: track.directoryId,
        }));
    } else {
      return;
    }

    if (revision !== request) return;
    const tracks = new Map(entries.map((entry) => [entry.id, entry]));
    const ids = [...tracks.keys()];
    let candidates = trackCandidates(ids, track.id, direction, playlistRepeat);
    if (shuffle) {
      if (!shuffleOrder.includes(track.id)) {
        shuffleOrder = [track.id, ...shuffleTracks(ids.filter((id) => id !== track.id))];
      }
      const pending = ids.filter((id) => !shuffleOrder.includes(id));
      shuffleOrder = [
        ...shuffleOrder.filter((id) => id === track.id || tracks.has(id)),
        ...shuffleTracks(pending),
      ];
      candidates = trackCandidates(
        shuffleOrder,
        track.id,
        direction,
        playlistRepeat && direction === -1,
      );
      if (playlistRepeat && direction === 1 && candidates.length === 0) {
        shuffleOrder = shuffleTracks(ids, track.id);
        candidates = shuffleOrder;
      }
    }
    await playCandidates(
      candidates.flatMap((id) => {
        const candidate = tracks.get(id);
        return candidate ? [candidate] : [];
      }),
    );
  } catch {
    if (revision === request)
      useToastStore.getState().showToast('Не удалось открыть соседний трек', 'error');
  } finally {
    if (revision === request) useAudioPlayback.setState({ loadingNext: false });
  }

  function favoriteTrack(entry: Awaited<ReturnType<typeof getFavorites>>['favorites'][number]) {
    return {
      id: entry.id,
      name: entry.filename,
      cover: entry.cover_url,
      collection: 'Избранная музыка',
      favoriteCursor: `${entry.favorited_at}|${entry.id}`,
    };
  }

  async function playCandidates(entries: Omit<PlaybackTrack, 'src'>[]) {
    if (!accessToken) return false;
    for (const entry of entries) {
      if (revision !== request) return false;
      try {
        const { url } = await getFileContentUrl(accessToken, entry.id);
        if (revision !== request) return false;
        if (entry.id === track?.id) seekTrack(0);
        playTrack({ ...entry, src: url }, true);
        return true;
      } catch (error) {
        if (!(error instanceof ApiError && (error.status === 403 || error.status === 404)))
          throw error;
      }
    }
    return false;
  }
}
