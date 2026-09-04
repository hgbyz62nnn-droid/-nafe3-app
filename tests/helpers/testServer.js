// Boots the real Express app (app.js - the same one server.js runs in
// production) against a fresh, isolated, throwaway SQLite database per test
// file, so these are real HTTP-level integration tests, not mocks. Nothing
// here touches the real dev/production database: DATA_DIR is set to a
// fresh temp directory before `../../db` (and therefore `../../app`) is
// ever required.
const fs = require('fs');
const os = require('os');
const path = require('path');

function startTestServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nafe3-test-'));
  process.env.DATA_DIR = dataDir;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
  process.env.NODE_ENV = 'test';

  // Fresh require each call (tests run this once per file/process, so the
  // module cache is naturally per-process here - no stale-state risk).
  delete require.cache[require.resolve('../../app')];
  delete require.cache[require.resolve('../../db')];
  const app = require('../../app');

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, dataDir });
    });
  });
}

// Minimal per-session cookie jar - fetch() doesn't manage cookies across
// calls by itself, and each "actor" in these tests (SUPER_ADMIN, ADMIN,
// USER, COACH) needs its own independent session.
function makeSession(baseUrl) {
  const cookies = new Map();

  function applySetCookie(res) {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : res.headers.raw?.()['set-cookie'] || [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }

  function cookieHeader() {
    return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async function request(method, urlPath, body) {
    const res = await fetch(baseUrl + urlPath, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    applySetCookie(res);
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
  };
}

module.exports = { startTestServer, makeSession };
