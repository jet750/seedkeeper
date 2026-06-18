# Seedkeeper — Sprint 4: Upgrade System & Save

**What this sprint produces:** Full upgrade chest UI with all 6 plant trees (stat + gear track). All upgrades wire to real gameplay effects. Weapons deal more damage and change attack behavior. Armor reduces damage taken. Dash boots enable Shift dash. Ranged weapon unlocks R key. 3-slot save system. Main menu loads real save data.

**Playtestable result:** Complete game loop with persistent progression. Every system works end to end.

**Depends on:** Sprint 3 complete and all checklist items passing.

---

You are continuing development of Seedkeeper. This is Sprint 4: Upgrade System and Save. The project has working combat from Sprint 3. Do not modify any working Sprint 1, 2, or 3 systems unless specifically instructed.

## Sprint 4 Goal

Implement the full upgrade economy and 3-slot save system. This is the sprint where the game becomes complete.

## Update entities.json — Add Full Upgrade Tree Definitions

```json
"upgrades": {
  "red_mushroom": {
    "stat": { "name": "Attack Power", "statKey": "attackMult", "levels": 5, "perLevelBonus": 0.05, "costs": [1, 3, 6, 10, 15] },
    "gear": { "tiers": [
      { "id": "dagger", "name": "Dagger", "cost": 3,  "attackDamage": 3, "attackCooldown": 500, "arcDegrees": 90 },
      { "id": "sword",  "name": "Sword",  "cost": 12, "attackDamage": 8, "attackCooldown": 550, "arcDegrees": 120 }
    ]}
  },
  "blue_flower": {
    "stat": { "name": "Max HP", "statKey": "hpMult", "levels": 5, "perLevelBonus": 0.08, "costs": [1, 3, 6, 10, 15] },
    "gear": { "tiers": [
      { "id": "tunic",     "name": "Tunic",     "cost": 3,  "damageReduction": 0.10 },
      { "id": "leather",   "name": "Leather",   "cost": 8,  "damageReduction": 0.20 },
      { "id": "chainmail", "name": "Chainmail", "cost": 18, "damageReduction": 0.35 }
    ]}
  },
  "golden_wheat": {
    "stat": { "name": "Move Speed", "statKey": "speedMult", "levels": 5, "perLevelBonus": 0.03, "costs": [1, 3, 6, 10, 15] },
    "gear": { "tiers": [
      { "id": "basic_boots", "name": "Boots",      "cost": 3,  "speedBonus": 0.05 },
      { "id": "dash_boots",  "name": "Dash Boots", "cost": 10, "speedBonus": 0.05, "dashEnabled": true, "dashSpeed": 400, "dashDuration": 200, "dashCooldown": 2000 }
    ]}
  },
  "green_herb": {
    "stat": { "name": "Day Timer", "statKey": "timerBonus", "levels": 5, "perLevelBonus": 15000, "costs": [1, 2, 4, 7, 11] },
    "gear": { "tiers": [
      { "id": "satchel_1", "name": "Small Satchel",   "cost": 2,  "seedSlots": 4 },
      { "id": "satchel_2", "name": "Satchel",         "cost": 4,  "seedSlots": 5 },
      { "id": "satchel_3", "name": "Large Satchel",   "cost": 7,  "seedSlots": 6 },
      { "id": "satchel_4", "name": "Explorer Satchel","cost": 11, "seedSlots": 7 }
    ]}
  },
  "glowshroom": {
    "stat": { "name": "Crit Chance", "statKey": "critBonus", "levels": 5, "perLevelBonus": 0.02, "costs": [1, 3, 6, 10, 15] },
    "gear": { "tiers": [
      { "id": "sling", "name": "Sling", "cost": 3,  "projDamage": 3, "projRange": 150, "projSpeed": 350, "ammo": 10 },
      { "id": "bow",   "name": "Bow",   "cost": 10, "projDamage": 6, "projRange": 300, "projSpeed": 450, "ammo": 10 }
    ]}
  },
  "sunflower": {
    "stat": { "name": "Harvest Range", "statKey": "harvestRange", "levels": 5, "perLevelBonus": 0.05, "costs": [1, 3, 6, 10, 15] },
    "gear": { "tiers": [
      { "id": "copper_can", "name": "Copper Can", "cost": 3,  "bedsPerUse": 2 },
      { "id": "golden_can", "name": "Golden Can", "cost": 10, "bedsPerUse": 99 }
    ]}
  }
}
```

