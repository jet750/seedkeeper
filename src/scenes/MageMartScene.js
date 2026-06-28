// MageMartScene.js
//
// The Mage Mart — a full-screen overlay launched over a frozen GameScene when the
// player interacts with the Mage Mart building (beside the Blacksmith). Spends the
// third currency, corrupted SOULS, to PURIFY spells: first UNLOCK, then UPGRADE.
//
// Sprint magic-1 scope: NO spell EFFECTS. Unlocking a spell flips its secondary slot
// from locked→selectable in the combat radial/strip (GameScene.unlockSpell →
// applySpellUnlocks), but firing it is still inert — the effects land next sprint.
// Ember (cheapest) is the headline that gets an effect first; the other five unlock
// to selectable-but-inert. Upgrades are purely economic this sprint (they bank a tier
// the next sprint's effect-scaling will read).
//
// Built on the shared PaginatedMenu controller: it owns the backdrop, frame math, page
// model and footer; this scene supplies the header (title + live soul balance) and the
// paginated spell rows. The catalog + all costs come from economy.json (spells.list)
// via GameScene; every soul change flows through GameScene so the HUD stays in sync.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';

const FONT = '"SproutLands", "Courier New", monospace';
const COLOR_PAGE = 0x141210;
const COLOR_PANEL = 0x221e1b;
const COLOR_PANEL_LOCKED = 0x1b1822;
const COLOR_AFFORD = 0x6b3fa0; // purified-purple "spend souls" action
const COLOR_DISABLED = 0x39343d;
const COLOR_MAX = 0x2f4a33;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;

const MARKET_MARGIN = 20;
const HEADER_H = 52;
const FOOTER_H = 78;
const SPELL_ROW_H = 92;
const ROW_GAP = 12;

export default class MageMartScene extends Phaser.Scene {
  constructor() {
    super('MageMartScene');
  }

