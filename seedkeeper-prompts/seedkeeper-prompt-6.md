# Seedkeeper — Sprint 6: Achievements & Signpost Log

**What this sprint produces:** A full 27-achievement system with toast notification popups on unlock, a garden signpost object the player can interact with to view their achievement log, and persistent achievement state saved per slot. Every major player action now has a celebratory moment attached to it.

**Playtestable result:** Unlock achievements naturally through play, see toast popups, visit the signpost to review your collection.

**Depends on:** Sprint 5 complete and all checklist items passing.

---

You are continuing development of Seedkeeper. This is Sprint 6: Achievements and Signpost Log. The project is feature-complete from Sprint 5. Do not modify any existing systems unless explicitly instructed.

## Sprint 6 Goal

Implement a 27-achievement system driven entirely by existing EventBus events. Add a garden signpost object with an achievement log overlay. Persist unlock state in the save schema.

---

## New File: /src/systems/AchievementSystem.js

Instantiated in GameScene. Listens to EventBus events, checks conditions, emits `achievement:unlocked` when conditions are met.

```javascript
export default class AchievementSystem {
  constructor(scene, saveData) {
    this.scene = scene;
    this.saveData = saveData;
    this.unlockedIds = new Set(saveData.achievements || []);
    this.killCount = saveData.stats?.killCount || 0;
    this.deathCount = saveData.stats?.deathCount || 0;
    this.timerExpiredCount = saveData.stats?.timerExpiredCount || 0;
    this.daysForestNoKill = 0;
    this.currentRunDamageTaken = false;
    this.registerListeners();
  }

  unlock(id) {
    if (this.unlockedIds.has(id)) return;
    this.unlockedIds.add(id);
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    EventBus.emit('achievement:unlocked', { achievement });
    EventBus.emit('save:requested', {});
  }

  check(id, condition) {
    if (condition) this.unlock(id);
  }
}
```

All condition checks are driven by EventBus listeners registered in `registerListeners()`. Never poll in update loop.

---

## Achievement Definitions

Create `/src/data/achievements.js` — exported array of all 27 achievements:

