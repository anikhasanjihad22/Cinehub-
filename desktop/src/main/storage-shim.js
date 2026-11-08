'use strict';
const store = require('./store');

/** Same surface as the Android app's MMKV cookie storage (used by the shared cookie jar). */
const providerCookieStorage = {
  getString: key => store.open('cookies').get(key, undefined),
  setString: (key, value) => store.open('cookies').set(key, value),
  getNumber: key => store.open('cookies').get(`n:${key}`, undefined),
  setNumber: (key, value) => store.open('cookies').set(`n:${key}`, value),
  delete: key => store.open('cookies').delete(key),
};

module.exports = {providerCookieStorage};
