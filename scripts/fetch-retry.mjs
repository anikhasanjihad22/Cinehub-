// Retries GitHub download hiccups (HTTP 5xx / 429 / network errors).
const realFetch = globalThis.fetch;
if (realFetch && !globalThis.__fetchRetryInstalled) {
  globalThis.__fetchRetryInstalled = true;
  globalThis.fetch = async function fetchWithRetry(input, init) {
    const attempts = 5;
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
      try {
        const res = await realFetch(input, init);
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`HTTP ${res.status}`);
          if (i === attempts) return res;
        } else {
          return res;
        }
      } catch (err) {
        lastErr = err;
        if (i === attempts) throw err;
      }
      const wait = 3000 * i;
      console.warn(`[fetch-retry] attempt ${i}/${attempts} failed (${lastErr.message}); retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
    throw lastErr;
  };
}
