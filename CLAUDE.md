# Jaxon Travis Portfolio — Claude Code Build Context

This file is the persistent source of truth for every Claude Code session on this project.
Read it fully before writing any code. Do not deviate from the design system or architecture
defined here without explicit instruction.

---

## Project Overview

Personal portfolio website for Jaxon Travis — Carlsbad, CA. Five sections:
1. **Landing/Hero** — Personal intro, color-coded discipline line, 4 section entry cards
2. **AI Interview** — Lead-capture gate + Claude-powered recruiter chat interface (PRIMARY FEATURE)
3. **Game Design** — Perennial: A Cultivar Anthology portfolio page
4. **Artisan Studio** — Bazaar Blends spice brand pre-launch page
5. **About** — Bio, skills, contact

**Primary goal:** Demonstrate AI fluency through a live, working recruiter interview tool.
The site itself IS the proof of concept for the differentiator being claimed.

---

## Tech Stack

- **Framework:** React (Vite) — `npm create vite@latest . -- --template react`
- **Styling:** CSS custom properties + CSS Modules (no Tailwind, no styled-components)
- **Fonts:** Google Fonts — Cormorant Garamond, Inter, JetBrains Mono (loaded via index.html)
- **AI Chat:** Anthropic Claude API via Vercel serverless function (NOT client-side direct)
- **Hosting:** Vercel — auto-deploy from GitHub `main` branch
- **Repo:** github.com/jet750/jaxontravis-com
- **Domain:** jaxontravis.com (DNS configured, pointing to Vercel)
- **Figma File:** `9qMSC80qBTV8Ll236Lxlcn` (design reference)

---

## Critical Architecture Note — API Security

The Anthropic API key must NEVER be exposed client-side (no VITE_ prefix).
The AI interview chat must route through a Vercel serverless function:

```
/api/chat.js  ← Vercel serverless function, proxies to Anthropic API
```

Environment variables:
- `ANTHROPIC_API_KEY` — server-side only, set in Vercel dashboard
- Never committed to repo, never in client bundle

---

## File Structure

```
/
├── CLAUDE.md                    ← This file
├── index.html                   ← Load Google Fonts here
├── vite.config.js
├── package.json
├── .env.local                   ← ANTHROPIC_API_KEY (gitignored)
├── .gitignore
├── /api
│   └── chat.js                  ← Vercel serverless function for Claude API proxy
├── /src
│   ├── App.jsx                  ← Root component, section assembly
│   ├── main.jsx
│   ├── /styles
│   │   ├── tokens.css           ← ALL CSS custom properties (build this first)
│   │   └── global.css           ← Reset, base styles, font application
│   ├── /components
│   │   ├── Nav.jsx + Nav.module.css
│   │   ├── Hero.jsx + Hero.module.css
│   │   ├── AIInterview.jsx + AIInterview.module.css
│   │   ├── GameDesign.jsx + GameDesign.module.css
│   │   ├── ArtisanStudio.jsx + ArtisanStudio.module.css
│   │   ├── About.jsx + About.module.css
│   │   ├── Footer.jsx + Footer.module.css
│   │   └── /ui
│   │       ├── Button.jsx
│   │       ├── SectionHeader.jsx
│   │       ├── StatusChip.jsx
│   │       └── ChatWindow.jsx
│   └── /data
│       └── background.js        ← AI interview system prompt (already written)
```

---

## Design System — CSS Tokens

Build `/src/styles/tokens.css` first. Every color, spacing, and type value must
reference these tokens — no hardcoded hex values anywhere else.

### Colors — Base Palette

