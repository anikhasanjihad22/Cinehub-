import {h, spinner, errorBox, isAbort} from '../lib.js';
import * as backend from '../backend.js';

export const posterCard = (t, onOpen) =>
  h('button', {class: 'card', title: t.title, onclick: () => onOpen(t)},
    t.poster ? h('img', {src: t.poster, alt: t.title, loading: 'lazy'}) : h('div', {class: 'noimg'}, t.title),
    h('div', {class: 'card-meta'}, h('span', {}, t.title), t.year && h('em', {}, t.year)),
  );

const row = (title, items, onOpen) => {
  const track = h('div', {class: 'track'}, items.map(t => posterCard(t, onOpen)));
  const scroll = dir => track.scrollBy({left: dir * track.clientWidth * 0.85, behavior: 'smooth'});
  return h('section', {class: 'row'},
    h('h2', {}, title),
    h('div', {class: 'row-wrap'},
      h('button', {class: 'arrow left', 'aria-label': 'Scroll left', onclick: () => scroll(-1)}, '‹'),
      track,
      h('button', {class: 'arrow right', 'aria-label': 'Scroll right', onclick: () => scroll(1)}, '›'),
    ),
  );
};

export const renderHome = (root, {onOpen}) => {
  const controller = new AbortController();
  const rowsBox = h('div', {class: 'rows'});
  const heroBox = h('div', {class: 'hero-slot'});
  root.replaceChildren(heroBox, rowsBox);

  if (!backend.hasTmdbKey()) {
    rowsBox.append(errorBox('The admin has not set the TMDB key yet, so the catalogue is empty. Try again later.'));
    return () => controller.abort();
  }

  const hero = items => {
    const pick = items.find(t => t.backdrop) || items[0];
    if (!pick) return;
    heroBox.replaceChildren(
      h('div', {class: 'hero', style: {backgroundImage: `url(${pick.backdrop || pick.poster})`}},
        h('div', {class: 'hero-shade'}),
        h('div', {class: 'hero-body'},
          h('h1', {}, pick.title),
          h('div', {class: 'chips'}, pick.year && h('span', {}, pick.year), pick.rating && h('span', {}, `★ ${pick.rating}`), h('span', {}, pick.type === 'tv' ? 'Series' : 'Movie')),
          h('p', {}, pick.overview.length > 220 ? `${pick.overview.slice(0, 220)}…` : pick.overview),
          h('div', {class: 'hero-actions'},
            h('button', {class: 'btn primary', onclick: () => onOpen(pick)}, '▶  Watch'),
            h('button', {class: 'btn', onclick: () => onOpen(pick)}, 'More info')),
        ),
      ),
    );
  };

  const slots = backend.TMDB_ROWS.map(r => {
    const holder = h('div', {class: 'row-holder'});
    rowsBox.append(holder);
    return {r, holder};
  });

  let heroDone = false;
  let cursor = 0;
  let loaded = 0;
  let lastError = '';
  const worker = async () => {
    while (cursor < slots.length && !controller.signal.aborted) {
      const {r, holder} = slots[cursor++];
      holder.append(h('div', {class: 'row-skeleton'}, h('h2', {}, r.title), h('div', {class: 'sk-track'}, Array.from({length: 8}, () => h('div', {class: 'sk-card'})))));
      try {
        const items = await backend.fetchRow(r, controller.signal);
        if (controller.signal.aborted) return;
        if (items.length) {
          holder.replaceChildren(row(r.title, items, onOpen));
          loaded++;
          if (!heroDone) {
            heroDone = true;
            hero(items);
          }
        } else holder.remove();
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        lastError = error.message;
        holder.remove();
      }
    }
  };
  Promise.all(Array.from({length: 4}, worker)).then(() => {
    if (!controller.signal.aborted && loaded === 0) {
      rowsBox.replaceChildren(errorBox(lastError || 'Could not load the catalogue.', () => renderHome(root, {onOpen})));
    }
  });
  return () => controller.abort();
};
