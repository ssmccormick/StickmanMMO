// ============================================================
// Persistent character saves, backed by localStorage. Each character
// is stored under one key; resting at a bonfire overwrites that
// character's save (Dark Souls style). Works when served over http(s)
// and also when the standalone file is opened directly (file://).
// ============================================================

const KEY = 'stickmanmmo.characters.v1';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {}; // storage blocked / corrupt → behave as "no saves"
  }
}

function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); return true; }
  catch { return false; } // quota/blocked — fail soft, game still playable
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const Saves = {
  // True if the browser actually lets us persist (private mode/file:// can block).
  available() {
    try {
      const k = '__sm_test__';
      localStorage.setItem(k, '1'); localStorage.removeItem(k);
      return true;
    } catch { return false; }
  },

  // All characters, most-recently-played first.
  list() {
    return Object.values(readAll()).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  },

  get(id) { return readAll()[id] || null; },

  // Create a fresh character record (level 1, one starting ability is
  // filled in by the Player). Returns the record (with its new id).
  create(record) {
    const map = readAll();
    const id = newId();
    // Spread the record FIRST so the freshly generated id always wins
    // (the incoming record may carry an undefined id).
    const rec = { ...record, id, createdAt: Date.now(), lastPlayed: Date.now() };
    map[id] = rec;
    writeAll(map);
    return rec;
  },

  // Overwrite an existing character's save (called on rest).
  write(record) {
    if (!record || !record.id) return false;
    const map = readAll();
    map[record.id] = { ...map[record.id], ...record, lastPlayed: Date.now() };
    return writeAll(map);
  },

  remove(id) {
    const map = readAll();
    delete map[id];
    writeAll(map);
  },
};
