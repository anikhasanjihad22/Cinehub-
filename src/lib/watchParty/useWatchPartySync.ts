// @ts-nocheck
import {useEffect, useRef, useState} from 'react';
import usePartyStore from './watchParty';

interface Options {
  mpv: any;
  state: any;
  episodeIndex: number;
}

const MUTE_MS = 1600;
const TICK_MS = 5000;
const MAX_PAYLOAD = 120000;

/** Keeps the player in step with the watch-together room (no-op outside one). */
export function useWatchPartySync({mpv, state, episodeIndex}: Options) {
  const code = usePartyStore(s => s.code);
  const isHost = usePartyStore(s => s.isHost);
  const remote = usePartyStore(s => s.remote);
  const inRoom = !!code;

  const mpvRef = useRef(mpv);
  mpvRef.current = mpv;
  const [armed, setArmed] = useState(false);
  const mutedUntil = useRef(0);
  const prevPaused = useRef<boolean | null>(null);
  const lastTime = useRef({t: 0, at: Date.now()});

  // arm shortly after the video has really loaded
  useEffect(() => {
    setArmed(false);
    if (!(mpv.duration > 0)) return;
    const t = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(t);
  }, [mpv.duration > 0, episodeIndex]);

  // host: the video everyone should open
  useEffect(() => {
    if (!inRoom || !isHost) return;
    if (state.localContent) return; // files on this PC cannot be shared
    const ep = state.episodeList[episodeIndex];
    let params: any;
    if (state.live && state.liveStream) {
      params = {
        linkIndex: 0,
        episodeList: [{id: ep.link, link: ep.link, title: ep.title}],
        directUrl: state.liveStream.link,
        externalVideo: {mimeType: 'application/x-mpegURL', headers: state.liveStream.headers, live: true},
        localContent: true,
        type: 'movie',
        primaryTitle: state.primaryTitle,
        secondaryTitle: state.secondaryTitle,
        poster: state.poster,
        providerValue: 'local',
      };
    } else {
      params = {
        linkIndex: episodeIndex,
        episodeList: state.episodeList.map((e: any) => ({id: e.id || e.link, title: e.title, link: e.link})),
        type: state.type,
        primaryTitle: state.primaryTitle,
        secondaryTitle: ep && ep.title,
        poster: state.poster,
        providerValue: state.providerValue,
      };
      if (JSON.stringify(params).length > MAX_PAYLOAD) {
        params.episodeList = [params.episodeList[episodeIndex]];
        params.linkIndex = 0;
      }
    }
    usePartyStore.getState().sendContent(params, state.primaryTitle || 'Now playing');
  }, [inRoom, isHost, episodeIndex, state]);

  // host: answer newcomers with the live position
  useEffect(() => {
    if (!inRoom || !isHost) return;
    usePartyStore.getState().registerSnapshot(() => ({
      playing: !mpvRef.current.isPaused,
      position: mpvRef.current.currentTime,
    }));
    return () => usePartyStore.getState().registerSnapshot(null);
  }, [inRoom, isHost]);

  // local pause / play -> room
  useEffect(() => {
    const paused = !!mpv.isPaused;
    if (prevPaused.current === null) {
      prevPaused.current = paused;
      return;
    }
    if (prevPaused.current === paused) return;
    prevPaused.current = paused;
    if (inRoom && armed && Date.now() >= mutedUntil.current) {
      usePartyStore.getState().sendPlayback('play', !paused, mpv.currentTime);
    }
  }, [mpv.isPaused]);

  // local seek (a jump in position) -> room
  useEffect(() => {
    const now = Date.now();
    const prev = lastTime.current;
    const expected = prev.t + (mpv.isPaused ? 0 : ((now - prev.at) / 1000) * (mpv.speed || 1));
    lastTime.current = {t: mpv.currentTime, at: now};
    if (!inRoom || !armed || Date.now() < mutedUntil.current) return;
    if (Math.abs(mpv.currentTime - expected) > 2.5) {
      usePartyStore.getState().sendPlayback('play', !mpv.isPaused, mpv.currentTime);
    }
  }, [mpv.currentTime]);

  // room -> this player
  useEffect(() => {
    if (!inRoom || !armed || !remote) return;
    const p = mpvRef.current;
    const target = remote.position + (remote.playing ? (Date.now() - remote.receivedAt) / 1000 + 0.25 : 0);
    mutedUntil.current = Date.now() + MUTE_MS;
    if (Math.abs(p.currentTime - target) > (remote.kind === 'tick' ? 2.5 : 0.8)) {
      void p.seek(Math.max(0, target));
      lastTime.current = {t: target, at: Date.now()};
    }
    if (remote.playing && p.isPaused) void p.togglePause();
    else if (!remote.playing && !p.isPaused) void p.togglePause();
  }, [inRoom, armed, remote && remote.seq]);

  // host heartbeat
  useEffect(() => {
    if (!inRoom || !isHost || !armed) return;
    const id = setInterval(() => {
      usePartyStore.getState().sendPlayback('tick', !mpvRef.current.isPaused, mpvRef.current.currentTime);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [inRoom, isHost, armed]);
}
