# Seedkeeper — Sprint 3: Combat & Enemies

**What this sprint produces:** Player attacks with spacebar. Slimes take damage, flash, get knocked back, and die dropping seeds. Skeleton enemy patrols deep forest from day 5. Dark slime appears from day 3. Player death drops seeds with recovery timer. Combat feel: screenshake, float-up text, particle bursts.

**Playtestable result:** Full loop with real combat consequence — fight enemies, die, recover seeds, repeat.

**Depends on:** Sprint 2 complete and all checklist items passing.

---

You are continuing development of Seedkeeper. This is Sprint 3: Combat and Enemies. Sprints 1 and 2 are complete with player movement, slimes, zone detection, day timer, seeds, garden beds, sleep, watering, and plant bank. Do not modify any working Sprint 1 or 2 systems unless specifically instructed.

## Sprint 3 Goal

Add full combat: player melee attack with hitbox arc, enemy HP and death with seed drops, skeleton enemy, dark slime scaling, player death/respawn with seed recovery, and all combat game feel.

## Player Attack — Update Player.js

**Spacebar** triggers melee attack when `attackCooldownRemaining <= 0`.

Attack behavior:
- Set `attackCooldownRemaining = this.stats.attackCooldown`
- Create attack hitbox: 50px radius arc, 90-degree cone centered on `this.facing` direction, duration 150ms
- Emit `'player:attacked'` `{ direction: this.facing, damage: this.getAttackDamage(), position: { x, y }, arcRadius: 50 }`
- Decrement `attackCooldownRemaining` by delta each update frame

`getAttackDamage()`: returns `this.stats.attackDamage * (1 + this.statBonuses.attackMult)` — stat bonuses start at 0, used in Sprint 4.

Attack visual: brief swing arc graphic in facing direction (arc/wedge shape, semi-transparent white or weapon color, 150ms duration then remove). If complex, a simple flashing line is acceptable.

Starting weapon: bare hands (`this.equippedWeapon = null`). Weapon slot exists but is null. Attack damage is `entities.json player.attackDamage`.

## New File: /src/systems/CombatSystem.js

Centralizes hit detection. Instantiated in GameScene.

```javascript
export default class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeHitboxes = []; // { x, y, radius, damage, direction, arcDegrees, expireTime, sourceType }

    EventBus.on('player:attacked', (data) => this.handlePlayerAttack(data));
  }

  handlePlayerAttack({ direction, damage, position, arcRadius }) {
    const hitbox = {
      x: position.x, y: position.y,
      radius: arcRadius, damage,
      direction, arcDegrees: 90,
      expireTime: Date.now() + 150,
      sourceType: 'player'
    };
    this.checkEnemyHits(hitbox);
  }

  checkEnemyHits(hitbox) {
    this.scene.enemies.forEach(enemy => {
      if (enemy.isDead) return;
      const dist = Phaser.Math.Distance.Between(hitbox.x, hitbox.y, enemy.x, enemy.y);
      if (dist <= hitbox.radius && this.isInArc(hitbox, enemy)) {
        enemy.takeDamage(hitbox.damage, { x: hitbox.x, y: hitbox.y });
      }
    });
  }

  isInArc(hitbox, target) {
    const angle = Phaser.Math.Angle.Between(hitbox.x, hitbox.y, target.x, target.y);
    const facingAngle = this.directionToAngle(hitbox.direction);
    const halfArc = Phaser.Math.DegToRad(hitbox.arcDegrees / 2);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - facingAngle));
    return diff <= halfArc;
  }

  directionToAngle(direction) {
    const map = { right: 0, down: Math.PI/2, left: Math.PI, up: -Math.PI/2 };
    return map[direction] ?? 0;
  }
}
```

`this.scene.enemies` — GameScene maintains this as an array of all active enemy instances.

## Enemy HP and Death — Update Slime.js

