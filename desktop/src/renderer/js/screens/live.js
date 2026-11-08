import {h, spinner, errorBox, isAbort} from '../lib.js';
import * as backend from '../backend.js';
import {openPlayer} from './player.js';

const guessType = url => {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.mpd')) return 'mpd';
  if (u.endsWith('.mp4') || u.endsWith('.mkv')) return 'mp4';
  return 'm3u8'; // extension-less live URLs are almost always HLS
};

export const renderLive = root => {
  const controller = new AbortController();
  const {signal} = controller;
  let channels = [];
  let category = 'All';
  let q = '';
  const grid = h('div', {class: 'live-grid'});
  const chips = h('div', {class: 'tabs scroll'});
  const status = h('div', {class: 'status'});

  const play = ch =>
    openPlayer({
      title: ch.name,
      subtitle: ch.category,
      live: true,
      load: async () => [{link: ch.url, type: guessType(ch.url), headers: ch.headers, server: ch.name}],
    });

  const paint = () => {
    const cats = ['All', ...new Set(channels.map(c => c.category))];
    chips.replaceChildren(...cats.map(c => h('button', {class: `tab${c === category ? ' active' : ''}`, onclick: () => { category = c; paint(); }}, c)));
    const list = channels.filter(c => (category === 'All' || c.category === category) && (!q || c.name.toLowerCase().includes(q)));
    grid.replaceChildren(...list.map(ch =>
      h('button', {class: 'live-card', title: ch.name, onclick: () => play(ch)},
        h('div', {class: 'live-logo'}, ch.logo ? h('img', {src: ch.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onerror: e => e.target.remove()}) : null, h('span', {class: 'live-dot'}, 'LIVE')),
        h('div', {class: 'live-name'}, ch.name))));
    if (!list.length && channels.length) grid.append(h('p', {class: 'muted'}, 'No channels match.'));
  };

  root.replaceChildren(h('div', {class: 'page'},
    h('div', {class: 'search-bar'}, h('input', {class: 'search-input', type: 'search', placeholder: 'Search channels…', oninput: e => { q = e.target.value.trim().toLowerCase(); paint(); }})),
    chips, status, grid));
  status.append(spinner('Loading channels…'));

  (async () => {
    try {
      const sources = await backend.fetchLiveSources();
      if (!sources.length) return status.replaceChildren(h('p', {class: 'muted'}, 'No live channels have been added yet.'));
      const {channels: list, failed} = await window.cinehub.loadLive(sources, signal);
      channels = list;
      if (!channels.length) throw new Error('Could not load any channels right now.');
      status.replaceChildren(failed ? h('p', {class: 'muted'}, `${failed} channel list${failed > 1 ? 's' : ''} could not be loaded.`) : '');
      paint();
    } catch (error) {
      if (!isAbort(error)) status.replaceChildren(errorBox(error.message, () => renderLive(root)));
    }
  })();
  return () => controller.abort();
};