```javascript
export const ACHIEVEMENTS = [
  // TIER 1 — First Steps
  { id: 'first_harvest',   tier: 1, icon: '🌱', name: 'First Harvest',    flavor: 'The soil remembers what you plant.',           hidden: false },
  { id: 'into_the_woods',  tier: 1, icon: '👣', name: 'Into the Woods',   flavor: 'The forest does not welcome — it tolerates.',  hidden: false },
  { id: 'one_day_done',    tier: 1, icon: '💤', name: 'One Day Done',     flavor: 'Rest is not retreat. It is preparation.',      hidden: false },
  { id: 'water_carrier',   tier: 1, icon: '🪣', name: 'Water Carrier',    flavor: 'Even the smallest effort accelerates growth.', hidden: false },
  { id: 'first_blood',     tier: 1, icon: '⚔️', name: 'First Blood',      flavor: 'You are not prey.',                            hidden: false },
  { id: 'satchel_bearer',  tier: 1, icon: '🌿', name: 'Satchel Bearer',   flavor: 'More room. More risk. More reward.',           hidden: false },

  // TIER 2 — Finding Your Footing
  { id: 'mycologist',      tier: 2, icon: '🍄', name: 'Mycologist',       flavor: 'It grows where light does not reach.',                  hidden: false },
  { id: 'blue_thumb',      tier: 2, icon: '💧', name: 'Blue Thumb',       flavor: 'Patience measured in petals.',                          hidden: false },
  { id: 'harvest_begins',  tier: 2, icon: '🌾', name: 'The Harvest Begins', flavor: 'Six seeds. Six paths. One forest to restore.',        hidden: false },
  { id: 'armed',           tier: 2, icon: '🗡️', name: 'Armed',            flavor: 'A proper blade changes the conversation.',              hidden: false },
  { id: 'layered',         tier: 2, icon: '🛡️', name: 'Layered',          flavor: 'The forest hits harder than you remember.',             hidden: false },
  { id: 'blur',            tier: 2, icon: '💨', name: 'Blur',             flavor: 'Here, then not.',                                       hidden: false },
  { id: 'ranged',          tier: 2, icon: '🏹', name: 'Ranged',           flavor: 'Distance is a weapon too.',                             hidden: false },
  { id: 'slayer',          tier: 2, icon: '☠️', name: 'Slayer',           flavor: 'They will learn to fear the garden gate.',              hidden: false },
  { id: 'fully_stocked',   tier: 2, icon: '📦', name: 'Fully Stocked',    flavor: 'Every slot filled. Every risk considered.',             hidden: false },
  { id: 'pushing_it',      tier: 2, icon: '⏱️', name: 'Pushing It',       flavor: 'The forest grows teeth when the clock runs out.',       hidden: false },

  // TIER 3 — Mastery
  { id: 'bonecrusher',     tier: 3, icon: '💀', name: 'Bonecrusher',      flavor: 'Even the dead have something to offer.',                hidden: false },
  { id: 'darkwalker',      tier: 3, icon: '🌑', name: 'Darkwalker',       flavor: 'Purple is the color of ambition.',                      hidden: false },
  { id: 'second_chance',   tier: 3, icon: '🔄', name: 'Second Chance',    flavor: 'You went back for them.',                               hidden: false },
  { id: 'deep_root',       tier: 3, icon: '🌳', name: 'Deep Root',        flavor: 'Day ten. Still standing.',                              hidden: false },
  { id: 'master_botanist', tier: 3, icon: '⚗️', name: 'Master Botanist',  flavor: 'Every plant. Every path. Mastered.',                    hidden: false },
  { id: 'full_kit',        tier: 3, icon: '🪖', name: 'Full Kit',         flavor: 'Nothing left to buy. Everything left to use.',          hidden: false },
  { id: 'the_seedkeeper',  tier: 3, icon: '🏆', name: 'The Seedkeeper',   flavor: 'The forest did not break you. You restored it.',        hidden: false },

  // TIER 4 — Hidden
  { id: 'speed_runner',    tier: 4, icon: '🕐', name: 'Speed Runner',     flavor: 'Some people don\'t need three minutes.',                hidden: true },
  { id: 'untouchable',     tier: 4, icon: '🌀', name: 'Untouchable',      flavor: 'Not a scratch.',                                        hidden: true },
  { id: 'committed',       tier: 4, icon: '😵', name: 'Committed',        flavor: 'At least you went back for them.',                      hidden: true },
  { id: 'naturalist',      tier: 4, icon: '🐌', name: 'Naturalist',       flavor: 'You let it live.',                                      hidden: true },
  { id: 'broke',           tier: 4, icon: '💸', name: 'Broke',            flavor: 'Zero across the board.',                                hidden: true },
  { id: 'night_owl',       tier: 4, icon: '🌙', name: 'Night Owl',        flavor: 'The timer is a suggestion.',                            hidden: true },
  { id: 'new_game_plus',   tier: 4, icon: '♾️', name: 'New Game Plus',    flavor: 'You knew what was coming. You came back anyway.',       hidden: true },
  { id: 'full_bloom',      tier: 4, icon: '🌺', name: 'Full Bloom',       flavor: 'Every bed. Every plant. All at once.',                  hidden: true },
];
```

---

## EventBus Trigger Mapping

Wire these in `registerListeners()`:

