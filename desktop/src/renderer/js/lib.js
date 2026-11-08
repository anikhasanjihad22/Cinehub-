/** Tiny DOM helpers (no framework). */
export const h = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
};

export const clear = el => {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
};

export const toast = (message, ms = 3500) => {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = h('div', {class: 'toast'}, message);
  box.append(t);
  setTimeout(() => t.remove(), ms);
};

export const pref = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`cinehub:${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`cinehub:${key}`, JSON.stringify(value));
    } catch { /* storage unavailable */ }
  },
};

export const fmtTime = seconds => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

export const spinner = (label = '') => h('div', {class: 'loading'}, h('div', {class: 'spin'}), label && h('span', {}, label));
export const errorBox = (message, retry) =>
  h('div', {class: 'error-box'}, h('p', {}, message), retry && h('button', {class: 'btn', onclick: retry}, 'Try again'));

export const isAbort = e => e && (e.name === 'AbortError' || e.message === 'Cancelled');