```css
:root {
  /* Backgrounds */
  --color-obsidian:    #141210;   /* Primary background — slightly lifted warm near-black */
  --color-charcoal:    #221E1B;   /* Cards, elevated surfaces */
  --color-ash:         #2D2926;   /* Input fields, secondary surfaces */
  --color-ember-edge:  #36322E;   /* Borders, dividers */

  /* Text */
  --color-parchment:   #F5EFE6;   /* Primary text */
  --color-silver:      #D1CCC6;   /* Secondary text — bright, legible */
  --color-dust:        #9B9389;   /* Labels, captions, muted text */
  --color-ghost:       #4D4843;   /* Placeholder text */

  /* Section Accents — the signature system */
  --accent-gold:       #D4A83F;   /* AI Interview / Professional */
  --accent-botanical:  #8AB87E;   /* Game Design / Perennial */
  --accent-ember:      #C96B42;   /* Artisan Studio / Bazaar Blends */
  --accent-cerulean:   #6B92BC;   /* About / Personal */

  /* Pastel accent blends — for secondary text in section context */
  --pastel-gold:       #EDD49A;
  --pastel-botanical:  #B8D5B1;
  --pastel-ember:      #E5B69A;
  --pastel-cerulean:   #ABC4DE;

  /* Accent tints — backgrounds */
  --tint-gold-08:      rgba(212, 168, 63,  0.08);
  --tint-gold-15:      rgba(212, 168, 63,  0.15);
  --tint-botanical-08: rgba(138, 184, 126, 0.08);
  --tint-botanical-15: rgba(138, 184, 126, 0.15);
  --tint-ember-08:     rgba(201, 107, 66,  0.08);
  --tint-ember-15:     rgba(201, 107, 66,  0.15);
  --tint-cerulean-08:  rgba(107, 146, 188, 0.08);
  --tint-cerulean-15:  rgba(107, 146, 188, 0.15);

  /* Shadows */
  --shadow-sm:  0 1px 3px  rgba(0,0,0,0.5);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.6);
  --shadow-lg:  0 16px 48px rgba(0,0,0,0.7);
}
```

### Typography

```css
:root {
  /* Font families */
  --font-serif: 'Cormorant Garamond', Georgia, serif;
  --font-sans:  'Inter', system-ui, sans-serif;
  --font-mono:  'JetBrains Mono', 'Courier New', monospace;

  /* Type scale — fluid via clamp() */
  --text-display: clamp(3.5rem, 8vw, 6rem);
  --text-h1:      clamp(2.5rem, 5vw, 4rem);
  --text-h2:      clamp(1.75rem, 3vw, 2.5rem);
  --text-h3:      clamp(1.25rem, 2vw, 1.75rem);
  --text-h4:      1.25rem;
  --text-body-xl: 1.125rem;
  --text-body:    1rem;
  --text-small:   0.875rem;
  --text-eyebrow: 0.6875rem;  /* 11px — always uppercase, letter-spaced */
  --text-micro:   0.75rem;

  /* Line heights */
  --leading-tight:   1.1;
  --leading-heading: 1.2;
  --leading-body:    1.7;

  /* Letter spacing */
  --tracking-tight:  -0.03em;
  --tracking-normal: 0;
  --tracking-wide:   0.2em;   /* For eyebrow/uppercase labels */
}
```

### Spacing

```css
:root {
  --space-2xs: 0.25rem;   /*  4px */
  --space-xs:  0.5rem;    /*  8px */
  --space-sm:  1rem;      /* 16px */
  --space-md:  1.5rem;    /* 24px */
  --space-lg:  2rem;      /* 32px */
  --space-xl:  3rem;      /* 48px */
  --space-2xl: 4rem;      /* 64px */
  --space-3xl: 6rem;      /* 96px */
  --space-4xl: 8rem;      /* 128px */
  --space-5xl: 12rem;     /* 192px */

  /* Layout */
  --max-width:         1200px;
  --content-width:     720px;
  --section-padding-x: var(--space-xl);
  --section-padding-y: var(--space-5xl);

  /* Border radius */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   16px;
  --radius-xl:   24px;
  --radius-pill: 9999px;
}
```

---

## Component Patterns

### Section structure (every section follows this pattern)
```jsx
<section id="[section-id]" className={styles.section} data-accent="[gold|botanical|ember|cerulean]">
  <div className={styles.container}>
    <SectionHeader eyebrow="EYEBROW TEXT" heading="Section Heading" />
    {/* section content */}
  </div>
</section>
```