  create() {
    this.gameScene = this.scene.get('GameScene');

    this.menu = new PaginatedMenu(this, {
      margin: MARKET_MARGIN,
      headerH: HEADER_H,
      footerH: FOOTER_H,
      depth: 100,
      backdropColor: COLOR_PAGE,
      backdropAlpha: 0.97,
      closeW: 220,
      closeColor: COLOR_CLOSE,
      closeLabelMobile: 'Close',
      closeLabelDesktop: 'Close   ·   Esc',
      arrowW: 52,
      arrowColor: COLOR_ARROW,
      arrowDisabledColor: COLOR_ARROW_DISABLED,
      arrowOffsetMax: 200,
      arrowOffsetPad: 40,
      dotGap: 24,
      closeOnEsc: true,
      dismissOnSwipeDown: true,
      swipeEnabled: () => MobileDetect.isMobile(),
      onClose: () => this.close(),
      getPages: (frame) => this.buildPages(frame),
      renderHeader: (frame) => this.renderHeader(frame),
      renderBody: (frame, items) => this.renderBody(frame, items),
      button: (cx, cy, w, h, label, fill, onClick, enabled, textColor) =>
        this.track(this.makeButton(cx, cy, w, h, label, fill, enabled, onClick, textColor))
    });
    this.menu.attachInput();
    this.menu.render();

    this.scale.on('resize', this.onResize, this);
    this._refresh = () => this.menu.render();
    EventBus.on('souls:changed', this._refresh);
    EventBus.on('spell:unlocked', this._refresh);
    EventBus.on('spell:upgraded', this._refresh);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off('souls:changed', this._refresh);
      EventBus.off('spell:unlocked', this._refresh);
      EventBus.off('spell:upgraded', this._refresh);
      this.menu.destroy();
    });
  }

  onResize() {
    this.menu.render();
  }

  souls() {
    return this.gameScene.souls || 0;
  }

  track(objs) {
    this.menu.track(...(Array.isArray(objs) ? objs : [objs]));
    return objs;
  }

  buildPages(frame) {
    const rowsPerPage = Math.max(1, Math.floor((frame.bandH + ROW_GAP) / (SPELL_ROW_H + ROW_GAP)));
    const list = this.gameScene.spellCatalog();
    const pages = [];
    for (let i = 0; i < list.length; i += rowsPerPage) pages.push(list.slice(i, i + rowsPerPage));
    return pages.length ? pages : [[]];
  }

  // --- Header: title + live soul balance -------------------------------------

  renderHeader(frame) {
    const { left, right, headerTop } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'MAGE MART', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#C29BE0' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(left, headerTop + 36, 'Purify corrupted souls into spellcraft', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#9B9389'
        })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, headerTop + 4, `👻 ${this.souls()}`, {
          fontFamily: FONT,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#C29BE0'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );
  }

  renderBody(frame, items) {
    const { left, innerW, contentTop } = frame;
    items.forEach((spell, i) => {
      const y = contentTop + i * (SPELL_ROW_H + ROW_GAP);
      this.buildSpellRow(spell, left, y, innerW, SPELL_ROW_H);
    });
  }

  // --- Spell row: name + tier + flavor + Purify / Upgrade / MAX ----------------

  buildSpellRow(spell, x, y, w, h) {
    const gs = this.gameScene;
    const unlocked = gs.isSpellUnlocked(spell.id);
    const lv = gs.spellUpgradeLevel(spell.id); // upgrades bought (0..N) = level - 1
    const max = gs.spellMaxUpgrades(spell.id); // upgrade tiers available
    const level = gs.spellLevel(spell.id); // 1 on unlock, +1 per upgrade (0 if locked)
    const maxLevel = gs.spellMaxLevel(spell.id); // 1 + max upgrades
    const manaCost = gs.spellManaCost(spell.id);
    const cy = y + h / 2;

    this.track(
      this.add
        .rectangle(x, y, w, h, unlocked ? COLOR_PANEL : COLOR_PANEL_LOCKED)
        .setOrigin(0, 0)
        .setStrokeStyle(2, unlocked ? 0x6b3fa0 : 0x4d4843)
        .setDepth(101)
    );

    // Title row: spell name + a tier / locked badge.
    this.track(
      this.add
        .text(x + 18, y + 12, spell.name, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: unlocked ? '#F5EFE6' : '#B6ADC4'
        })
        .setDepth(102)
    );
    // Unlock = LEVEL 1 (immediately castable, no double-spend); upgrades climb to maxLevel.
    // Show the current tier's effect note (e.g. Ember L3 = "impact AoE") so an upgrade's
    // payoff is legible before buying.
    const tierNote = unlocked && spell.tierNotes ? `   ·   ${spell.tierNotes[level - 1] || ''}` : '';
    const badge = unlocked ? `Lv ${level}/${maxLevel}   ·   ${manaCost}✦ mana${tierNote}` : '🔒 Locked';
    this.track(
      this.add
        .text(x + 18, y + h - 26, `${badge}   ·   ${spell.flavor}`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#9B9389',
          wordWrap: { width: Math.max(120, w - 220) }
        })
        .setDepth(102)
    );

    // Action button (right): Purify (unlock) → Upgrade → MAX.
    const btnW = 150;
    const bx = x + w - 14 - btnW / 2;
    if (!unlocked) {
      // Unlock buys LEVEL 1 outright (immediately castable) — no separate "buy L1".
      const cost = spell.unlock;
      const can = this.souls() >= cost;
      this.track(
        this.makeButton(
          bx,
          cy,
          btnW,
          50,
          can ? `Purify → Lv 1\n${cost}👻` : `Need ${cost}👻`,
          can ? COLOR_AFFORD : COLOR_DISABLED,
          can,
          () => this.doUnlock(spell.id),
          can ? '#F5EFE6' : '#9B9389'
        )
      );
    } else if (lv < max) {
      // Upgrade ladder starts at LEVEL 2 (lv 0 → next is L2).
      const cost = spell.upgrades[lv];
      const can = this.souls() >= cost;
      this.track(
        this.makeButton(
          bx,
          cy,
          btnW,
          50,
          can ? `Upgrade → Lv ${level + 1}\n${cost}👻` : `Need ${cost}👻`,
          can ? COLOR_AFFORD : COLOR_DISABLED,
          can,
          () => this.doUpgrade(spell.id),
          can ? '#F5EFE6' : '#9B9389'
        )
      );
    } else {
      this.track(this.add.rectangle(bx, cy, btnW, 50, COLOR_MAX).setStrokeStyle(2, 0x4d4843).setDepth(101));
      this.track(
        this.add
          .text(bx, cy, 'MAX', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#B8D5B1' })
          .setOrigin(0.5)
          .setDepth(102)
      );
    }
  }

  doUnlock(id) {
    this.gameScene.unlockSpell(id);
    this.menu.render();
  }

  doUpgrade(id) {
    this.gameScene.upgradeSpell(id);
    this.menu.render();
  }

  // --- Shared UI -------------------------------------------------------------

  makeButton(cx, cy, w, h, label, baseColor, enabled, onClick, textColor) {
    const isSprite = this.textures.exists('ui_btn_square');
    let bg;
    if (isSprite) {
      bg = this.add.nineslice(cx, cy, 'ui_btn_square', 2, w, h, 10, 10, 10, 10).setTint(baseColor).setDepth(101);
    } else {
      bg = this.add.rectangle(cx, cy, w, h, baseColor).setStrokeStyle(2, 0x000000).setDepth(101);
    }
    bg._baseColor = baseColor;
    const text = this.add
      .text(cx, cy, label, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: textColor || '#F5EFE6', align: 'center', lineSpacing: 2 })
      .setOrigin(0.5)
      .setDepth(102);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      if (isSprite) {
        bg.on('pointerover', () => bg.setTint(0xffffff));
        bg.on('pointerout', () => bg.setTint(bg._baseColor));
      } else {
        bg.on('pointerover', () => bg.setStrokeStyle(2, 0xc29be0));
        bg.on('pointerout', () => bg.setStrokeStyle(2, 0x000000));
      }
      bg.on('pointerup', onClick);
    } else {
      bg.setAlpha(0.6);
    }
    return [bg, text];
  }

  close() {
    EventBus.emit('shop:closed', { shop: 'magemart' });
    this.scene.stop();
  }
}
