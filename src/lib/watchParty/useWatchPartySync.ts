import {useCallback, useEffect, useRef, useState} from 'react';
import type {MutableRefObject} from 'react';
import usePartyStore, {type PartyParams} from './watchParty';

interface PlayerLike {
  seek: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
}

interface Options {
  playerRef: MutableRefObject<PlayerLike | null | undefined>;
  videoPositionRef: MutableRefObject<{position: number; duration: number}>;
  isTV: boolean;
  setTvPaused: (paused: boolean) => void;
  params: PartyParams;
  activeEpisodeLink?: string;
}

const MUTE_MS = 1600;
const TICK_MS = 5000;
const MAX_PAYLOAD_CHARS = 120_000;

/** Keeps this player in step with the watch-together room (no-op outside one). */
const useWatchPartySync = ({
  playerRef,
  videoPositionRef,
  isTV,
  setTvPaused,
  params,
  activeEpisodeLink,
}: Options) => {
  const code = usePartyStore(s => s.code);
  const isHost = usePartyStore(s => s.isHost);
  const remote = usePartyStore(s => s.remote);
  const inRoom = !!code;

  const pausedRef = useRef(false);
  const mutedUntil = useRef(0);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- content: the host's choice opens on every device --------------------
  useEffect(() => {
    if (!inRoom || !isHost) {
      return;
    }
    // Files on this phone cannot be shared; live channels and streams can.
    if (params.localContent && !params.externalVideo?.live) {
      return;
    }
    const {file: _file, initialStream: _stream, ...rest} = params;
    const index = params.episodeList.findIndex(e => e.link === activeEpisodeLink);
    let shared: PartyParams = {
      ...rest,
      linkIndex: index >= 0 ? index : params.linkIndex,
    };
    if (JSON.stringify(shared).length > MAX_PAYLOAD_CHARS) {
      const only = shared.episodeList[shared.linkIndex];
      shared = {...shared, episodeList: only ? [only] : [], linkIndex: 0};
    }
    usePartyStore.getState().sendContent(shared, params.primaryTitle || 'Now playing');
  }, [inRoom, isHost, params, activeEpisodeLink]);

  // --- host: answer "where are we?" for people who join later ---------------
  useEffect(() => {
    if (!inRoom || !isHost) {
      return;
    }
    usePartyStore.getState().registerSnapshot(() => ({
      playing: !pausedRef.current,
      position: videoPositionRef.current.position,
    }));
    return () => usePartyStore.getState().registerSnapshot(null);
  }, [inRoom, isHost, videoPositionRef]);

  // --- local actions -> room ------------------------------------------------
  const broadcast = useCallback(
    (playing: boolean, position: number) => {
      if (!armed || Date.now() < mutedUntil.current) {
        return;
      }
      usePartyStore.getState().sendPlayback('play', playing, position);
    },
    [armed],
  );

  const onPause = useCallback(() => {
    pausedRef.current = true;
    if (inRoom) {
      broadcast(false, videoPositionRef.current.position);
    }
  }, [inRoom, broadcast, videoPositionRef]);

  const onPlay = useCallback(() => {
    pausedRef.current = false;
    if (inRoom) {
      broadcast(true, videoPositionRef.current.position);
    }
  }, [inRoom, broadcast, videoPositionRef]);

  const onSeek = useCallback(
    (e: {currentTime: number; seekTime?: number}) => {
      if (inRoom) {
        broadcast(!pausedRef.current, e.seekTime ?? e.currentTime);
      }
    },
    [inRoom, broadcast],
  );

  /** Call once the video has loaded; sync starts a moment later. */
  const onLoaded = useCallback(() => {
    if (armTimer.current) {
      clearTimeout(armTimer.current);
    }
    armTimer.current = setTimeout(() => setArmed(true), 1200);
  }, []);

  useEffect(
    () => () => {
      if (armTimer.current) {
        clearTimeout(armTimer.current);
      }
    },
    [],
  );

  // --- room -> this player ---------------------------------------------------
  useEffect(() => {
    if (!inRoom || !armed || !remote) {
      return;
    }
    const target =
      remote.position + (remote.playing ? (Date.now() - remote.receivedAt) / 1000 + 0.25 : 0);
    const drift = Math.abs(videoPositionRef.current.position - target);
    const player = playerRef.current;
    mutedUntil.current = Date.now() + MUTE_MS;
    if (player && drift > (remote.kind === 'tick' ? 2.5 : 0.8)) {
      player.seek(Math.max(0, target));
    }
    if (remote.playing && pausedRef.current) {
      if (isTV) {
        setTvPaused(false);
      } else {
        player?.resume();
      }
    } else if (!remote.playing && !pausedRef.current) {
      if (isTV) {
        setTvPaused(true);
      } else {
        player?.pause();
      }
    }
  }, [inRoom, armed, remote, isTV, setTvPaused, playerRef, videoPositionRef]);

  // --- host heartbeat keeps late or drifting viewers aligned ----------------
  useEffect(() => {
    if (!inRoom || !isHost || !armed) {
      return;
    }
    const id = setInterval(() => {
      usePartyStore
        .getState()
        .sendPlayback('tick', !pausedRef.current, videoPositionRef.current.position);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [inRoom, isHost, armed, videoPositionRef]);

  return {onPause, onPlay, onSeek, onLoaded};
};

export default useWatchPartySync;