```javascript
registerListeners() {
  // Tier 1
  EventBus.on('plant:harvested',    () => this.unlock('first_harvest'));
  EventBus.on('player:zoneChanged', ({ zone }) => { if (zone === 'forest') this.unlock('into_the_woods'); });
  EventBus.on('player:slept',       ({ dayNumber }) => {
    if (dayNumber >= 2) this.unlock('one_day_done');
    if (dayNumber >= 10) this.unlock('deep_root');
  });
  EventBus.on('bed:watered',        () => this.unlock('water_carrier'));
  EventBus.on('enemy:died',         ({ type, position }) => this.handleEnemyDied(type, position));
  EventBus.on('upgrade:purchased',  (data) => this.handleUpgrade(data));

  // Tier 2
  EventBus.on('plant:harvested',    ({ plantType }) => this.handleHarvest(plantType));
  EventBus.on('player:attacked',    () => {}); // no achievement here
  EventBus.on('player:dashed',      () => this.unlock('blur'));
  EventBus.on('ranged:fired',       () => this.unlock('ranged'));
  EventBus.on('inventory:changed',  ({ slots }) => {
    if (slots.every(s => s !== null)) this.unlock('fully_stocked');
  });
  EventBus.on('day:timerExpired',   () => {
    this.timerExpiredCount++;
    if (this.timerExpiredCount >= 5) this.unlock('night_owl');
    this.scene.time.delayedCall(60000, () => this.unlock('pushing_it')); // 60s after expiry
  });

  // Tier 3
  EventBus.on('player:died',        () => this.handlePlayerDied());
  EventBus.on('seed:recovered',     () => this.unlock('second_chance')); // emit this from GameScene when dead seeds collected
  EventBus.on('newGamePlus:activated', () => this.unlock('new_game_plus'));

  // Hidden
  EventBus.on('player:zoneChanged', ({ zone }) => {
    if (zone === 'garden') {
      if (!this.currentRunDamageTaken) this.unlock('untouchable');
      this.currentRunDamageTaken = false; // reset on return home
    }
  });
  EventBus.on('player:damaged',     ({ currentHP }) => {
    if (currentHP !== undefined) this.currentRunDamageTaken = true;
  });
  EventBus.on('upgrade:opened',     () => this.checkBroke());
  EventBus.on('day:advanced',       () => this.checkNaturalist());
  EventBus.on('bed:planted',        () => this.checkFullBloom());
}

handleEnemyDied(type) {
  this.killCount++;
  if (this.killCount === 1) this.unlock('first_blood');
  if (this.killCount >= 25) this.unlock('slayer');
  if (type === 'skeleton') this.unlock('bonecrusher');
  if (type === 'dark_slime') {
    this.darkSlimeKills = (this.darkSlimeKills || 0) + 1;
    if (this.darkSlimeKills >= 10) this.unlock('darkwalker');
  }
  // naturalist tracking — reset on any kill
  this.daysForestNoKill = 0;
  this.currentDayKilled = true;
}

handlePlayerDied() {
  this.deathCount++;
  if (this.deathCount >= 10) this.unlock('committed');
}

handleHarvest(plantType) {
  if (plantType === 'glowshroom') this.unlock('mycologist');
  if (plantType === 'blue_flower') this.unlock('blue_thumb');
  // check all 6 grown
  const grown = this.saveData.plantsGrownEver;
  if (Object.values(grown).every(v => v >= 1)) this.unlock('harvest_begins');
}

handleUpgrade(data) {
  if (data.track === 'gear') {
    const gearIds = ['dagger','sword','sword']; // any weapon tier
    if (['dagger','sword'].includes(data.tierId)) this.unlock('armed');
    if (['tunic','leather','chainmail'].includes(data.tierId)) this.unlock('layered');
    if (data.tierId.includes('satchel')) this.unlock('satchel_bearer');
  }
  // check master botanist — all stat tracks at 5
  const allStatMaxed = Object.values(this.saveData.upgrades).every(u => u.stat >= 5);
  if (allStatMaxed) this.unlock('master_botanist');
  // check full kit — all gear tracks at max
  const gearMaxed = this.checkAllGearMaxed();
  if (gearMaxed) this.unlock('full_kit');
  // check broke — bank all zeros after purchase
  const bankEmpty = Object.values(this.saveData.bank).every(v => v === 0);
  if (bankEmpty) this.unlock('broke');
}

checkNaturalist() {
  if (!this.currentDayKilled) {
    this.daysForestNoKill++;
    if (this.daysForestNoKill >= 5) this.unlock('naturalist');
  }
  this.currentDayKilled = false;
}

checkFullBloom() {
  const allPlanted = this.scene.gardenBeds.every(b => b.state !== 'EMPTY');
  if (allPlanted && this.scene.gardenBeds.length >= 8) this.unlock('full_bloom');
}
```