Add to Slime:
```javascript
this.hp = slimeData.hp;
this.maxHP = slimeData.hp;
this.isDead = false;

takeDamage(amount, sourcePosition) {
  if (this.isDead || this.invincible) return;
  this.hp -= amount;

  // Hit flash
  this.setTint(0xffffff);
  this.scene.time.delayedCall(100, () => this.clearTint());

  // Knockback
  const angle = Phaser.Math.Angle.Between(sourcePosition.x, sourcePosition.y, this.x, this.y);
  this.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
  this.scene.time.delayedCall(300, () => { if (!this.isDead) this.body.setVelocity(0, 0); });

  // Float-up damage number
  EventBus.emit('ui:floatText', { x: this.x, y: this.y - 20, text: `-${amount}`, color: '#ff6666' });

  if (this.hp <= 0) this.die();
}

die() {
  this.isDead = true;
  this.body.enable = false;

  // Death animation or fade
  this.scene.tweens.add({
    targets: this,
    alpha: 0,
    duration: 400,
    onComplete: () => {
      this.dropSeeds();
      EventBus.emit('enemy:died', { type: this.slimeType, position: { x: this.x, y: this.y } });
      // Remove from scene.enemies array and destroy
      const idx = this.scene.enemies.indexOf(this);
      if (idx > -1) this.scene.enemies.splice(idx, 1);
      this.destroy();
    }
  });
}

dropSeeds() {
  const drops = this.slimeType === 'dark_slime' ? 2 : 1;
  for (let i = 0; i < drops; i++) {
    const plantType = this.getRandomSeedDrop();
    new Seed(this.scene, this.x + (Math.random()-0.5)*30, this.y + (Math.random()-0.5)*30, plantType, this.scene.gameData);
  }
}

getRandomSeedDrop() {
  // Common plants weighted higher, glowshroom rare
  const weights = { red_mushroom:30, blue_flower:25, golden_wheat:25, green_herb:10, sunflower:9, glowshroom:1 };
  // Weighted random selection from weights object
  const total = Object.values(weights).reduce((a,b) => a+b, 0);
  let r = Math.random() * total;
  for (const [type, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return type;
  }
  return 'red_mushroom';
}
```

## New File: /src/entities/Skeleton.js

Same structure as Slime.js. Uses `gameData.enemies.skeleton`.

**Add to entities.json enemies:**
```json
"skeleton": {
  "hp": 50,
  "damage": 20,
  "patrolSpeed": 55,
  "chaseSpeed": 110,
  "detectRange": 120,
  "loseRange": 400
}
```

**Behavior:** Patrol between 3 waypoints (defined per instance in GameScene). On player enter detectRange: switch to CHASE. On player exceed loseRange: return to patrol path (navigate to nearest waypoint, resume patrol).

**Death drops:** 1 glowshroom seed (guaranteed) + 1 random seed from `getRandomSeedDrop()`.

**Spawn condition:** Only created when `daySystem.dayNumber >= 5`. GameScene checks on each `day:advanced` event whether to spawn skeleton(s).

**Spawn zone:** Deepest portion of forest only (define as y > WORLD_HEIGHT * 0.7 or equivalent).

## Dark Slime Scaling — Update GameScene

Listen to `'day:advanced'` in GameScene:

```javascript
EventBus.on('day:advanced', ({ dayNumber }) => {
  // Spawn dark slime from day 3
  if (dayNumber >= this.gameData.enemies.scaling.startDay_darkSlime) {
    // Add 1 dark slime per 2 days after day 3 (up to a cap of 4)
    const darkSlimeCount = Math.min(4, Math.floor((dayNumber - 3) / 2) + 1);
    const currentDarkSlimes = this.enemies.filter(e => e.slimeType === 'dark_slime').length;
    const toSpawn = darkSlimeCount - currentDarkSlimes;
    for (let i = 0; i < toSpawn; i++) {
      this.spawnSlime('dark_slime');
    }
  }
  // Spawn skeleton from day 5
  if (dayNumber >= this.gameData.enemies.scaling.startDay_skeleton) {
    if (!this.enemies.some(e => e instanceof Skeleton)) {
      this.spawnSkeleton();
    }
  }
});
```

**Add to entities.json:**
```json
"scaling": {
  "densityPerDay": 0.1,
  "startDay_darkSlime": 3,
  "startDay_skeleton": 5
}
```

Dark slime visual: `this.setTint(0x8833cc)` after creation.

## Player Death — Update Player.js and GameScene

When player HP reaches 0:

In Player.js `takeDamage()`:
```javascript
if (this.hp <= 0) {
  this.hp = 0;
  EventBus.emit('player:damaged', { amount, currentHP: 0, maxHP: this.maxHP });
  EventBus.emit('player:died', {});
}
```

