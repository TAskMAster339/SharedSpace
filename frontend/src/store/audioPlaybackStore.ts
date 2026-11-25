import { create } from 'zustand';
import { ApiError } from '../api/client';
import { getDirectoryContents } from '../api/directories';
import { getFavorites } from '../api/favorites';
import { getFileContentUrl } from '../api/files';
import { useToastStore } from '../hooks/useToast';
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
  repeat: boolean;
  compact: boolean;
  loadingNext: boolean;
}

export const useAudioPlayback = create<PlaybackState>(() => ({
  playing: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  repeat: false,
  compact: false,
  loadingNext: false,
}));

let player: HTMLAudioElement | null = null;
let revision = 0;

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

export function playTrack(track: PlaybackTrack) {
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
  resumeTrack();
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
  useAudioPlayback.setState({
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

export function toggleTrackRepeat() {
  const repeat = !useAudioPlayback.getState().repeat;
  if (player) player.loop = repeat;
  useAudioPlayback.setState({ repeat });
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
    if (track.favoriteCursor) {
      if (direction === 1) {
        let cursor: string | undefined = track.favoriteCursor;
        while (cursor && revision === request) {
          const page = await getFavorites(accessToken, { purpose: 'audio', limit: 20, cursor });
          if (await tryFavorites(page.favorites)) return;
          cursor = page.next_cursor;
        }
      } else {
        const { favorites } = await getFavorites(accessToken, { purpose: 'audio' });
        const index = favorites.findIndex((entry) => entry.id === track.id);
        if (index > 0) await tryFavorites(favorites.slice(0, index).reverse());
      }
    } else if (track.directoryId) {
      const directory = await getDirectoryContents(accessToken, track.directoryId);
      const index = directory.files.findIndex((entry) => entry.id === track.id);
      if (index < 0) return;
      const candidates =
        direction === 1
          ? directory.files.slice(index + 1)
          : directory.files.slice(0, index).reverse();
      const next = candidates.find((entry) => entry.mime_type.startsWith('audio/'));
      if (next && revision === request) {
        const { url } = await getFileContentUrl(accessToken, next.id);
        if (revision === request) {
          playTrack({
            ...track,
            id: next.id,
            name: next.filename,
            cover: next.cover_url ?? directory.cover_url,
            src: url,
          });
        }
      }
    }
  } catch {
    if (revision === request)
      useToastStore.getState().showToast('Не удалось открыть соседний трек', 'error');
  } finally {
    if (revision === request) useAudioPlayback.setState({ loadingNext: false });
  }

  async function tryFavorites(entries: Awaited<ReturnType<typeof getFavorites>>['favorites']) {
    if (!accessToken) return false;
    for (const entry of entries) {
      if (revision !== request) return false;
      try {
        const { url } = await getFileContentUrl(accessToken, entry.id);
        if (revision !== request) return false;
        playTrack({
          id: entry.id,
          name: entry.filename,
          cover: entry.cover_url,
          src: url,
          collection: 'Избранная музыка',
          favoriteCursor: `${entry.favorited_at}|${entry.id}`,
        });
        return true;
      } catch (error) {
        if (!(error instanceof ApiError && (error.status === 403 || error.status === 404)))
          throw error;
      }
    }
    return false;
  }
}
