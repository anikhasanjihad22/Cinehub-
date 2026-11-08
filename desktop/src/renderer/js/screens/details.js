import {h, spinner, errorBox, isAbort, toast} from '../lib.js';
import * as backend from '../backend.js';
import {openPlayer} from './player.js';

/**
 * Title page. Opened either from the catalogue (`title`, a TMDB entry that is
 * looked up on the selected server) or from a server search result (`post`).
 */
export const renderDetails = (root, {title, post, serverId, serverName, onBack, onSearchServer}) => {
  const controller = new AbortController();
  const {signal} = controller;
  const body = h('div', {class: 'details-body'});
  const headerBox = h('div', {});
  root.replaceChildren(h('div', {class: 'details'}, headerBox, body));

  let tmdb = title || null;
  let info = null;
  let groups = [];
  let active = 0;
  let playBtn = null;

  const typeForStream = () => info?.type || (tmdb?.type === 'tv' ? 'series' : 'movie');

  /* ── header ── */
  const paintHeader = () => {
    const t = tmdb || {title: info?.title || post?.title, overview: info?.synopsis, backdrop: info?.image, poster: post?.image || info?.image};
    headerBox.replaceChildren(
      h('div', {class: 'd-hero', style: {backgroundImage: t.backdrop ? `url(${t.backdrop})` : ''}},
        h('div', {class: 'hero-shade'}),
        h('button', {class: 'btn back-btn', onclick: onBack}, '← Back'),
        h('div', {class: 'd-info'},
          t.poster && h('img', {class: 'd-poster', src: t.poster, alt: '', referrerPolicy: 'no-referrer'}),
          h('div', {class: 'd-text'},
            t.logo ? h('img', {class: 'd-logo', src: t.logo, alt: t.title}) : h('h1', {}, t.title),
            h('div', {class: 'chips'},
              t.year && h('span', {}, t.year), t.rating && h('span', {}, `★ ${t.rating}`),
              t.type && h('span', {}, t.type === 'tv' ? 'Series' : 'Movie'),
              t.runtime ? h('span', {}, `${t.runtime} min`) : null,
              (t.genres || info?.tags || []).slice(0, 4).map(g => h('span', {}, g))),
            t.tagline && h('p', {class: 'tagline'}, t.tagline),
            h('p', {class: 'overview'}, t.overview || info?.synopsis || ''),
            t.cast?.length ? h('p', {class: 'muted'}, `Cast: ${t.cast.join(', ')}`) : null,
            h('div', {class: 'hero-actions'}, playBtn = h('button', {class: 'btn primary', disabled: true, onclick: () => playFirst()}, 'Finding on server…')),
          ),
        ),
      ),
    );
  };

  /* ── resolve on the selected server ── */
  const resolve = async () => {
    if (!serverId) throw new Error('No server is available yet. Ask the admin to add one.');
    let link = post?.link;
    if (!link) {
      const posts = await window.cinehub.providers.search(serverId, tmdb.title, signal);
      const match = backend.bestMatch(posts, tmdb.title, tmdb.year);
      if (!match) {
        const e = new Error(`“${tmdb.title}” was not found on ${serverName || 'this server'}.`);
        e.notFound = true;
        throw e;
      }
      link = match.link;
    }
    info = await window.cinehub.providers.meta(serverId, link, signal);
    groups = (info?.linkList || []).filter(g => g && (g.episodesLink || g.directLinks?.length));
    if (!groups.length) throw new Error('This server has no links for this title.');
  };

  const itemsOf = async group => {
    if (group.items) return group.items;
    group.items = group.directLinks?.length
      ? group.directLinks
      : (await window.cinehub.providers.episodes(serverId, group.episodesLink, signal)).map(e => ({...e, type: 'series'}));
    return group.items;
  };

  /* ── playback ── */
  const play = (gi, ii) => {
    const group = groups[gi];
    const items = group.items;
    const make = (g, i) => ({
      title: tmdb?.title || info?.title || post?.title || 'CineHub',
      subtitle: [group.title, items[i]?.title].filter(Boolean).join(' · '),
      load: s => window.cinehub.providers.stream(serverId, items[i].link, items[i].type || typeForStream(), s),
      onNext: i + 1 < items.length ? async () => make(g, i + 1) : null,
      onClose: () => paintList(),
    });
    openPlayer(make(gi, ii));
  };

  const playFirst = async () => {
    playBtn.disabled = true;
    try {
      await itemsOf(groups[active]);
      if (!groups[active].items.length) throw new Error('No episodes found.');
      play(active, 0);
    } catch (error) {
      if (!isAbort(error)) toast(error.message);
    } finally {
      playBtn.disabled = false;
    }
  };

  /* ── list ── */
  const paintList = async () => {
    const tabs = groups.length > 1
      ? h('div', {class: 'tabs scroll'}, groups.map((g, i) => h('button', {class: `tab${i === active ? ' active' : ''}`, onclick: () => { active = i; paintList(); }}, g.title || `Part ${i + 1}`, g.quality ? ` · ${g.quality}` : '')))
      : null;
    const list = h('div', {class: 'ep-list'}, spinner('Loading…'));
    body.replaceChildren(tabs, list);
    try {
      const items = await itemsOf(groups[active]);
      if (signal.aborted) return;
      list.replaceChildren(...(items.length ? items.map((it, i) =>
        h('button', {class: 'ep', onclick: () => play(active, i)},
          it.image ? h('img', {src: it.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer'}) : h('div', {class: 'ep-n'}, String(i + 1)),
          h('div', {class: 'ep-t'}, h('b', {}, it.title || `Item ${i + 1}`), it.description && h('span', {}, it.description)),
          h('span', {class: 'ep-play'}, '▶'))) : [h('p', {class: 'muted'}, 'Nothing to play here.')]));
    } catch (error) {
      if (!isAbort(error)) list.replaceChildren(errorBox(error.message, paintList));
    }
  };

  /* ── start ── */
  (async () => {
    try {
      if (tmdb) tmdb = {...tmdb, ...(await backend.fetchDetails(tmdb.type, tmdb.id, signal).catch(() => ({})))};
    } catch { /* artwork is optional */ }
    if (signal.aborted) return;
    paintHeader();
    body.replaceChildren(spinner(`Looking on ${serverName || 'the server'}…`));
    try {
      await resolve();
      if (signal.aborted) return;
      paintHeader();
      playBtn.disabled = false;
      playBtn.textContent = '▶  Play';
      paintList();
    } catch (error) {
      if (isAbort(error) || signal.aborted) return;
      playBtn.textContent = 'Not available';
      body.replaceChildren(h('div', {class: 'error-box'}, h('p', {}, error.message),
        error.notFound && tmdb && h('p', {class: 'muted'}, 'Try another server from the menu at the top, or search it by hand.'),
        h('div', {class: 'row-actions'},
          error.notFound && tmdb && h('button', {class: 'btn', onclick: () => onSearchServer(tmdb.title)}, 'Search on server'),
          h('button', {class: 'btn', onclick: onBack}, 'Back'))));
    }
  })();

  return () => controller.abort();
};
