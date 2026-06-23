// achievements.js
//
// The achievement catalogue. Pure data — AchievementSystem drives unlock
// conditions off EventBus events and looks definitions up here by id. `tier`
// groups them into the four signpost-log chapters; `hidden` entries render as
// "???" in the log until unlocked. Economy Sprint A added the dual-economy
// progression set (first coin / coins earned, trade milestones, and per-type
// kill thresholds) so the moment-to-moment combat + economy loops drip rewards.

export const ACHIEVEMENTS = [
  // TIER 1 — First Steps
  { id: 'first_harvest',   tier: 1, icon: '🌱', name: 'First Harvest',      flavor: 'The soil remembers what you plant.',           hidden: false },
  { id: 'into_the_woods',  tier: 1, icon: '👣', name: 'Into the Woods',     flavor: 'The forest does not welcome — it tolerates.',  hidden: false },
  { id: 'one_day_done',    tier: 1, icon: '💤', name: 'One Day Done',       flavor: 'Rest is not retreat. It is preparation.',      hidden: false },
  { id: 'water_carrier',   tier: 1, icon: '🪣', name: 'Water Carrier',      flavor: 'Even the smallest effort accelerates growth.', hidden: false },
  { id: 'first_blood',     tier: 1, icon: '⚔️', name: 'First Blood',        flavor: 'You are not prey.',                            hidden: false },
  { id: 'satchel_bearer',  tier: 1, icon: '🌿', name: 'Satchel Bearer',     flavor: 'More room. More risk. More reward.',           hidden: false },
  { id: 'first_coin',      tier: 1, icon: '🪙', name: 'First Coin',          flavor: 'Worth more than it weighs.',                   hidden: false },
  { id: 'first_sale',      tier: 1, icon: '🤝', name: 'First Sale',          flavor: 'The market remembers a fair hand.',            hidden: false },
  { id: 'the_stick',       tier: 1, icon: '🪵', name: 'A Sturdy Stick',      flavor: "It ends a slime. For now, that's enough.",     hidden: false },

  // TIER 2 — Finding Your Footing
  { id: 'mycologist',      tier: 2, icon: '🍄', name: 'Mycologist',         flavor: 'It grows where light does not reach.',         hidden: false },
  { id: 'blue_thumb',      tier: 2, icon: '💧', name: 'Blue Thumb',         flavor: 'Patience measured in petals.',                 hidden: false },
  { id: 'harvest_begins',  tier: 2, icon: '🌾', name: 'The Harvest Begins', flavor: 'Ten of each. The forest stirs at last.', hidden: false },
  { id: 'armed',           tier: 2, icon: '🗡️', name: 'Armed',              flavor: 'A proper blade changes the conversation.',     hidden: false },
  { id: 'layered',         tier: 2, icon: '🛡️', name: 'Layered',            flavor: 'The forest hits harder than you remember.',    hidden: false },
  { id: 'blur',            tier: 2, icon: '💨', name: 'Blur',               flavor: 'Here, then not.',                              hidden: false },
  { id: 'ranged',          tier: 2, icon: '🏹', name: 'Ranged',             flavor: 'Distance is a weapon too.',                    hidden: false },
  { id: 'slayer',          tier: 2, icon: '☠️', name: 'Slayer',             flavor: 'They will learn to fear the garden gate.',     hidden: false },
  { id: 'fully_stocked',   tier: 2, icon: '📦', name: 'Fully Stocked',      flavor: 'Every slot filled. Every risk considered.',    hidden: false },
  { id: 'pushing_it',      tier: 2, icon: '⏱️', name: 'Pushing It',         flavor: 'The forest grows teeth when the clock runs out.', hidden: false },
  { id: 'slime_culler',    tier: 2, icon: '🫧', name: 'Cull the Green',      flavor: 'Five down. The garden gate holds.',            hidden: false },
  { id: 'dark_first',      tier: 2, icon: '🌘', name: 'Into the Dark',       flavor: 'Purple bleeds the same.',                      hidden: false },
  { id: 'skeleton_crew',   tier: 2, icon: '🦴', name: 'Rattle and Bone',     flavor: 'Five of the dead, sent back to rest.',         hidden: false },

  // TIER 3 — Mastery
  { id: 'bonecrusher',     tier: 3, icon: '💀', name: 'Bonecrusher',        flavor: 'Even the dead have something to offer.',       hidden: false },
  { id: 'darkwalker',      tier: 3, icon: '🌑', name: 'Darkwalker',         flavor: 'Purple is the color of ambition.',             hidden: false },
  { id: 'second_chance',   tier: 3, icon: '🔄', name: 'Second Chance',      flavor: 'You went back for them.',                      hidden: false },
  { id: 'deep_root',       tier: 3, icon: '🌳', name: 'Deep Root',          flavor: 'Day ten. Still standing.',                     hidden: false },
  { id: 'master_botanist', tier: 3, icon: '⚗️', name: 'Master Botanist',    flavor: 'Every plant. Every path. Mastered.',           hidden: false },
  { id: 'full_kit',        tier: 3, icon: '🪖', name: 'Full Kit',           flavor: 'Nothing left to buy. Everything left to use.', hidden: false },
  { id: 'the_seedkeeper',  tier: 3, icon: '🏆', name: 'The Seedkeeper',     flavor: 'The forest did not break you. You restored it.', hidden: false },
  { id: 'coin_purse',      tier: 3, icon: '💰', name: 'A Hundred Earned',    flavor: 'Coin by coin, the purse grows heavy.',         hidden: false },
  { id: 'slot_maxed',      tier: 3, icon: '⭐', name: 'Best in Slot',        flavor: 'One thing, perfected.',                        hidden: false },
  { id: 'capacity_maxed',  tier: 3, icon: '🎒', name: 'Bottomless',          flavor: 'There is always room for more.',               hidden: false },

  // TIER 4 — Hidden
  { id: 'speed_runner',    tier: 4, icon: '🕐', name: 'Speed Runner',       flavor: "Some people don't need three minutes.",        hidden: true },
  { id: 'untouchable',     tier: 4, icon: '🌀', name: 'Untouchable',        flavor: 'Not a scratch.',                               hidden: true },
  { id: 'committed',       tier: 4, icon: '😵', name: 'Committed',          flavor: 'At least you went back for them.',             hidden: true },
  { id: 'naturalist',      tier: 4, icon: '🐌', name: 'Naturalist',         flavor: 'You let it live.',                             hidden: true },
  { id: 'broke',           tier: 4, icon: '💸', name: 'Broke',              flavor: 'Zero across the board.',                       hidden: true },
  { id: 'night_owl',       tier: 4, icon: '🌙', name: 'Night Owl',          flavor: 'The timer is a suggestion.',                   hidden: true },
  { id: 'new_game_plus',   tier: 4, icon: '♾️', name: 'New Game Plus',      flavor: 'You knew what was coming. You came back anyway.', hidden: true },
  { id: 'full_bloom',      tier: 4, icon: '🌺', name: 'Full Bloom',         flavor: 'Every bed. Every plant. All at once.',         hidden: true }
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

// Chapter labels for the signpost log, keyed by tier.
export const TIER_LABELS = {
  1: 'Chapter I — First Steps',
  2: 'Chapter II — Finding Your Footing',
  3: 'Chapter III — Mastery',
  4: 'Chapter IV — ???'
};

// TODO Sprint 6 achievements — sortie / chest / extraction milestones.
// Deferred: these need events that don't exist yet (chests, overtime
// extraction, death-drop recovery, daily sortie banking). When that layer
// lands, add the data entries above and the unlock hooks in AchievementSystem;
// hook them to the new events rather than touching combat/economy emitters.
//   - clear your first chest
//   - clear a hard chest
//   - survive a full overtime extraction
//   - recover a death-drop
//   - bank two sorties in one day
