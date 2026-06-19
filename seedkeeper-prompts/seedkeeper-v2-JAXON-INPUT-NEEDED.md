# Seedkeeper — V2.0 Planning Document
# ⚠️ JAXON INPUT NEEDED BEFORE THIS BECOMES A BUILD PROMPT ⚠️
#
# This is not a Claude Code prompt yet. It is a structured list of V2.0
# features with open questions that need your decisions before any of these
# can be scoped and built. Work through the questions in each section,
# add your answers/notes, then hand this back to Claude to convert into
# proper numbered sprint prompts.
#
# File saved as: seedkeeper-v2-JAXON-INPUT-NEEDED.md

---

## V2.0 VISION

V1.0 is a complete, shippable single-biome game. V2.0 expands the world, adds
narrative hooks, and deepens replayability. Target audience grows from "friends
and portfolio visitors" to "people who would actually follow this on itch.io."

---

## FEATURE 1 — Northern Expansion Zone (Your Idea)

**The concept:** Once the player reaches a certain upgrade threshold, a path
opens at the top of the screen leading to a new zone — a harder area with
enemies that drop seeds yielding 2 plants per grow cycle instead of 1.
Naturally scales to support the more expensive late-game upgrades without
grinding.

**Open questions for Jaxon:**

- What is the unlock threshold? Ideas:
  - All 6 gear tracks at tier 2 or above?
  - Specific day number (Day 15+)?
  - Demo win condition already met (all 6 plant types grown once)?
  - A specific upgrade (e.g. Dash Boots unlocked)?

- What does the zone look like visually? Ideas:
  - A mountain/highland area with different palette (cooler, more purple/blue)?
  - A meadow above the treeline?
  - A corrupted/overgrown version of the garden (story implication)?

- What enemies exist in the northern zone?
  - Scaled versions of existing enemies (faster, more HP)?
  - Entirely new enemy types?
  - Boss encounter guarding zone entry?

- Do the double-yield seeds replace the normal seeds or coexist?
  - Option A: northern zone has its own 6 plant variants that yield 2x
  - Option B: same plant types but all yield 2 when grown from northern seeds
  - Option C: only some plants have northern variants (rarer ones — glowshroom, green herb)

- Is the northern zone permanent once unlocked, or does it reset each New Game+?

- What is the visual/audio transition entering the northern zone?
  - Third music track needed?
  - Different color palette shift?

---

## FEATURE 2 — Second Biome (Cave / Dungeon)

**The concept:** A cave entrance in the deep forest leads to an underground
dungeon biome. Darker, harder, different enemy types, different seed geography.

**Open questions for Jaxon:**

- Is this a separate map or a continuation of the existing world map?

- What is the unlock condition? Same as northern zone or separate?

- New enemy types needed — do you have concepts, or should Claude design them?
  Ideas to react to:
  - Cave bat (fast, low HP, erratic movement)
  - Stone golem (slow, very high HP, drops rare seeds)
  - Fungal spore (stationary, area damage pulse)

- Does the cave have its own plant types or use existing ones in new locations?

- Lighting: GDD mentions "lighting effects" as V2.0 — do you want actual
  dynamic lighting in the cave (dark by default, player has a light radius)?
  This is a significant technical addition. Rate your interest: Skip / Nice-to-have / Must-have

---

## FEATURE 3 — NPC Villager / Merchant

**The concept:** A wandering merchant appears in the forest on certain days,
offering to trade seeds or plant bundles for special items not available in
the upgrade chest.

**Open questions for Jaxon:**

- What does the merchant sell that the chest doesn't?
  Ideas: consumables (one-use HP potion, one-use speed boost), cosmetic
  items (player color variants), rare seeds not found in the world

- How does the merchant appear? Random days? Tied to progression?

- Is there a currency beyond plants? Or does the merchant use existing plant economy?

- Does the merchant have a name and personality (adds narrative) or is it
  purely mechanical (a shop)?

---

## FEATURE 4 — Crafting System

**The concept:** A crafting bench in the garden lets you combine plant types
into new items or consumables, adding a second layer to the resource economy.

**Open questions for Jaxon:**

- Is this additive to the upgrade chest or does it replace some of it?

- What would you craft? React to these ideas:
  - Potions: 2 blue flower + 1 glowshroom = HP potion (restores 50 HP on use)
  - Traps: 2 golden wheat + 1 red mushroom = spike trap placed in forest
  - Seed boosters: 1 sunflower + 1 green herb = fertilizer (next harvest yields 2)
  - Special gear: combinations unlock items not on the standard upgrade tree

- How complex do you want this system? Simple (3-5 recipes) vs deep (20+ recipes)?

---

## FEATURE 5 — Mobile Touch Controls

**The concept:** Virtual joystick + action buttons for mobile browsers.
Would allow the game to be played on phones via the portfolio site.

**Open questions for Jaxon:**

- Is mobile support a priority for V2.0 or genuinely V3.0?

- Would you embed a mobile-friendly version separately or make the main build responsive?

- The Phaser virtual joystick plugin (rexUI) handles most of this — willing to add a dependency for this?

---

## FEATURE 6 — Leaderboard

**The concept:** A simple global or friend leaderboard — fastest demo win,
highest day reached, most enemies killed. Adds social/competitive layer.

**Open questions for Jaxon:**

- What metric(s) matter most? Ideas:
  - Fastest demo win (fewest days to grow all 6)
  - Highest day survived
  - Most enemies killed in a single run
  - All of the above with separate boards

- Backend preference:
  - Simple: Vercel KV (key-value store, already in your stack)
  - Existing: Google Sheets (same pattern as portfolio lead logging)
  - Proper: Supabase or PlanetScale (more robust, separate account needed)

- Anonymous scores or require a username entry?

---

## FEATURE 7 — 3D Version in Godot

**The concept:** GDD explicitly mentions "3D version in Godot" as a separate
project. This is a full rebuild, not an extension of the Phaser game.

**Open questions for Jaxon:**

- Is this still a goal or has it dropped in priority?

- If yes: does it share the same design (Seedkeeper IP in 3D) or is it a
  different game concept that happens to use 3D?

- Timeline: after V2.0 Phaser ships, or a parallel track?

---

## FEATURE 8 — Expanded Narrative / Story Layer

**The concept:** Light narrative framing — a reason why the player is restoring
the forest, who they are, what happened to the forest. Could be delivered via
environmental storytelling (signs, ruins) or brief text sequences on key events.

**Open questions for Jaxon:**

- Do you want a story at all, or does Seedkeeper stay mechanics-first?

- If yes: what's the tone? Dark/mysterious? Cozy/whimsical? Something else?

- Delivery method preference:
  - Environmental: readable signs, ruins, environmental details in tilemap
  - Text sequences: brief cutscene-style text overlays on key events (first
    skeleton kill, demo win, full win)
  - Both

---

## HOW TO USE THIS DOCUMENT

1. Go through each feature section and answer the open questions
   (add your answers directly in this file below each question)

2. Mark each feature with one of:
   - ✅ BUILD IT — include in V2.0
   - 🔜 LATER — V3.0 or indefinite backlog
   - ❌ SKIP — not interested

3. For BUILD IT features: add any additional constraints or ideas you have

4. Hand the completed doc back to Claude with:
   "Convert the BUILD IT features into numbered sprint prompts for V2.0"

Claude will scope, sequence, and write the full Claude Code prompts from your answers.

---

## NOTES / ADDITIONAL IDEAS

(Add anything here that doesn't fit the above categories — new enemy ideas,
visual concepts, mechanics you've thought of while playing, feedback from
friends who tested it, etc.)