Also emit `player:dashed` from Player.js when dash triggers — it's not currently emitted.
Also emit `seed:recovered` from GameScene when a player collects a seed that has `isDespawning === true`.

**Speed Runner:** In GameScene, on `player:zoneChanged` to garden, check if `dayTimer.timerRemaining >= (timerDuration - 15000)` — returned within 15 seconds of entering forest.

---

## Toast Notification — Update UIScene.js

Listen to `achievement:unlocked`. Display a toast panel that slides in from the top-right:

```
[icon] ACHIEVEMENT UNLOCKED
       [Name]
       "[Flavor text]"
```

Style: dark panel, accent gold border, auto-dismisses after 4 seconds with a fade-out tween. If multiple fire within 4 seconds, queue them — show one at a time, stagger by 4.5 seconds. Maximum queue depth of 5 (drop oldest if exceeded during a burst).

Position: top-right, below the timer. Does not obscure HUD elements.

---

## New Entity: Signpost

Add a signpost object in the garden zone near the chest. Visual: a simple post shape (brown rectangle + sign rectangle) or use a props sprite frame if available.

On F key within 48px:
- Emit `signpost:opened`
- Launch SignpostScene as overlay

## New Scene: /src/scenes/SignpostScene.js

Full-screen overlay, same semi-transparent dark panel as UpgradeScene.

**Header:** "ACHIEVEMENT LOG" title. Subtitle: "[N] / 27 Unlocked"

**Layout:** Four tier sections with headers:
- "Chapter I — First Steps" (Tier 1, 6 achievements)
- "Chapter II — Finding Your Footing" (Tier 2, 10 achievements)  
- "Chapter III — Mastery" (Tier 3, 7 achievements)
- "Chapter IV — ???" (Tier 4, hidden — header only shows if at least 1 hidden achievement unlocked)

Each achievement entry:
- **Unlocked:** Full color icon + name + flavor text + "Unlocked: Day [N]"
- **Locked (visible):** Greyed icon + name + "???" flavor text
- **Locked (hidden):** "???" for everything — icon shown as grey silhouette only

ESC or [Close] to dismiss.

---

## Save Schema Update

Add to save JSON:
```json
"achievements": [],
"achievementDays": {},
"stats": {
  "killCount": 0,
  "deathCount": 0,
  "timerExpiredCount": 0,
  "darkSlimeKills": 0
}
```

`achievements` — array of unlocked achievement IDs
`achievementDays` — `{ "first_harvest": 3, "slayer": 7 }` — day number when each was unlocked

On `achievement:unlocked`: push ID to array, record current day number in achievementDays, trigger save.

---

## Deliverables Checklist

```
[ ] Earning first harvest shows toast popup sliding in from top-right
[ ] Toast auto-dismisses after 4 seconds
[ ] Multiple achievements queue and show one at a time
[ ] Signpost object visible in garden zone
[ ] F key near signpost opens achievement log overlay
[ ] Log shows all 27 achievements in 4 tier sections
[ ] Unlocked entries show icon, name, flavor, unlock day
[ ] Locked visible entries show greyed out name, ??? flavor
[ ] Hidden locked entries show ??? for everything
[ ] Achievement count "N / 27" accurate in header
[ ] Unlock day recorded correctly per achievement
[ ] Achievement state persists across save/load
[ ] player:dashed emitted from Player.js on dash
[ ] seed:recovered emitted when despawning seed collected
[ ] Speed Runner triggers on near-immediate forest return
[ ] Untouchable triggers on clean forest run
[ ] No regressions from Sprint 5
```
