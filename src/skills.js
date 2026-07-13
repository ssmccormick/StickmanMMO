// ============================================================
// RuneScape-style proficiency skills. Separate from the class/level system:
// every activity trains its OWN skill, which levels on a steep curve and grants
// an always-on bonus for that activity plus milestone perks (a readable "tree").
//   • Weapon families (Blades, Axes, Blunt, Archery, Firearms, Martial) — train
//     by landing hits with that weapon; boost that weapon's damage/crit.
//   • Spellcasting — train by casting mana abilities; boosts spell damage & cuts
//     mana cost.
//   • Fishing — train by catching fish; boosts fishing power.
//   • Riding — train by riding; boosts mount speed.
//   • Athletics — train by travelling on foot; boosts move speed & sprint cost.
// Bonuses are the SUM of a smooth per-level amount plus any unlocked perks, so
// the whole thing reads from one aggregate the player folds into its existing
// combat / movement / fishing hooks.
// ============================================================

export const SKILL_MAX = 50;

// XP needed to go FROM `level` to the next — a steep, RuneScape-ish climb so a
// skill is a long-term grind trained by doing the activity, not handed out.
export function skillXpForLevel(level) {
  return Math.floor(60 * Math.pow(level, 1.8) + 40);
}

// A weapon-family skill def with a per-level damage bonus and five milestone
// perks (one per 10 levels). Perks add to the same {dmg,crit} aggregate.
function weaponSkill(id, name, glyph, flavor) {
  return {
    id, name, glyph, cat: 'weapon', perLevel: { dmg: 0.006 },
    perks: [
      { lvl: 10, name: 'Keen ' + flavor, desc: `+4% crit with ${name.toLowerCase()}`, crit: 0.04 },
      { lvl: 20, name: 'Practised ' + flavor, desc: `+6% ${name.toLowerCase()} damage`, dmg: 0.06 },
      { lvl: 30, name: 'Deadly ' + flavor, desc: '+5% crit', crit: 0.05 },
      { lvl: 40, name: 'Expert ' + flavor, desc: `+8% ${name.toLowerCase()} damage`, dmg: 0.08 },
      { lvl: 50, name: 'Master ' + flavor, desc: `+10% ${name.toLowerCase()} damage, +5% crit`, dmg: 0.10, crit: 0.05 },
    ],
  };
}

export const SKILLS = [
  weaponSkill('blades', 'Blades', '🗡️', 'Edge'),
  weaponSkill('axes', 'Axes', '🪓', 'Cleave'),
  weaponSkill('blunt', 'Bludgeon', '🔨', 'Crush'),
  weaponSkill('archery', 'Archery', '🏹', 'Aim'),
  weaponSkill('firearms', 'Firearms', '🔫', 'Shot'),
  weaponSkill('martial', 'Martial Arts', '👊', 'Strike'),
  {
    id: 'spellcasting', name: 'Spellcasting', glyph: '🔮', cat: 'spell', perLevel: { dmg: 0.006 },
    perks: [
      { lvl: 10, name: 'Focused Mind', desc: 'Spells cost 6% less mana', costMul: 0.06 },
      { lvl: 20, name: 'Empowered Casting', desc: '+6% spell damage', dmg: 0.06 },
      { lvl: 30, name: 'Efficient Casting', desc: 'Spells cost 8% less mana', costMul: 0.08 },
      { lvl: 40, name: 'Arcane Overflow', desc: '+8% spell damage', dmg: 0.08 },
      { lvl: 50, name: 'Archmage', desc: '+10% spell damage, 8% cheaper', dmg: 0.10, costMul: 0.08 },
    ],
  },
  {
    id: 'fishing', name: 'Fishing', glyph: '🎣', cat: 'fishing', perLevel: { fishing: 0.4 },
    perks: [
      { lvl: 10, name: 'Steady Hands', desc: '+4 fishing power', fishing: 4 },
      { lvl: 20, name: 'Angler\'s Eye', desc: '+6 fishing power', fishing: 6 },
      { lvl: 30, name: 'Deep Caster', desc: '+8 fishing power', fishing: 8 },
      { lvl: 40, name: 'Master Baiter', desc: '+10 fishing power', fishing: 10 },
      { lvl: 50, name: 'Legend of the Lake', desc: '+14 fishing power', fishing: 14 },
    ],
  },
  {
    id: 'riding', name: 'Riding', glyph: '🐎', cat: 'riding', perLevel: { speed: 0.004 },
    perks: [
      { lvl: 10, name: 'Sure Seat', desc: '+4% mount speed', speed: 0.04 },
      { lvl: 20, name: 'Hard Rider', desc: '+5% mount speed', speed: 0.05 },
      { lvl: 30, name: 'Cavalier', desc: '+6% mount speed', speed: 0.06 },
      { lvl: 40, name: 'Horse Lord', desc: '+7% mount speed', speed: 0.07 },
      { lvl: 50, name: 'Windrider', desc: '+10% mount speed', speed: 0.10 },
    ],
  },
  {
    id: 'athletics', name: 'Athletics', glyph: '🏃', cat: 'athletics', perLevel: { speed: 0.003, stamina: 0.004 },
    perks: [
      { lvl: 10, name: 'Second Wind', desc: 'Sprint costs 8% less stamina', stamina: 0.08 },
      { lvl: 20, name: 'Fleet of Foot', desc: '+4% move speed', speed: 0.04 },
      { lvl: 30, name: 'Marathoner', desc: 'Sprint costs 10% less stamina', stamina: 0.10 },
      { lvl: 40, name: 'Trailrunner', desc: '+6% move speed', speed: 0.06 },
      { lvl: 50, name: 'Windwalker', desc: '+8% move speed, 12% cheaper sprint', speed: 0.08, stamina: 0.12 },
    ],
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Which weapon KIND trains which skill (poles train Spellcasting; bare fists
// train Martial Arts).
const WEAPON_SKILL = {
  sword: 'blades', dagger: 'blades', throwknife: 'blades',
  axe: 'axes', throwaxe: 'axes',
  mace: 'blunt',
  bow: 'archery', crossbow: 'archery',
  revolver: 'firearms', rifle: 'firearms',
  staff: 'spellcasting', wand: 'spellcasting',
};
export function skillForWeaponKind(kind) { return WEAPON_SKILL[kind] || 'martial'; }

// Sum a skill's smooth per-level bonus with its unlocked milestone perks.
export function skillBonus(id, level) {
  const def = SKILL_BY_ID[id];
  const agg = { dmg: 0, crit: 0, speed: 0, fishing: 0, costMul: 0, stamina: 0 };
  if (!def) return agg;
  const lv = Math.max(1, level | 0);
  for (const k in def.perLevel) agg[k] += def.perLevel[k] * (lv - 1);
  for (const p of def.perks) if (lv >= p.lvl) for (const k in agg) if (p[k]) agg[k] += p[k];
  return agg;
}
