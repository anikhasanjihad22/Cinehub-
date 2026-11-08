'use strict';

/**
 * Provider-supplied URLs are untrusted. Port of the Android app's urlGuard:
 * http/https only, no credentials, no private / local network targets.
 */
const isPrivateIpv4 = ([first, second]) => {
  if (first === 10 || first === 127 || first === 0) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  return first >= 224;
};

const isPrivateHostname = hostname => {
  const n = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (
    n === '' || n === 'localhost' || n === '::1' || n === '::' || n === '0.0.0.0' ||
    n.endsWith('.localhost') || n.endsWith('.local') || n.endsWith('.internal')
  ) {
    return true;
  }
  const v4 = n.split('.');
  if (v4.length === 4) {
    const parts = v4.map(Number);
    if (parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255)) {
      return isPrivateIpv4(parts);
    }
  }
  if (n.includes(':')) {
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(n) || n.startsWith('::ffff:');
  }
  return false;
};

const validateProviderUrl = value => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Provider URL is required');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Provider URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Provider URL is not allowed');
  if (url.username || url.password) throw new Error('Provider URL is not allowed');
  if (isPrivateHostname(url.hostname)) throw new Error('Provider URL is not allowed');
  return url;
};

module.exports = {isPrivateHostname, validateProviderUrl};
