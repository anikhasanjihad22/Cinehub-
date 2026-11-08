// @ts-nocheck
import {useCallback, useEffect, useRef} from 'react';

export const INTRO_MUTE_SECONDS = 5;

/**
 * The first seconds of a video play without sound, whatever the viewer does:
 * volume changes made during that time are remembered and applied afterwards.
 * It follows the playback position, so seeking back to the start mutes again.
 */
export function useIntroMute<T extends {currentTime: number; volume: number; setVolumeLevel: (v: number) => any; isInitialized?: boolean}>(
  mpv: T,
  enabled: boolean,
): T {
  const forced = enabled && mpv.currentTime < INTRO_MUTE_SECONDS;
  const forcedRef = useRef(forced);
  forcedRef.current = forced;
  const rawSet = useRef(mpv.setVolumeLevel);
  rawSet.current = mpv.setVolumeLevel;
  const desired = useRef<number | null>(null);
  const wasForced = useRef(false);

  useEffect(() => {
    if (forced) {
      wasForced.current = true;
      void rawSet.current(0);
    } else if (wasForced.current) {
      wasForced.current = false;
      void rawSet.current(desired.current ?? 100);
    }
  }, [forced, Math.floor(mpv.currentTime), mpv.isInitialized]);

  const setVolumeLevel = useCallback((v: number) => {
    desired.current = v;
    return forcedRef.current ? rawSet.current(0) : rawSet.current(v);
  }, []);

  return {...mpv, setVolumeLevel};
}
