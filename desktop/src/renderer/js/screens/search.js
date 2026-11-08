import {h, spinner, errorBox, isAbort} from '../lib.js';
import * as backend from '../backend.js';
import {posterCard} from './home.js';

export const renderSearch = (root, {query = '', tab: initialTab = 'catalogue', serverId, onOpen, onOpenPost, onQuery}) => {
  let controller = new AbortController();
  let tab = initialTab;
  let q = query;
  const results = h('div', {class: 'grid'});
  const status = h('div', {class: 'status'});

  const input = h('input', {
    class: 'search-input', type: 'search', placeholder: 'Search movies and series…', value: q, autofocus: true,
    oninput: e => { q = e.target.value; schedule(); },
  });
  const tabs = ['catalogue', 'server'].map(id =>
    h('button', {class: 'tab', 'data-tab': id, onclick: () => { tab = id; paintTabs(); run(); }}, id === 'catalogue' ? 'Catalogue' : 'Server results'));
  const paintTabs = () => tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 450); };

  const postCard = p =>
    h('button', {class: 'card', title: p.title, onclick: () => onOpenPost(p)},
      p.image ? h('img', {src: p.image, alt: p.title, loading: 'lazy', referrerPolicy: 'no-referrer'}) : h('div', {class: 'noimg'}, p.title),
      h('div', {class: 'card-meta'}, h('span', {}, p.title)));

  async function run() {
    controller.abort();
    controller = new AbortController();
    const {signal} = controller;
    const text = q.trim();
    onQuery?.(text);
    results.replaceChildren();
    status.replaceChildren();
    if (text.length < 2) return;
    status.append(spinner('Searching…'));
    try {
      if (tab === 'catalogue') {
        if (!backend.hasTmdbKey()) throw new Error('Catalogue search is unavailable (no TMDB key). Use Server results.');
        const found = await backend.searchTmdb(text, signal);
        status.replaceChildren(found.length ? '' : h('p', {class: 'muted'}, 'Nothing found. Try “Server results”.'));
        results.replaceChildren(...found.map(t => posterCard(t, onOpen)));
      } else {
        if (!serverId) throw new Error('No server is available yet.');
        const posts = await window.cinehub.providers.search(serverId, text, signal);
        status.replaceChildren(posts.length ? '' : h('p', {class: 'muted'}, 'No results on this server.'));
        results.replaceChildren(...posts.map(postCard));
      }
    } catch (error) {
      if (isAbort(error) || signal.aborted) return;
      status.replaceChildren(errorBox(error.message, run));
    }
  }

  root.replaceChildren(h('div', {class: 'page'}, h('div', {class: 'search-bar'}, input, h('div', {class: 'tabs'}, tabs)), status, results));
  paintTabs();
  if (q.trim().length >= 2) run();
  setTimeout(() => input.focus(), 0);
  return () => { clearTimeout(timer); controller.abort(); };
};