## New Scene: /src/scenes/UpgradeScene.js

Launched as an overlay over GameScene (Phaser scene stacking). GameScene does NOT pause — entities freeze because UpgradeScene captures input.

**Open:** F key near chest in garden. GameScene emits `'upgrade:opened'`. UpgradeScene starts.  
**Close:** ESC key or [Close] button. GameScene emits `'upgrade:closed'`. UpgradeScene stops.

### Layout

Full-screen semi-transparent dark overlay (`rgba(0,0,0,0.85)`).

**Header row:** "SEEDKEEPER WORKSHOP" title left. Right side: compact resource summary showing each plant icon + count.

**Main area:** 2×3 grid of upgrade panels (one per plant type). Each panel:
```
[Plant color icon]  [Plant Name]              [Current resource: "× 3"]
STAT:  [Name]  Lv 2/5   Next: 6 🌿  → +5% ATK    [BUY STAT]
GEAR:  [Current tier or "None"]  Next: Sword (12 🌿)  [BUY GEAR]
```

- BUY buttons: green when affordable, grey + disabled when not
- Current level shown as filled/empty dots or "Lv 2/5" text
- If stat maxed: "MAXED" instead of BUY button
- If gear maxed: show final tier name, "MAXED"

**Footer:** [Close] button centered.

### Purchase Flow

On BUY click:
1. Show inline confirmation: "Spend [cost] [plant]? ✓ ✗"
2. On confirm:
   - Deduct from plantBank
   - Apply upgrade effect to player (see Upgrade Effects below)
   - Increment upgrade level in save data
   - Emit `'upgrade:purchased'` `{ plantType, track: 'stat'|'gear', newLevel, cost }`
   - Emit `'bank:updated'` `{ bank }` — resource display updates
   - Auto-save

### Upgrade Effects — Apply to Player Immediately

Player maintains `this.statBonuses` and `this.equippedGear` objects:

```javascript
// Initial state
this.statBonuses = { attackMult: 0, hpMult: 0, speedMult: 0, timerBonus: 0, critBonus: 0, harvestRange: 0 };
this.equippedGear = { weapon: null, armor: null, boots: null, ranged: null, wateringCan: 'basic' };
```

**Stat upgrades:** `player.statBonuses[statKey] += perLevelBonus * newLevel` (recalculate from base each time to avoid drift)

**Effective stats calculation (call after any upgrade):**
```javascript
recalculateStats() {
  const base = this.gameData.player;
  this.effectiveAttack = base.attackDamage * (1 + this.statBonuses.attackMult);
  this.effectiveMaxHP = Math.floor(base.maxHP * (1 + this.statBonuses.hpMult));
  this.effectiveSpeed = Math.floor(base.speed * (1 + this.statBonuses.speedMult));
  this.effectiveCrit = base.critChance + this.statBonuses.critBonus;
  // Scale current HP proportionally if maxHP changed
  const hpRatio = this.hp / this.maxHP;
  this.maxHP = this.effectiveMaxHP;
  this.hp = Math.floor(this.maxHP * hpRatio);
  EventBus.emit('player:statsChanged', { maxHP: this.maxHP, currentHP: this.hp });
}
```

**Gear upgrades:**

*Weapon tiers:* Update `player.equippedGear.weapon = tierId`. CombatSystem reads weapon tier data to determine damage/cooldown/arc when emitting attack.

*Armor:* `player.equippedGear.armor = tierId`. In `takeDamage()`: `const reduction = armorData.damageReduction || 0; const actualDamage = Math.floor(amount * (1 - reduction));`

