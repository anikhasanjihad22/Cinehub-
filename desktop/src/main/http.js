'use strict';
const {validateProviderUrl, isPrivateHostname} = require('./urlGuard');
const jar = require('./generated/cookieJar.cjs');

const REQUEST_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 10;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const REDIRECT = new Set([301, 302, 303, 307, 308]);

// Desktop Chrome identity for provider requests (the Android app sends a phone UA).
const COMMON_HEADERS = {
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="124", "Google Chrome";v="124"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const normalizeHeaders = entries => {
  const merged = {...COMMON_HEADERS};
  for (const [rawKey, value] of entries || []) {
    const key = String(rawKey).trim();
    if (!key || /^set-cookie2?$/i.test(key)) continue;
    if (/[\r\n]/.test(key) || /[\r\n]/.test(String(value))) throw new Error('Invalid header value');
    merged[key] = String(value);
  }
  return merged;
};

const deleteHeader = (headers, name) => {
  for (const k of Object.keys(headers)) if (k.toLowerCase() === name.toLowerCase()) delete headers[k];
};
const hasHeader = (headers, name) => Object.keys(headers).some(k => k.toLowerCase() === name.toLowerCase());

const toBody = body => {
  if (!body || body.kind === 'none') return undefined;
  if (body.kind === 'text') return body.value;
  return Buffer.from(body.value, 'base64');
};

/**
 * Executes one provider HTTP request for the sandbox. Redirects are followed by
 * hand so every hop is re-validated (a public URL must not bounce into the LAN).
 * Cookies live in the provider author's own jar.
 */
const providerFetch = async (author, rawUrl, request, signal) => {
  let url = validateProviderUrl(rawUrl);
  const headers = normalizeHeaders(request?.headers);
  const body = request?.body || {kind: 'none'};
  if (body.kind === 'base64' && body.contentType && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] = body.contentType;
  }
  const cookieKey = Object.keys(headers).find(k => k.toLowerCase() === 'cookie');
  const supplied = cookieKey ? headers[cookieKey] : undefined;
  if (cookieKey) delete headers[cookieKey];

  const followRedirects = request?.redirect !== 'manual';
  let method = String(request?.method || 'GET').toUpperCase();
  let payload = toBody(body);

  for (let hop = 0; ; hop++) {
    const cookie = jar.buildRequestCookieHeader(author, url.toString(), hop === 0 ? supplied : undefined);
    const reqHeaders = {...headers};
    if (cookie) reqHeaders.Cookie = cookie;

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : payload,
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });

    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookies.length) jar.storeSetCookies(author, url.toString(), setCookies);

    const location = res.headers.get('location');
    if (followRedirects && REDIRECT.has(res.status) && location) {
      if (hop >= MAX_REDIRECTS) throw new Error('Too many provider redirects');
      let next;
      try {
        next = validateProviderUrl(new URL(location, url).toString());
      } catch {
        throw new Error('Provider request redirected to a blocked host');
      }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'GET' && method !== 'HEAD')) {
        if (method !== 'HEAD') method = 'GET';
        payload = undefined;
        deleteHeader(headers, 'content-type');
        deleteHeader(headers, 'content-length');
      }
      if (next.host !== url.host) deleteHeader(headers, 'authorization');
      url = next;
      continue;
    }

    if (isPrivateHostname(url.hostname)) throw new Error('Provider request redirected to a blocked host');
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Provider response is too large');

    const outHeaders = [];
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') outHeaders.push([key, value]);
    });
    for (const sc of setCookies) {
      outHeaders.push(['set-cookie', sc]);
      outHeaders.push(['x-set-cookie', sc]);
    }
    return {
      status: res.status,
      statusText: res.statusText || '',
      url: url.toString(),
      headers: outHeaders,
      bodyBase64: bytes.toString('base64'),
    };
  }
};

module.exports = {providerFetch, COMMON_HEADERS, MAX_RESPONSE_BYTES};
