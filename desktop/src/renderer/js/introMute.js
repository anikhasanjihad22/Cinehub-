/**
 * "First N seconds are silent" rule for the video player.
 *
 *  - While playback is inside the first `seconds` of the video, the audio is
 *    forced off. The viewer's own mute / volume choice can never override it.
 *  - Once playback reaches `seconds`, sound comes back automatically (unless the
 *    viewer muted the video themselves).
 *  - Dragging the seek bar back into the first `seconds` mutes again, so the
 *    result is the same however the position was reached.
 *  - Live streams are exempt (`enabled: false`).
 *
 * The element's `muted` flag is owned by this controller; everything else asks
 * it through `setUserMuted()`.
 */
export const isInsideIntro = (currentTime, seconds) =>
  !Number.isFinite(currentTime) || currentTime < seconds;

export const createIntroMute = (video, {seconds = 5, enabled = true, onChange} = {}) => {
  let userMuted = false;
  let introActive = enabled;
  let timer = null;
  let disposed = false;

  const apply = () => {
    if (disposed) return;
    const nowActive = enabled && isInsideIntro(video.currentTime, seconds);
    if (nowActive !== introActive) {
      introActive = nowActive;
      onChange?.({introActive});
    }
    const shouldMute = introActive || userMuted;
    if (video.muted !== shouldMute) video.muted = shouldMute;
    // Fine-grained polling only while it matters: sound returns within ~50 ms of 5.0 s.
    if (introActive && !timer) timer = setInterval(apply, 50);
    if (!introActive && timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // Anything that changes position or the muted flag re-evaluates the rule.
  const events = ['loadstart', 'loadedmetadata', 'durationchange', 'play', 'playing', 'timeupdate', 'seeking', 'seeked', 'volumechange', 'emptied'];
  events.forEach(e => video.addEventListener(e, apply));

  // Silent from the very first frame, before any position is known.
  if (enabled) video.muted = true;
  apply();

  return {
    isIntroActive: () => introActive,
    isUserMuted: () => userMuted,
    setUserMuted(value) {
      userMuted = Boolean(value);
      apply();
    },
    /** Call when the source changes: a new video starts silent again. */
    reset() {
      introActive = enabled;
      if (enabled) video.muted = true;
      apply();
    },
    dispose() {
      disposed = true;
      events.forEach(e => video.removeEventListener(e, apply));
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
};
