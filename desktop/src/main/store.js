'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Tiny persistent key/value store (one JSON file per namespace) kept in the
 * user's app-data folder. Writes are debounced and atomic.
 */
class JsonStore {
  constructor(dir, name) {
    this.file = path.join(dir, `${name}.json`);
    this.data = {};
    this.timer = null;
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {};
    } catch {
      this.data = {};
    }
  }
  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }
  set(key, value) {
    if (value === undefined) delete this.data[key];
    else this.data[key] = value;
    this.schedule();
  }
  delete(key) {
    delete this.data[key];
    this.schedule();
  }
  keys() {
    return Object.keys(this.data);
  }
  clear() {
    this.data = {};
    this.schedule();
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 400);
  }
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), {recursive: true});
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.warn('store write failed', this.file, error);
    }
  }
}

const stores = new Map();
let baseDir = null;

const init = dir => {
  baseDir = dir;
};

const open = name => {
  if (!baseDir) throw new Error('store.init() was not called');
  if (!stores.has(name)) stores.set(name, new JsonStore(baseDir, name));
  return stores.get(name);
};

const flushAll = () => stores.forEach(s => s.flush());

module.exports = {init, open, flushAll};
