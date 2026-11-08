import {h, clear, toast, pref, spinner, errorBox} from './lib.js';
import * as backend from './backend.js';
import {renderAuth} from './screens/auth.js';
import {renderHome} from './screens/home.js';
import {renderSearch} from './screens/search.js';
import {renderDetails} from './screens/details.js';
import {renderLive} from './screens/live.js';

const app = document.getElementById('app');

const S = {
  user: null,
  profile: null,
  providers: [],
  serverId: null,
  view: null, // {name, params}
  stack: [],
  cleanup: null,
  query: '',
};

const serverName = () => S.providers.find(p => p.id === S.serverId)?.name || '';

/* ───────────── navigation ───────────── */

const go = (name, params = {}) => {
  S.view = {name, params};
  drawView();
};

const back = () => {
  const prev = S.stack.pop();
  if (prev) {
    S.view = prev;
    drawView();
  } else go('home', {});
};

let content = null;
let nav = null;

const drawView = () => {
  S.cleanup?.();
  S.cleanup = null;
  const {name, params} = S.view;
  nav?.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === (name === 'details' ? S.stack[0]?.name || 'home' : name)));
  content.scrollTop = 0;
  const openTitle = t => { S.stack.push(S.view); go('details', {title: t}); };
  const openPost = p => { S.stack.push(S.view); go('details', {post: p}); };
  switch (name) {
    case 'home':
      S.cleanup = renderHome(content, {onOpen: openTitle});
      break;
    case 'search':
      S.cleanup = renderSearch(content, {
        query: params.query ?? S.query, tab: params.tab, serverId: S.serverId, onOpen: openTitle, onOpenPost: openPost,
        onQuery: q => (S.query = q),
      });
      break;
    case 'live':
      S.cleanup = renderLive(content);
      break;
    case 'details':
      S.cleanup = renderDetails(content, {
        ...params, serverId: S.serverId, serverName: serverName(), onBack: back,
        onSearchServer: q => { S.query = q; S.stack.length = 0; go('search', {query: q, tab: 'server'}); },
      });
      break;
  }
};

/* ───────────── shell ───────────── */

const avatar = () => {
  const name = S.profile?.display_name || S.user?.email || '?';
  return h('div', {class: 'avatar', style: {background: S.profile?.avatar_color || '#E50914'}}, name.trim()[0]?.toUpperCase() || '?');
};

const changeServer = id => {
  S.serverId = id;
  pref.set('server', id);
  toast(`Server: ${serverName()}`);
  if (S.view.name === 'details') back();
};

const accountMenu = () => {
  const menu = h('div', {class: 'dropdown'},
    h('div', {class: 'dd-head'}, h('b', {}, S.profile?.display_name || 'Account'), h('span', {}, S.user?.email || '')),
    S.providers.length > 0 && h('div', {class: 'dd-sec'}, h('div', {class: 'dd-title'}, 'Server'),
      S.providers.map(p => h('button', {class: `dd-item${p.id === S.serverId ? ' active' : ''}`, onclick: () => { changeServer(p.id); menu.remove(); }}, p.id === S.serverId ? '✓ ' : '', p.name))),
    S.providers.length === 0 && h('div', {class: 'dd-sec muted'}, 'No servers yet'),
    h('button', {class: 'dd-item', onclick: async () => { menu.remove(); await refreshServers(true); }}, '↻ Refresh servers'),
    h('button', {class: 'dd-item danger', onclick: async () => { menu.remove(); await backend.signOut(); }}, 'Sign out'),
  );
  setTimeout(() => document.addEventListener('click', () => menu.remove(), {once: true}), 0);
  return menu;
};

const drawShell = () => {
  content = h('main', {class: 'content'});
  const accountBtn = h('button', {class: 'avatar-btn', title: 'Account & servers', onclick: e => {
    e.stopPropagation();
    document.querySelector('.dropdown')?.remove();
    accountBtn.parentElement.append(accountMenu());
  }}, avatar());
  nav = h('header', {class: 'topbar'},
    h('div', {class: 'brand', onclick: () => { S.stack.length = 0; go('home', {}); }}, 'CINE', h('b', {}, 'HUB')),
    h('nav', {},
      [['home', 'Home'], ['search', 'Search'], ['live', 'Live TV']].map(([id, label]) =>
        h('button', {class: 'nav-btn', 'data-nav': id, onclick: () => { S.stack.length = 0; go(id, {}); }}, label))),
    h('div', {class: 'grow'}),
    S.serverId && h('span', {class: 'server-pill', title: 'Current server'}, serverName()),
    h('div', {class: 'account'}, accountBtn),
  );
  app.replaceChildren(h('div', {class: 'shell'}, nav, content));
};

/* ───────────── boot ───────────── */

const refreshServers = async (announce = false) => {
  const {providers, errors} = await backend.syncServers();
  S.providers = providers;
  const saved = pref.get('server', null);
  S.serverId = providers.find(p => p.id === saved)?.id || providers[0]?.id || null;
  pref.set('server', S.serverId);
  if (announce) toast(errors.length ? `Servers refreshed with problems: ${errors[0]}` : 'Servers up to date');
  if (content) {
    drawShell();
    if (S.view) drawView();
  }
  return errors;
};

const startApp = async user => {
  S.user = user;
  S.stack = [];
  app.replaceChildren(h('div', {class: 'splash'}, h('div', {class: 'brand big'}, 'CINE', h('b', {}, 'HUB')), spinner('Setting up your servers…')));
  backend.fetchProfile(user.id).then(p => { S.profile = p; if (content) drawShell(), drawView(); });
  const [key] = await Promise.allSettled([backend.fetchTmdbKey(), refreshServers()]);
  backend.setTmdbKey(key.status === 'fulfilled' ? key.value : '');
  drawShell();
  go('home', {});
};

const showAuth = () => {
  S.cleanup?.();
  S.user = null;
  S.profile = null;
  S.view = null;
  content = null;
  nav = null;
  renderAuth(app, {onDone: () => {}});
};

backend.supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION') return;
  if (event === 'SIGNED_OUT' || !session) return showAuth();
  if (event === 'SIGNED_IN' && session.user.id !== S.user?.id) startApp(session.user);
});

(async () => {
  try {
    const {data} = await backend.supabase.auth.getSession();
    if (data.session) startApp(data.session.user);
    else showAuth();
  } catch (error) {
    app.replaceChildren(errorBox(error.message || 'Could not start.', () => location.reload()));
  }
})();