Use `data-accent` attribute to scope CSS custom property overrides per section:
```css
[data-accent="gold"]     { --current-accent: var(--accent-gold);     --current-pastel: var(--pastel-gold); }
[data-accent="botanical"]{ --current-accent: var(--accent-botanical); --current-pastel: var(--pastel-botanical); }
[data-accent="ember"]    { --current-accent: var(--accent-ember);     --current-pastel: var(--pastel-ember); }
[data-accent="cerulean"] { --current-accent: var(--accent-cerulean);  --current-pastel: var(--pastel-cerulean); }
```

This means buttons, chips, borders, and accent text within a section
automatically pick up the correct color without any per-section CSS duplication.

### Navigation
- Fixed position, `z-index: 100`
- Transparent → `background: rgba(20,18,16,0.92) + backdrop-filter: blur(12px)` on scroll past 80px
- Color-coded dot before each nav link matching that section's accent
- Active section link highlighted in its accent color (use IntersectionObserver)
- Mobile: hamburger → full-screen overlay at < 768px

### Eyebrow component
```jsx
// Always: uppercase, letter-spaced, current section accent color
<span className={styles.eyebrow}>{children}</span>
```

### Button variants
```jsx
<Button variant="filled" accent="gold">Enter the Interview →</Button>   // filled with accent
<Button variant="outline" accent="botanical">Join playtester list →</Button> // ghost/outline
```

---

## AI Interview Feature — Full Spec

### User flow
1. User sees section header + subhead copy
2. **Gate form** (required before chat opens):
   - Your Name (text input)
   - Company (text input)
   - Work Email (email input, validated)
3. **Job Description input** (Step 2):
   - Primary: URL input + "Fetch JD" button → calls `/api/fetch-jd` to scrape via web_search
   - Fallback: Paste textarea shown when URL fails or user clicks "paste instead"
4. **"Enter the Interview →"** CTA button — validates all fields, then opens chat
5. **Chat window** — full conversation UI, locked/blurred until gate complete
6. **Post-conversation CTA** — "Convinced? Book a real call →" (Calendly link TBD)

### Vercel serverless function — `/api/chat.js`
```javascript
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../src/data/background.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, companyName, companyContext, jobDescription } = req.body;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildSystemPrompt(companyName, companyContext, jobDescription),
    messages,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
```

### Lead capture logging
On gate form submission, POST to `/api/log-lead.js` before opening chat:
```javascript
// Log: { name, company, email, timestamp, jobUrl }
// For MVP: write to a Vercel KV store or send via email (Resend.com free tier)
// Do NOT use a third-party form service — keep data in your own infrastructure
```

### JD URL fetch function — `/api/fetch-jd.js`
```javascript
// Use Anthropic web_search tool to fetch job description from URL
// Return extracted text to client
// If fetch fails, return { error: 'blocked' } → client shows paste fallback
```

---

## Section Content Reference

### Landing / Hero
- Display name: "Jaxon Travis" (Cormorant Garamond Light, display size)
- Location eyebrow: "CARLSBAD, CALIFORNIA"
- Discipline line (color-coded): GAME DESIGNER (botanical) · AI BUILDER (gold) · ARTISAN CREATOR (ember)
- Tagline: "Building at the intersection of design, technology, and craft."
- 4 entry cards: Interview Me / Game Design / Artisan Studio / About

### AI Interview
- Eyebrow: "PROFESSIONAL"
- Heading: "Interview Me Before You Hire Me"
- Subhead: "Talk to an AI trained on my full background. Takes 5 minutes. Saves you a screening call."
- System prompt: `/src/data/background.js`