*Boots:* `player.equippedGear.boots = tierId`. Apply speedBonus to effectiveSpeed. If `dashEnabled`: set `player.dashEnabled = true`, store dash stats.

*Satchel:* Resize `player.seedSlots` array to new length (preserve existing seeds). Emit `'inventory:changed'`. GameScene adds matching garden bed.

*Ranged:* Set `player.equippedGear.ranged = tierId`, `player.rangedAmmo = tierData.ammo`, `player.rangedAmmoMax = tierData.ammo`. Emit `'ranged:equipped'` — UIScene shows ammo counter.

*Watering can:* Update `player.wateringCan = { bedsPerUse: tierData.bedsPerUse }`. Well interaction now waters multiple beds.

## Ranged Attack

R key: if `player.equippedGear.ranged !== null` AND `player.rangedAmmo > 0` AND not on ranged cooldown:

```javascript
fireRanged() {
  const rangedData = this.getRangedData(); // look up from gameData
  player.rangedAmmo--;
  EventBus.emit('ranged:fired', { ammo: player.rangedAmmo, max: player.rangedAmmoMax });

  // Spawn projectile
  const proj = new Projectile(this.scene, this.x, this.y, this.facing, rangedData);
}
```

**New simple class Projectile:** Small rectangle (8×4px) or colored oval. Moves in `facing` direction at `projSpeed`. On enemy overlap: enemy.takeDamage(projDamage), destroy projectile. Destroy if traveled beyond `projRange` from spawn. Pooled — create 10 at scene start, reuse.

Ammo restores to max on sleep (`player:slept` event).

UIScene listens to `'ranged:equipped'` and `'ranged:fired'` to show/update ammo counter in bottom-right HUD.

## Dash

Shift key: if `player.dashEnabled` AND `dashCooldownRemaining <= 0` AND player is moving:

```javascript
dash() {
  const dashData = this.getDashData();
  const dir = this.lastMoveDir; // normalized direction vector
  this.body.setVelocity(dir.x * dashData.dashSpeed, dir.y * dashData.dashSpeed);
  this.isDashing = true;
  this.dashCooldownRemaining = dashData.dashCooldown;

  // Stop dash after dashDuration
  this.scene.time.delayedCall(dashData.dashDuration, () => {
    this.isDashing = false;
    this.body.setVelocity(0, 0); // resume normal movement next frame
  });

  // Ghost trail: 3 fading copies of player sprite at current position
  this.spawnDashTrail();
}

spawnDashTrail() {
  for (let i = 0; i < 3; i++) {
    this.scene.time.delayedCall(i * 50, () => {
      const ghost = this.scene.add.image(this.x, this.y, 'player_sheet');
      ghost.setFrame(this.anims.currentFrame.index).setAlpha(0.35).setTint(0x88aaff);
      this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
    });
  }
}
```

Decrement `dashCooldownRemaining` by delta each frame.

## New File: /src/core/SaveSystem.js