In GameScene, listen to `'player:died'`:
```javascript
EventBus.on('player:died', () => {
  // Drop all carried seeds at player position with despawn timer
  this.player.seedSlots.forEach((plantType, i) => {
    if (plantType) {
      const seed = new Seed(this, this.player.x + (Math.random()-0.5)*40, this.player.y + (Math.random()-0.5)*40, plantType, this.gameData);
      seed.setDespawnTimer(30000); // 30-second recovery window
      this.player.seedSlots[i] = null;
    }
  });
  EventBus.emit('inventory:changed', { slots: [...this.player.seedSlots] });

  // Respawn sequence
  this.scene.cameras.main.fadeOut(500);
  this.time.delayedCall(1500, () => {
    // Teleport player to garden center
    this.player.setPosition(WORLD_WIDTH / 2, GARDEN_ZONE_HEIGHT / 2);
    this.player.hp = this.player.maxHP;
    EventBus.emit('player:healed', { amount: this.player.maxHP, currentHP: this.player.maxHP, maxHP: this.player.maxHP });
    this.scene.cameras.main.fadeIn(500);
  });
});
```

**Seed despawn timer — update Seed.js:**
```javascript
setDespawnTimer(duration) {
  this.despawnDuration = duration;
  this.despawnRemaining = duration;
  this.isDespawning = true;
  // Scale tween: 1.0 → 0.0 over duration
  this.scene.tweens.add({
    targets: this,
    scaleX: 0, scaleY: 0,
    duration: duration,
    onComplete: () => this.destroy()
  });
}
```

## New File: /src/systems/ParticleSystem.js — Float Text & Particles

### Float-up Text Pool
```javascript
// Pool of 20 reusable text objects
showFloatText(x, y, text, color = '#ffffff', duration = 1200) {
  const textObj = this.getFromPool();
  textObj.setText(text).setStyle({ color }).setPosition(x, y).setAlpha(1).setActive(true).setVisible(true);
  this.scene.tweens.add({
    targets: textObj,
    y: y - 40,
    alpha: 0,
    duration,
    ease: 'Power2',
    onComplete: () => this.returnToPool(textObj)
  });
}
```

UIScene listens to `'ui:floatText'` event and calls ParticleSystem.showFloatText().

### Death Particle Burst
```javascript
showDeathBurst(x, y, color) {
  // 6 small rectangles burst outward from position, fade out
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const particle = this.scene.add.rectangle(x, y, 6, 6, Phaser.Display.Color.HexStringToColor(color).color);
    this.scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * 40,
      y: y + Math.sin(angle) * 40,
      alpha: 0,
      duration: 600,
      onComplete: () => particle.destroy()
    });
  }
}
```

GameScene listens to `'enemy:died'` and calls `particleSystem.showDeathBurst(pos.x, pos.y, enemyColor)`.

## Camera Screenshake — Update GameScene

Listen to `'player:damaged'`:
```javascript
EventBus.on('player:damaged', () => {
  this.cameras.main.shake(250, 0.004);
});
```

## Deliverables Checklist

```
[ ] Spacebar swings attack in facing direction
[ ] Attack visual (arc or flash) appears briefly in facing direction
[ ] Attack hitbox hits slimes within range and arc
[ ] Slimes take damage, flash white, get knocked back
[ ] Float-up damage numbers appear above hit enemies
[ ] Slimes die when HP reaches 0 (fade out animation)
[ ] Dead slimes drop 1-2 seeds at death position (weighted random)
[ ] Dropped seeds are collectible same as world seeds
[ ] Dark slime spawns from day 3 with purple tint, tankier
[ ] Skeleton spawns from day 5 in deep forest
[ ] Skeleton patrols between waypoints
[ ] Skeleton drops glowshroom seed guaranteed
[ ] Player death drops all carried seeds at death position
[ ] Dropped seeds show visual shrink over 30 seconds
[ ] Player respawns at garden center with full HP after 1.5s
[ ] Seeds still in bank after death (only carried seeds lost)
[ ] Screenshake occurs on player damage
[ ] Particle burst occurs on enemy death
[ ] Float text shows damage numbers in red
[ ] No Sprint 1 or 2 regressions — all prior checklist items still pass
```
