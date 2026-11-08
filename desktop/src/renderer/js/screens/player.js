import Hls from 'hls.js';
import * as dashjs from 'dashjs';
import {h, fmtTime, toast} from '../lib.js';
import {createIntroMute} from '../introMute.js';
import {INTRO_MUTE_SECONDS} from '../config.js';

const kindOf = stream => {
  const type = String(stream.type || '').toLowerCase();
  const url = String(stream.link || '').toLowerCase().split('?')[0];
  if (type === 'm3u8' || type === 'hls' || url.endsWith('.m3u8')) return 'hls';
  if (type === 'mpd' || type === 'dash' || url.endsWith('.mpd')) return 'dash';
  return 'native';
};

const srtToVtt = text => {
  const body = text.replace(/\r/g, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2');
  return body.startsWith('WEBVTT') ? body : `WEBVTT\n\n${body}`;
};

const qualityLabel = (s, i) =>
  [s.server || `Source ${i + 1}`, s.quality && `${s.quality}${/^\d+$/.test(String(s.quality)) ? 'p' : ''}`].filter(Boolean).join(' · ');

/**
 * Full-window video player.
 *
 * opts: {title, subtitle, live, load(signal) → streams[], onClose, onNext?}
 * The first INTRO_MUTE_SECONDS of every non-live video are silent and cannot be
 * unmuted (see introMute.js); live TV plays with sound straight away.
 */
export const openPlayer = initial => {
  let opts = initial;
  let streams = [];
  let index = 0;
  let hls = null;
  let dash = null;
  let loadCtl = null;
  let hideTimer = null;
  let subtitleUrl = null;
  let closed = false;
  let seeking = false;

  const video = h('video', {playsInline: true, preload: 'auto', crossOrigin: 'anonymous'});
  const intro = createIntroMute(video, {seconds: INTRO_MUTE_SECONDS, enabled: !opts.live, onChange: () => paintVolume()});

  const titleEl = h('div', {class: 'p-title'});
  const status = h('div', {class: 'p-status'});
  const badge = h('div', {class: 'p-badge', hidden: true});
  const seek = h('input', {type: 'range', class: 'p-seek', min: 0, max: 1000, value: 0, step: 1});
  const timeEl = h('span', {class: 'p-time'}, '0:00');
  const playBtn = h('button', {class: 'p-btn', title: 'Play / Pause (Space)', onclick: () => togglePlay()}, '▶');
  const back10 = h('button', {class: 'p-btn', title: 'Back 10s (←)', onclick: () => skip(-10)}, '⟲10');
  const fwd10 = h('button', {class: 'p-btn', title: 'Forward 10s (→)', onclick: () => skip(10)}, '10⟳');
  const muteBtn = h('button', {class: 'p-btn', title: 'Mute (M)', onclick: () => toggleMute()}, '🔊');
  const vol = h('input', {type: 'range', class: 'p-vol', min: 0, max: 1, step: 0.02, value: 1,
    oninput: e => { video.volume = Number(e.target.value); }});
  const menuBtn = h('button', {class: 'p-btn', title: 'Source, speed & subtitles', onclick: e => { e.stopPropagation(); toggleMenu(); }}, '⚙');
  const fsBtn = h('button', {class: 'p-btn', title: 'Fullscreen (F)', onclick: () => toggleFullscreen()}, '⛶');
  const nextBtn = h('button', {class: 'btn primary p-next', hidden: true, onclick: () => goNext()}, 'Next episode ▶');
  const menu = h('div', {class: 'p-menu', hidden: true, onclick: e => e.stopPropagation()});

  const closeBtn = h('button', {class: 'p-btn back', title: 'Back (Esc)', onclick: () => close()}, '←');
  const root = h('div', {class: 'player', tabindex: 0},
    video,
    h('div', {class: 'p-top'}, closeBtn, titleEl),
    status, badge, nextBtn,
    h('div', {class: 'p-bottom'},
      h('div', {class: 'p-seekrow'}, seek, timeEl),
      h('div', {class: 'p-row'}, playBtn, back10, fwd10, muteBtn, vol, h('span', {class: 'grow'}), menuBtn, fsBtn)),
    menu,
  );

  /* ── helpers ── */
  const setStatus = (content, kind = '') => {
    status.className = `p-status ${kind}`;
    status.replaceChildren(...(content ? [].concat(content) : []));
  };
  const showControls = () => {
    root.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!video.paused && menu.hidden) root.classList.remove('show');
    }, 3000);
  };

  function paintVolume() {
    const locked = intro.isIntroActive();
    muteBtn.disabled = locked;
    vol.disabled = locked;
    muteBtn.textContent = video.muted ? '🔇' : '🔊';
    muteBtn.title = locked ? `Sound starts after ${INTRO_MUTE_SECONDS} seconds` : 'Mute (M)';
    badge.hidden = !(locked && video.readyState > 0);
    if (locked) {
      const left = Math.max(1, Math.ceil(INTRO_MUTE_SECONDS - video.currentTime));
      badge.textContent = `🔇 Sound starts in ${left}s`;
    }
  }
  const paintTime = () => {
    const d = video.duration;
    if (opts.live || !Number.isFinite(d)) {
      timeEl.textContent = opts.live ? 'LIVE' : fmtTime(video.currentTime);
      seek.style.visibility = opts.live || !Number.isFinite(d) ? 'hidden' : 'visible';
      return;
    }
    seek.style.visibility = 'visible';
    timeEl.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(d)}`;
    if (!seeking) seek.value = String(Math.round((video.currentTime / d) * 1000));
    const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    seek.style.setProperty('--buf', `${Math.min(100, (buffered / d) * 100)}%`);
    seek.style.setProperty('--pos', `${(video.currentTime / d) * 100}%`);
  };

  const togglePlay = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  const skip = s => {
    if (opts.live || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + s));
  };
  const toggleMute = () => {
    if (intro.isIntroActive()) return; // cannot unmute during the silent intro
    intro.setUserMuted(!intro.isUserMuted());
    paintVolume();
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen().catch(() => {});
  };

  /* ── engines ── */
  const destroyEngine = () => {
    if (hls) { hls.destroy(); hls = null; }
    if (dash) { dash.reset(); dash = null; }
    if (subtitleUrl) { URL.revokeObjectURL(subtitleUrl); subtitleUrl = null; }
    video.querySelectorAll('track').forEach(t => t.remove());
    video.removeAttribute('src');
    video.load();
  };

  const tryNext = reason => {
    if (closed) return;
    if (index + 1 < streams.length) {
      index++;
      toast(`${reason} Trying another source…`);
      startStream();
    } else {
      setStatus([h('p', {}, opts.live ? 'This channel is not available right now.' : 'Could not play this video.'), h('button', {class: 'btn', onclick: () => close()}, 'Go back')], 'err');
    }
  };

  async function startStream() {
    const stream = streams[index];
    destroyEngine();
    intro.reset(); // every new source starts silent again
    nextBtn.hidden = true;
    setStatus(h('div', {class: 'spin'}));
    try {
      await window.cinehub.setStreamHeaders(stream.headers || null);
    } catch { /* headers are best effort */ }
    if (closed) return;
    const kind = kindOf(stream);
    try {
      if (kind === 'hls' && Hls.isSupported()) {
        hls = new Hls({enableWorker: true, maxBufferLength: 40, lowLatencyMode: Boolean(opts.live)});
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return hls.recoverMediaError();
          tryNext('Stream error.');
        });
        hls.loadSource(stream.link);
        hls.attachMedia(video);
      } else if (kind === 'dash') {
        dash = dashjs.MediaPlayer().create();
        dash.on('error', () => tryNext('Stream error.'));
        dash.initialize(video, stream.link, false);
      } else {
        video.src = stream.link;
      }
      addSubtitles(stream);
      video.play().catch(() => {});
    } catch (error) {
      tryNext(error.message || 'Stream error.');
    }
  }

  const addSubtitles = stream => {
    (stream.subtitles || []).slice(0, 12).forEach(sub => {
      if (!sub?.uri) return;
      const t = h('track', {kind: 'subtitles', label: sub.title || sub.language || 'Subtitles', srclang: String(sub.language || 'en').slice(0, 5), 'data-uri': sub.uri});
      video.append(t);
      t.track.mode = 'disabled';
    });
  };

  const selectSubtitle = async trackEl => {
    for (const t of video.querySelectorAll('track')) t.track.mode = 'disabled';
    if (!trackEl) return;
    try {
      if (!trackEl.src) {
        const res = await fetch(trackEl.dataset.uri);
        const text = srtToVtt(await res.text());
        trackEl.src = URL.createObjectURL(new Blob([text], {type: 'text/vtt'}));
      }
      trackEl.track.mode = 'showing';
    } catch {
      toast('Could not load that subtitle.');
    }
  };

  /* ── menu ── */
  const section = (title, items) =>
    h('div', {class: 'm-sec'}, h('div', {class: 'm-title'}, title),
      items.map(({label, active, onClick}) => h('button', {class: `m-item${active ? ' active' : ''}`, onclick: () => { onClick(); menu.hidden = true; }}, active ? '✓ ' : '', label)));

  const toggleMenu = () => {
    if (!menu.hidden) { menu.hidden = true; return; }
    const subs = [...video.querySelectorAll('track')];
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    menu.replaceChildren(
      streams.length > 1 && section('Source', streams.map((s, i) => ({label: qualityLabel(s, i), active: i === index, onClick: () => { const t = video.currentTime; index = i; startStream().then(() => { if (!opts.live && t > 1) video.addEventListener('loadedmetadata', () => (video.currentTime = t), {once: true}); }); }}))),
      !opts.live && section('Speed', rates.map(r => ({label: `${r}x`, active: video.playbackRate === r, onClick: () => (video.playbackRate = r)}))),
      subs.length > 0 && section('Subtitles', [{label: 'Off', active: !subs.some(t => t.track.mode === 'showing'), onClick: () => selectSubtitle(null)}, ...subs.map(t => ({label: t.label, active: t.track.mode === 'showing', onClick: () => selectSubtitle(t)}))]),
    );
    menu.hidden = false;
    showControls();
  };

  /* ── lifecycle ── */
  async function begin(next) {
    opts = next;
    index = 0;
    streams = [];
    loadCtl?.abort();
    loadCtl = new AbortController();
    titleEl.replaceChildren(h('b', {}, opts.title), opts.subtitle && h('span', {}, opts.subtitle));
    setStatus([h('div', {class: 'spin'}), h('span', {}, 'Getting the stream…')]);
    seek.style.visibility = 'hidden';
    try {
      streams = await opts.load(loadCtl.signal);
      streams = (streams || []).filter(s => s && /^https?:/i.test(s.link || ''));
      if (closed) return;
      if (!streams.length) throw new Error('No playable stream was found.');
      await startStream();
    } catch (error) {
      if (closed || loadCtl.signal.aborted) return;
      setStatus([h('p', {}, error.message || 'Could not load the stream.'), h('button', {class: 'btn', onclick: () => close()}, 'Go back')], 'err');
    }
  }

  const goNext = async () => {
    if (!opts.onNext) return;
    try {
      const nextOpts = await opts.onNext();
      if (nextOpts) await begin(nextOpts); // startStream() resets the silent intro for the new video
    } catch (error) {
      toast(error.message || 'Could not open the next episode.');
    }
  };

  const onKey = e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': case 'j': e.preventDefault(); skip(-10); break;
      case 'ArrowRight': case 'l': e.preventDefault(); skip(10); break;
      case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); break;
      case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); break;
      case 'm': toggleMute(); break;
      case 'f': toggleFullscreen(); break;
      case 'Escape': if (document.fullscreenElement) document.exitFullscreen(); else close(); break;
      default: return;
    }
    showControls();
  };

  function close() {
    if (closed) return;
    closed = true;
    loadCtl?.abort();
    clearTimeout(hideTimer);
    document.removeEventListener('keydown', onKey, true);
    intro.dispose();
    destroyEngine();
    window.cinehub.setStreamHeaders(null).catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    root.remove();
    opts.onClose?.();
  }

  /* ── events ── */
  video.addEventListener('playing', () => { setStatus(null); paintVolume(); });
  video.addEventListener('waiting', () => setStatus(h('div', {class: 'spin'})));
  video.addEventListener('canplay', () => setStatus(null));
  video.addEventListener('play', () => { playBtn.textContent = '❚❚'; showControls(); });
  video.addEventListener('pause', () => { playBtn.textContent = '▶'; showControls(); });
  video.addEventListener('timeupdate', () => { paintTime(); paintVolume(); });
  video.addEventListener('durationchange', paintTime);
  video.addEventListener('volumechange', () => { if (!intro.isIntroActive()) vol.value = String(video.volume); paintVolume(); });
  video.addEventListener('seeking', paintVolume);
  video.addEventListener('ended', () => { if (opts.onNext) nextBtn.hidden = false; });
  video.addEventListener('error', () => { if (!closed && video.getAttribute('src')) tryNext('Playback error.'); });
  video.addEventListener('click', () => togglePlay());
  video.addEventListener('dblclick', () => toggleFullscreen());
  seek.addEventListener('input', () => { seeking = true; if (Number.isFinite(video.duration)) video.currentTime = (Number(seek.value) / 1000) * video.duration; });
  seek.addEventListener('change', () => { seeking = false; });
  root.addEventListener('mousemove', showControls);
  root.addEventListener('click', () => { menu.hidden = true; });
  document.addEventListener('keydown', onKey, true);

  document.body.append(root);
  root.focus();
  showControls();
  begin(opts);
  return {close, video, intro, root};
};