```javascript
const SAVE_VERSION = 1;
const SAVE_KEY_PREFIX = 'seedkeeper_save_';

const SaveSystem = {
  defaultSave: {
    version: SAVE_VERSION,
    slotIndex: 0,
    dayNumber: 1,
    totalPlaytime: 0,
    bank: { red_mushroom:0, blue_flower:0, golden_wheat:0, green_herb:0, glowshroom:0, sunflower:0 },
    upgrades: {
      red_mushroom:  { stat: 0, gear: -1 },
      blue_flower:   { stat: 0, gear: -1 },
      golden_wheat:  { stat: 0, gear: -1 },
      green_herb:    { stat: 0, gear: -1 },
      glowshroom:    { stat: 0, gear: -1 },
      sunflower:     { stat: 0, gear: -1 }
    },
    equippedGear: { weapon: null, armor: null, boots: null, ranged: null, wateringCan: 'basic' },
    seedSlots: 3,
    gardenBeds: [
      { plantType: null, daysRemaining: 0, watered: false, ready: false },
      { plantType: null, daysRemaining: 0, watered: false, ready: false },
      { plantType: null, daysRemaining: 0, watered: false, ready: false },
      { plantType: null, daysRemaining: 0, watered: false, ready: false }
    ],
    plantsGrownEver: { red_mushroom:0, blue_flower:0, golden_wheat:0, green_herb:0, glowshroom:0, sunflower:0 },
    newGamePlus: false,
    savedAt: 0
  },

  save(slotIndex, gameState) {
    const data = { ...this.buildSaveData(gameState), version: SAVE_VERSION, slotIndex, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY_PREFIX + slotIndex, JSON.stringify(data));
  },

  load(slotIndex) {
    try {
      const raw = localStorage.getItem(SAVE_KEY_PREFIX + slotIndex);
      if (!raw) return { ...this.defaultSave, slotIndex };
      return this.migrate(JSON.parse(raw));
    } catch { return { ...this.defaultSave, slotIndex }; }
  },

  migrate(data) {
    if (!data.version || data.version < 1) {
      data.newGamePlus = data.newGamePlus || false;
      data.version = 1;
    }
    // Future: if (data.version < 2) { ... data.version = 2; }
    return data;
  },

  getSlotsMetadata() {
    return [0, 1, 2].map(i => {
      try {
        const raw = localStorage.getItem(SAVE_KEY_PREFIX + i);
        if (!raw) return { isEmpty: true, slotIndex: i };
        const d = JSON.parse(raw);
        return { isEmpty: false, slotIndex: i, dayNumber: d.dayNumber,
                 totalPlaytime: d.totalPlaytime, plantsGrownEver: d.plantsGrownEver };
      } catch { return { isEmpty: true, slotIndex: i }; }
    });
  },

  clear(slotIndex) { localStorage.removeItem(SAVE_KEY_PREFIX + slotIndex); }
};
```

`buildSaveData(gameState)` — collects current game state from GameScene, player, daySystem, gardenBeds, plantBank.

## Update MenuScene.js

```javascript
create() {
  const slots = SaveSystem.getSlotsMetadata();
  slots.forEach((slot, i) => {
    const label = slot.isEmpty
      ? '— New Game —'
      : `Day ${slot.dayNumber}  •  ${this.formatTime(slot.totalPlaytime)}`;
    // Create clickable button with label
    // On click: if isEmpty → SaveSystem.clear(i) + start fresh
    //           if !isEmpty → load save + restore state + start GameScene
  });
}

formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
```

## Auto-Save Triggers

Wire auto-save to these events in GameScene:
- `'player:slept'` → `SaveSystem.save(currentSlot, this.buildCurrentState())`
- `'upgrade:purchased'` → `SaveSystem.save(currentSlot, this.buildCurrentState())`
- `'player:zoneChanged'` where zone === 'garden' → `SaveSystem.save(...)`

## Deliverables Checklist

```
[ ] F key at chest opens UpgradeScene overlay
[ ] All 6 upgrade trees displayed with resource counts
[ ] BUY buttons grey when insufficient resources
[ ] Confirmation dialog appears before purchase
[ ] Purchasing stat upgrade changes displayed stat (attack/hp/speed)
[ ] Purchasing dagger/sword changes attack damage in combat
[ ] Purchasing armor visibly reduces damage taken
[ ] Purchasing dash boots enables Shift dash with ghost trail
[ ] Dash has cooldown, cannot spam
[ ] Purchasing ranged weapon enables R key
[ ] Projectiles travel in facing direction
[ ] Projectiles damage enemies on contact
[ ] Ammo count shown in HUD, depletes on fire, restores on sleep
[ ] Purchasing satchel adds visible seed slot to inventory bar
[ ] Garden bed added when satchel upgraded
[ ] Save writes to localStorage on sleep (verify in browser DevTools → Application → Local Storage)
[ ] Main menu shows real slot data (day number, playtime)
[ ] Continuing a saved game restores correct day, bank, upgrades, gear
[ ] No Sprint 1, 2, or 3 regressions
```
