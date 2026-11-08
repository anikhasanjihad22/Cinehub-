// Dependency-free checks run in CI before packaging.
import assert from 'node:assert/strict';
import {createIntroMute, isInsideIntro} from '../src/renderer/js/introMute.js';
import {existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// generated files exist
for (const f of ['sandbox-runtime.js', 'helpers.cjs', 'cookieJar.cjs', 'liveParse.cjs']) {
  assert.ok(existsSync(join(here, '..', 'src', 'main', 'generated', f)), `missing generated/${f} (run npm run prepare:assets)`);
}

// ── intro mute against a fake <video> ──
class FakeVideo {
  constructor() { this.currentTime = 0; this.muted = false; this.l = {}; }
  addEventListener(e, f) { (this.l[e] ||= []).push(f); }
  removeEventListener(e, f) { this.l[e] = (this.l[e] || []).filter(x => x !== f); }
  emit(e) { (this.l[e] || []).forEach(f => f()); }
  seek(t) { this.currentTime = t; this.emit('seeking'); this.emit('seeked'); }
}

assert.equal(isInsideIntro(0, 5), true);
assert.equal(isInsideIntro(4.99, 5), true);
assert.equal(isInsideIntro(5, 5), false);

{
  const v = new FakeVideo();
  const m = createIntroMute(v, {seconds: 5, enabled: true});
  assert.equal(v.muted, true, 'silent from the first frame');
  m.setUserMuted(false);
  assert.equal(v.muted, true, 'cannot unmute inside the intro');
  v.muted = false; v.emit('volumechange');
  assert.equal(v.muted, true, 'external unmute is reverted');
  v.currentTime = 3; v.emit('timeupdate');
  assert.equal(v.muted, true);
  v.currentTime = 5.02; v.emit('timeupdate');
  assert.equal(v.muted, false, 'sound returns after 5s');
  v.seek(120);
  assert.equal(v.muted, false);
  v.seek(1);
  assert.equal(v.muted, true, 'seeking back to the start mutes again');
  v.seek(5.5);
  assert.equal(v.muted, false, 'and sound returns past 5s');
  m.setUserMuted(true);
  assert.equal(v.muted, true, 'user mute still works after the intro');
  m.setUserMuted(false);
  assert.equal(v.muted, false);
  m.dispose();
}
{
  const v = new FakeVideo();
  const m = createIntroMute(v, {seconds: 5, enabled: false}); // live TV
  assert.equal(v.muted, false, 'live TV is never force-muted');
  v.currentTime = 0.5; v.emit('timeupdate');
  assert.equal(v.muted, false);
  m.dispose();
}
console.log('desktop selftest: ok');
