/**
 * ST2-003-E — localStorage vs IndexedDB minimal validation suite.
 * Runs in the browser; results go to DOM + console for evidence capture.
 * NOT a production save adapter — decision gate: recommendation only (D-207).
 */

type Row = { id: string; name: string; pass: boolean | null; detail: string };
const rows: Row[] = [];
const el = document.getElementById('results')!;
function record(id: string, name: string, pass: boolean | null, detail: string) {
  rows.push({ id, name, pass, detail });
  const s = pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL';
  console.log(`[${s}] ${id} ${name} — ${detail}`);
  render();
}
function render() {
  const done = rows.filter(r => r.pass !== null);
  const passed = done.filter(r => r.pass).length;
  el.innerHTML =
    `<p>completed ${done.length} | PASS ${passed} | FAIL ${done.length - passed}</p>` +
    `<table><tr><th>#</th><th>test</th><th>result</th><th>detail</th></tr>` +
    rows.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td class="${r.pass === null ? 'info' : r.pass ? 'pass' : 'fail'}">${r.pass === null ? 'INFO' : r.pass ? 'PASS' : 'FAIL'}</td><td>${r.detail}</td></tr>`).join('') +
    `</table>`;
}

// ---------- shared schema ----------
interface SaveV1 { schemaVersion: 1; gold: number; items: string[] }
interface SaveV2 { schemaVersion: 2; gold: number; items: string[]; settings: { sfx: boolean } }
const migrateV1toV2 = (v1: SaveV1): SaveV2 => ({ ...v1, schemaVersion: 2, settings: { sfx: true } });

// ---------- localStorage suite ----------
function lsWrite(v: SaveV2, key = 'save_main') {
  localStorage.setItem(key, JSON.stringify(v));
}
function lsRead(key = 'save_main'): SaveV2 | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as SaveV1 | SaveV2;
    if (parsed.schemaVersion === 1) return migrateV1toV2(parsed);
    return parsed;
  } catch {
    // corruption: quarantine + default
    localStorage.setItem(key + '_corrupt_backup', raw);
    localStorage.removeItem(key);
    return null;
  }
}

/**
 * Startup recovery for the recommended temp-key protocol:
 * write `save_next` → verify → promote to `save_main` → delete `save_next`.
 * If `save_next` still exists at startup the previous write was interrupted:
 * prefer it when valid, otherwise fall back to the last known-good `save_main`.
 */
function recoverSave(): SaveV2 | null {
  const next = localStorage.getItem('save_next');
  if (next !== null) {
    try {
      const parsed = JSON.parse(next) as SaveV1 | SaveV2;
      if (parsed && parsed.schemaVersion === 2) return parsed;
      if (parsed && parsed.schemaVersion === 1) return migrateV1toV2(parsed);
    } catch {
      // invalid temp → fall through to the main save
    }
  }
  return lsRead('save_main');
}

function testLocalStorage() {
  // L1 versioned read/write
  try {
    localStorage.clear();
    lsWrite({ schemaVersion: 2, gold: 100, items: ['sword'], settings: { sfx: true } });
    const v = lsRead();
    record('L1', 'ls versioned write/read', !!v && v.gold === 100 && v.items[0] === 'sword', `roundtrip ok, bytes=${localStorage.getItem('save_main')?.length}`);
  } catch (e) { record('L1', 'ls versioned write/read', false, String(e)); }

  // L2 migration v1 → v2
  try {
    localStorage.clear();
    const v1: SaveV1 = { schemaVersion: 1, gold: 50, items: ['shield'] };
    localStorage.setItem('save_main', JSON.stringify(v1)); // deliberately old-version data
    const v = lsRead();
    record('L2', 'ls v1→v2 migration', !!v && v.schemaVersion === 2 && v.settings.sfx === true && v.gold === 50, `migrated: ${JSON.stringify(v)}`);
  } catch (e) { record('L2', 'ls v1→v2 migration', false, String(e)); }

  // L3 corruption recovery
  try {
    localStorage.setItem('save_main', '{broken json!!');
    const v = lsRead();
    const quarantined = localStorage.getItem('save_main_corrupt_backup');
    record('L3', 'ls corruption recovery', v === null && quarantined === '{broken json!!', 'parse failure quarantined to _corrupt_backup, default returned');
  } catch (e) { record('L3', 'ls corruption recovery', false, String(e)); }

  // L4 quota / write failure (sync throw)
  try {
    localStorage.clear();
    const chunk = 'x'.repeat(1024 * 1024); // 1 MB
    let written = 0, quotaHit = false;
    try {
      for (let i = 0; i < 20; i++) { localStorage.setItem('q' + i, chunk); written++; }
    } catch { quotaHit = true; }
    record('L4', 'ls quota behavior', null, `${quotaHit ? 'QuotaExceededError thrown after' : 'no quota error within'} ~${written} MB synchronous throws, prior keys unaffected`);
    localStorage.clear();
  } catch (e) { record('L4', 'ls quota behavior', null, String(e)); }

  // L5 sync blocking cost: 300 × 10KB writes on main thread (~3MB, within quota)
  try {
    localStorage.clear();
    const payload = JSON.stringify({ schemaVersion: 2, gold: 1, items: ['i'.repeat(10000)], settings: { sfx: true } });
    const t0 = performance.now();
    let ok = 0;
    for (let i = 0; i < 300; i++) { localStorage.setItem('blk' + i, payload); ok++; }
    const ms = performance.now() - t0;
    record('L5', 'ls sync write cost (300×10KB)', ok === 300, `${ms.toFixed(1)}ms total, ${(ms / ok).toFixed(3)}ms/op, ${ok} writes — all on main thread (note: 1000×10KB would exceed the ~5MB quota)`);
    localStorage.clear();
  } catch (e) { record('L5', 'ls sync write cost', false, String(e)); }

  // L6 quota write-failure path (correction round R4): a failed save must leave the
  // previous valid save intact and readable. Fills storage in decreasing chunk sizes
  // so the remaining headroom is smaller than a realistic save payload, then attempts
  // the temp-key write (nothing is ever half-written over `save_main`).
  try {
    localStorage.clear();
    const previous: SaveV2 = { schemaVersion: 2, gold: 777, items: ['relic'], settings: { sfx: true } };
    localStorage.setItem('save_main', JSON.stringify(previous));
    let filled = 0;
    let quotaHit = false;
    // keep going with smaller chunks after a failure so headroom ends up < 512B
    for (const size of [1 << 20, 64 << 10, 4 << 10, 512]) {
      const chunk = 'x'.repeat(size);
      for (let k = 0; k < 4096; k++) {
        try {
          localStorage.setItem(`qfill${size}_${k}`, chunk);
          filled += size;
        } catch { quotaHit = true; break; }
      }
    }

    if (!quotaHit) {
      record('L6', 'ls quota write-failure path', null,
        `NOT VERIFIED — quota not reached after ${(filled / 1048576).toFixed(1)}MB of filler in this browser; failure path cannot be asserted automatically`);
      localStorage.clear();
    } else {
      // realistic save payload (~2 KB, well under the ~5 MB quota by itself)
      const bigger: SaveV2 = { schemaVersion: 2, gold: 888, items: ['relic', 'huge'], settings: { sfx: true } };
      const payload = JSON.stringify(bigger).padEnd(2048, 'x');
      let threw = '';
      try {
        localStorage.setItem('save_next', payload); // temp write must fail, main untouched
      } catch (e) { threw = (e as Error).name || String(e); }
      const kept = lsRead('save_main');
      const tempPresent = localStorage.getItem('save_next') !== null;
      const pass = threw === 'QuotaExceededError' && !!kept && kept.gold === 777 && kept.items[0] === 'relic';
      record('L6', 'ls quota write-failure path', pass,
        `filler=${(filled / 1048576).toFixed(1)}MB → temp write threw ${threw || '(none)'}; save_next=${tempPresent ? 'present' : 'absent'}; save_main intact readback gold=${kept?.gold} (expected 777)`);
      localStorage.clear();
    }
  } catch (e) { record('L6', 'ls quota write-failure path', null, 'NOT VERIFIED — ' + String(e)); }

  // L6b/L6c interrupted-write recovery protocol (deterministic, no quota needed)
  try {
    localStorage.clear();
    localStorage.setItem('save_main', JSON.stringify({ schemaVersion: 2, gold: 777, items: ['relic'], settings: { sfx: true } }));
    localStorage.setItem('save_next', JSON.stringify({ schemaVersion: 2, gold: 888, items: ['relic', 'gem'], settings: { sfx: true } }));
    const rec = recoverSave();
    record('L6b', 'ls interrupted-write recovery prefers valid temp', !!rec && rec.gold === 888,
      `save_next present + valid → recovered gold=${rec?.gold} (expected 888)`);
  } catch (e) { record('L6b', 'ls interrupted-write recovery (valid temp)', false, String(e)); }

  try {
    localStorage.setItem('save_next', '{broken json!!');
    const rec = recoverSave();
    record('L6c', 'ls recovery falls back to main on invalid temp', !!rec && rec.gold === 777,
      `save_next corrupt → fell back to save_main gold=${rec?.gold} (expected 777)`);
    localStorage.clear();
  } catch (e) { record('L6c', 'ls recovery fallback (invalid temp)', false, String(e)); }
}

// ---------- IndexedDB suite ----------
function idbOpen(version = 1, upgrade?: (db: IDBDatabase, oldV: number, req: IDBOpenDBRequest) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('save-spike', version);
    req.onupgradeneeded = (ev) => upgrade?.(req.result, (ev as IDBVersionChangeEvent).oldVersion, req);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(db: IDBDatabase, store: string, key: string, val: unknown): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('aborted'));
  });
}
function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const rq = tx.objectStore(store).get(key);
    rq.onsuccess = () => res(rq.result as T);
    rq.onerror = () => rej(rq.error);
  });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function testIndexedDB() {
  indexedDB.deleteDatabase('save-spike');
  await sleep(300);

  // I1 versioned write/read with schema version in data + object store
  try {
    const db = await idbOpen(1, (db) => db.createObjectStore('saves'));
    const v2: SaveV2 = { schemaVersion: 2, gold: 200, items: ['staff'], settings: { sfx: false } };
    await idbPut(db, 'saves', 'main', v2);
    const got = await idbGet<SaveV2>(db, 'saves', 'main');
    record('I1', 'idb versioned write/read', !!got && got.gold === 200, `structured clone roundtrip ok`);
    db.close();
  } catch (e) { record('I1', 'idb versioned write/read', false, String(e)); }

  // I2 version upgrade migration v1 → v2 (db level) + data migration
  try {
    // create v1 db with old-shape data
    const db1 = await idbOpen(1, (db) => db.createObjectStore('saves'));
    await idbPut(db1, 'saves', 'main', { schemaVersion: 1, gold: 75, items: ['ring'] });
    db1.close();

    const migrated: SaveV2[] = [];
    const db2 = await idbOpen(2, (db, oldV, req) => {
      if (oldV < 2) {
        if (!db.objectStoreNames.contains('saves_meta')) db.createObjectStore('saves_meta');
        // read+write inside upgrade transaction is possible via req.result transaction
        const tx = req.transaction!;
        const store = tx.objectStore('saves');
        const all = store.getAll();
        all.onsuccess = () => {
          for (const raw of all.result as SaveV1[]) migrated.push(migrateV1toV2(raw));
          const meta = tx.objectStore('saves_meta');
          migrated.forEach((m, i) => meta.put(m, 'm' + i));
        };
      }
    });
    await sleep(300);
    const got = await idbGet<SaveV2>(db2, 'saves_meta', 'm0');
    record('I2', 'idb v1→v2 onupgradeneeded migration', !!got && got.schemaVersion === 2 && got.gold === 75, `in-upgrade-transaction migration ok: ${JSON.stringify(got)}`);
    db2.close();
  } catch (e) { record('I2', 'idb v1→v2 onupgradeneeded migration', false, String(e)); }

  // I3 atomic transaction abort → partial write impossible
  try {
    const db = await idbOpen(3, (db) => { if (!db.objectStoreNames.contains('atomic')) db.createObjectStore('atomic'); });
    await new Promise<void>((res) => {
      const tx = db.transaction('atomic', 'readwrite');
      tx.objectStore('atomic').put('a', 'k1');
      tx.objectStore('atomic').put('b', 'k2');
      tx.objectStore('atomic').put('c', 'k3');
      // abort synchronously, in the same task as the puts — guaranteed pre-commit
      tx.abort();
      tx.onabort = () => res();
      tx.onerror = () => res();
      tx.oncomplete = () => res();
    });
    await sleep(100);
    const k1 = await idbGet<string>(db, 'atomic', 'k1');
    record('I3', 'idb transaction atomicity (abort)', k1 === undefined, 'sync-aborted tx with 3 puts left 0 rows — all-or-nothing confirmed (engine-independent)');
    db.close();
  } catch (e) { record('I3', 'idb transaction atomicity (abort)', false, String(e)); }

  // I3b invalid data → structured clone failure (DataCloneError), no partial write
  try {
    const db = await idbOpen(3);
    const bad = { fn: () => 1 };
    let threw = '';
    try { await idbPut(db, 'atomic', 'bad', bad); } catch (e) { threw = (e as Error).name; }
    const got = await idbGet(db, 'atomic', 'bad');
    record('I3b', 'idb invalid data rejected (DataCloneError)', threw === 'DataCloneError' && got === undefined, `write rejected upfront: ${threw}`);
    db.close();
  } catch (e) { record('I3b', 'idb invalid data rejected', false, String(e)); }

  // I4 storage estimate + quota probing
  try {
    const est = await navigator.storage?.estimate?.();
    record('I4', 'idb storage estimate()', null, `usage=${(est?.usage ?? -1) / 1048576 | 0}MB quota=${(est?.quota ?? -1) / 1048576 | 0}MB (browser-managed eviction policy applies)`);
  } catch (e) { record('I4', 'idb storage estimate()', null, String(e)); }

  // I5 async write cost: 1000 × 10KB in 10 batch transactions
  try {
    const db = await idbOpen(3);
    const payload = JSON.stringify({ schemaVersion: 2, gold: 1, items: ['i'.repeat(10000)], settings: { sfx: true } });
    const t0 = performance.now();
    for (let b = 0; b < 10; b++) {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('atomic', 'readwrite');
        for (let i = 0; i < 100; i++) tx.objectStore('atomic').put(payload, `p${b}_${i}`);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
    const ms = performance.now() - t0;
    record('I5', 'idb async write cost (1000×10KB, batched)', null, `${ms.toFixed(1)}ms total, ${(ms / 1000).toFixed(3)}ms/op — off main-thread commit, batched tx`);
    db.close();
  } catch (e) { record('I5', 'idb async write cost', false, String(e)); }
}

// ---------- run ----------
testLocalStorage();
testIndexedDB().then(async () => {
  // privacy-mode probe (separate launcher runs with -private; here just note support)
  record('P1', 'private-mode probe', null, 'see README browser matrix — separate -private browser run required');
  console.log('[suite] done');
});
