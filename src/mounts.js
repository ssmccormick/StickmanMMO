// ============================================================
// Mount catalog. The base "horse" steed is earned via the Marathoner
// achievement; the Slime and Dragon mounts are capstone/achievement rewards.
// Everything else here is bought from the Stablemaster (mount merchant) with
// gold once you meet a Riding-skill requirement. Each entry is pure data — the
// actual 3D steed meshes are built in player.js (`_buildSteed` + friends), keyed
// by the `skin` string, and the ride speed reads this table's `speed` factor.
// ============================================================

// speed = the multiplier applied to base run speed while mounted (the old
// hard-coded value was 1.75; that stays the horse's number so nothing regresses).
export const MOUNTS = {
  horse:   { skin: 'horse',   name: 'Sticksteed',        glyph: '🐎', speed: 1.75, price: 0,    reqRiding: 1,  source: 'earned', color: 0x7a5334, desc: 'A loyal courser, earned by long travels on foot.' },
  slime:   { skin: 'slime',   name: 'Bounding Slime',    glyph: '🟢', speed: 1.65, price: 0,    reqRiding: 1,  source: 'earned', color: 0x5fd35f, desc: 'A springy slime steed — a Slime Slayer reward.' },
  dragon:  { skin: 'dragon',  name: 'Wyrmling',          glyph: '🐲', speed: 2.15, price: 0,    reqRiding: 1,  source: 'earned', color: 0x4a2030, desc: 'A rideable dragon — the Dragonslayer\'s prize.' },
  // --- Purchasable from the Stablemaster ---
  direwolf:    { skin: 'direwolf',    name: 'Dire Wolf',       glyph: '🐺', speed: 1.95, price: 1400,  reqRiding: 5,  source: 'shop', color: 0x5a5f68, desc: 'A grey pack-hunter. Quick and tireless over rough ground.' },
  charger:     { skin: 'charger',     name: 'Armored Charger', glyph: '🐴', speed: 1.80, price: 2200,  reqRiding: 8,  source: 'shop', color: 0x3c3f47, desc: 'A barded warhorse — steady, armored, built for the charge.' },
  raptor:      { skin: 'raptor',      name: 'Ridge Raptor',    glyph: '🦖', speed: 2.25, price: 3600,  reqRiding: 14, source: 'shop', color: 0x6a8a3a, desc: 'A feathered runner. The fastest thing on two legs.' },
  elk:         { skin: 'elk',         name: 'Great Elk',       glyph: '🦌', speed: 2.00, price: 3000,  reqRiding: 18, source: 'shop', color: 0x7a5a34, desc: 'A towering antlered stag of the northern woods.' },
  sandstrider: { skin: 'sandstrider', name: 'Sand Strider',    glyph: '🐫', speed: 2.05, price: 4200,  reqRiding: 22, source: 'shop', color: 0xc7a24a, desc: 'A long-legged desert strider that skims the dunes.' },
};

// Ordered ids for menus (earned first, then shop mounts by price).
export const MOUNT_ORDER = ['horse', 'slime', 'dragon', 'direwolf', 'charger', 'raptor', 'elk', 'sandstrider'];
// Only these appear in the Stablemaster's shop.
export const SHOP_MOUNTS = MOUNT_ORDER.filter((id) => MOUNTS[id].source === 'shop');

export function mountById(id) { return MOUNTS[id] || MOUNTS.horse; }
export function mountSpeed(skin) { return (MOUNTS[skin] || MOUNTS.horse).speed; }