### Game Design
- Eyebrow: "GAME DESIGN"
- Heading: "Perennial: A Cultivar Anthology"
- Subhead: "A botanical engine-building card game for 2–4 players. Standalone box. 60–120 minutes."
- Pitch: "Ten growing seasons. Four biomes. Ecological accuracy in every mechanic."
- Featured cards: Stargazer Lily (T3 Flowering), Sundew (T2 Carnivorous), Honey Bee (Pollinator)
- Spinoffs: Perennial: Cultivar, Perennial: Succession, Automa Solo Mode
- CTAs: "Join the playtester list →" / "Notify me: Kickstarter →"

### Artisan Studio
- Brand name: "Bazaar Blends" (hero headline)
- Tagline: "Where Every Spice Has an Origin Story"
- Philosophy: "Authentic regional blends that put the origin culture first."
- Featured blends: Spicy Garlic / Classic Italian / Tikka Masala
- Domain: bazaarblends.com (NOT bajaarblends — double-check spelling everywhere)
- CTAs: "Follow on Instagram →" / "Notify me at launch →"

### About
- Heading: "The Through-Line"
- Bio: Process architect narrative (see background.js for full text)
- Role chips: Customer Success / Revenue Operations / Business Operations / Chief of Staff / Head of Operations
- Contact: jaxontravis7@gmail.com / linkedin.com/in/jaxontravis / Book a call (TBD)
- Location: Carlsbad, California · Remote or hybrid preferred · Open to US-wide

---

## Responsive Breakpoints

```css
/* Mobile first */
/* sm  */ @media (min-width: 640px)  { }
/* md  */ @media (min-width: 768px)  { }  /* Nav hamburger → full nav */
/* lg  */ @media (min-width: 1024px) { }  /* Multi-column layouts activate */
/* xl  */ @media (min-width: 1280px) { }
/* 2xl */ @media (min-width: 1440px) { }  /* Max design width */
```

Key responsive behaviors:
- Hero: single column on mobile, name font clamps down via `clamp()`
- Nav: hamburger at < 768px, full nav above
- Section entry cards: 2x2 grid on mobile, 4-column row on desktop
- AI Interview form: fields stack vertically on mobile
- Chat window: full width on all breakpoints
- About: photo stacks above bio on mobile, side-by-side on desktop

---

## Build Order

Follow this sequence. Do not skip ahead.

1. `npm create vite@latest . -- --template react` + install deps
2. `/src/styles/tokens.css` — all CSS custom properties from this doc
3. `/src/styles/global.css` — reset, base typography, font import
4. `Nav.jsx` — sticky, scroll-aware, color-coded dots
5. `Hero.jsx` — landing page, color-coded discipline line, entry cards
6. `/api/chat.js` — Vercel serverless function for Claude API (DO THIS BEFORE the chat UI)
7. `AIInterview.jsx` — gate form, JD inputs, chat window connected to /api/chat
8. `GameDesign.jsx` — Perennial section with card showcase
9. `ArtisanStudio.jsx` — Bazaar Blends section
10. `About.jsx` — bio, skills, contact
11. `Footer.jsx` — minimal, links only
12. Responsive pass — test all breakpoints
13. IntersectionObserver — active nav highlighting, scroll-into-view animations
14. Deploy check — `vercel --prod`, verify env vars are set

---

## Open Items (resolve before or at launch)

- [ ] Calendly / Google Calendar booking link → add to About CTA + AI Interview post-chat CTA
- [ ] Headshot photo → `/src/assets/headshot.jpg`
- [ ] Google Drive resume embed URL → resume iframe in AI Interview section
- [ ] Confirm HŪMNZ spelling with macron (ū) vs plain Humnz for UI display
- [ ] Lead capture backend → Vercel KV or Resend.com for email logging
- [ ] Instagram handle for Bazaar Blends CTA link

---

## Key Files In This Repo

- `CLAUDE.md` — this file, persistent build context
- `/src/data/background.js` — AI interview system prompt, `buildSystemPrompt()` function
- `/api/chat.js` — Claude API proxy serverless function

---

## Git Discipline — Enforced for All Sessions

This section applies to ALL THREE projects under C:\dev\. Read and follow before touching any code in any session on any project.

### Repository Map

```
C:\dev\
├── portfolio-site\     → github.com/jet750/jaxontravis-com  → jaxontravis.com
├── seedkeeper\         → github.com/jet750/seedkeeper        → seedkeeper.jaxontravis.com
└── great-pollinator\   → github.com/jet750/great-pollinator  → pollinator.jaxontravis.com
```

### Branch Structure (identical pattern on all three repos)

```
main          ← Vercel production. NEVER commit directly to this branch.
dev           ← Integration branch. Vercel preview URL. Test here before merging to main.
feature/name  ← All work branches. Always cut from dev, never from main.
fix/name      ← Bug fix branches. Same pattern.
sprint-N      ← Game sprint branches. Same pattern as feature branches.
```

### Session Start Protocol — Run This Before Any Code Changes

```powershell
# 1. Confirm which repo you are in
git remote -v

# 2. Confirm you are NOT on main
git branch

# 3. If on main or dev, cut a feature branch immediately
git checkout dev
git pull origin dev
git checkout -b feature/[descriptive-name]
```

If already on a feature or sprint branch from a previous session:
```powershell
git status
git log --oneline -5
```

Never begin writing or modifying files until branch is confirmed as non-main.

### Auto-Mode Rules

When running with --auto flag or in any autonomous session:

1. NEVER push to main automatically
2. NEVER merge branches automatically
3. Commit all work to the current feature branch only
4. At session end, print the exact commands for the user to run to push, review, and merge
5. If the session starts on main: automatically cut a feature branch before touching any file, print a warning that this happened

### Commit Message Format

```
type: short description

Types: feat / fix / refactor / data / style / chore / docs
```

Examples:
```
feat: add slime chase AI with detect and lose range
fix: HP bar not updating on EventBus damage event
data: rebalance herb satchel upgrade costs
chore: sprint 2 complete — core resource loop playable
style: align HUD timer to top-right with orange warning state
```

### Merge Protocol

```powershell
# Feature complete and tested locally:
git checkout dev
git merge feature/[name]
npm run dev        # verify dev build works

# Dev confirmed stable — promote to production:
git checkout main
git merge dev
git push origin main    # triggers Vercel production deploy

# Clean up
git branch -d feature/[name]
git push origin --delete feature/[name]
```

### Release Tags

```powershell
git checkout main
git tag -a v[N].[N]-[label] -m "description"
git push origin --tags

# Examples:
git tag -a v0.1-sprint1 -m "foundation — player moves, slimes chase, timer runs"
git tag -a v1.0-launch -m "portfolio launch build"
```

### If Found on Main With Uncommitted Changes

```powershell
git stash
git checkout -b fix/recover-from-main
git stash pop
git add .
git commit -m "fix: recover uncommitted changes from main branch"
# Then follow normal merge protocol: fix branch → dev → main
```

### Dev Server Ports (avoid conflicts)

```
portfolio-site:    localhost:5173  (Vite default)
seedkeeper:        localhost:3001
great-pollinator:  localhost:3002
```

### Vercel Deployment Behavior

- Push to `main` → production deploy → live subdomain updated immediately
- Push to `dev` or any feature branch → preview deploy → temporary URL generated
- Preview URL format: `[project]-git-[branch]-jet750.vercel.app`
- Never manually trigger production deploys — always let main push handle it

### Project-Specific Notes

**portfolio-site:** Live site — extra caution. Always run `npm run build` successfully before merging to main. API keys via Vercel env vars only, never committed.

**seedkeeper:** Sprint branches as `feature/sprint-1`, `feature/sprint-2` etc. `assets-raw\` is gitignored. `seedkeeper-prompts\` is committed.

**great-pollinator:** Phase branches as `feature/phase-4`, `feature/phase-5` etc. Continue numbering from Phase 3 (last completed build before migration).

---

*Last updated: June 2026*
*Design system source: Figma file `9qMSC80qBTV8Ll236Lxlcn`*
