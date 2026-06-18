# Full Project Migration & Git Reconciliation
## Portfolio Site + Great Pollinator + Seedkeeper

This is a surgical file migration and git setup session. You are separating three projects that are currently tangled in one git repository and moving everything to a clean folder structure at C:\dev\.

**DO NOT modify any game logic, portfolio site components, API routes, or styling.**
**DO NOT push anything to main on any repo without explicit instruction.**
**DO NOT delete any files from the source location — copy only. The user will clean up manually.**
**If any step produces an unexpected error, STOP, print the full error, and wait for instruction.**

Work through all sections in order. Print a status report after completing each section before moving to the next.

---

## CURRENT STATE SUMMARY

Everything currently lives in one git repo at:
```
C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code\
```
Remote: https://github.com/jet750/jaxontravis-com

The following game files are tangled inside the portfolio repo and need extraction:

**Great Pollinator game files (move to C:\dev\great-pollinator\):**
- `src/pages/games/pollinator/` — entire subfolder (game page/engine code)
- `src/assets/game/` — entire folder EXCEPT the `seedkeeper/` subfolder
- `src/components/GameDesign.jsx` — game component (not a portfolio component)
- `src/components/GameDesign.module.css` — paired stylesheet
- `great-pollinator-game-prompt.md` — at Backend Code root
- `great-pollinator-phase2-prompt.md` — at Backend Code root
- `great-pollinator-phase3-prompt.md` — at Backend Code root

**Seedkeeper files (move to C:\dev\seedkeeper\):**
- `src/assets/game/seedkeeper/` — game assets subfolder
- `seedkeeper-prompts/` — entire folder at Backend Code root

**Files that stay in portfolio repo (DO NOT TOUCH):**
- Everything in `src/components/` EXCEPT GameDesign.jsx and GameDesign.module.css
- Everything in `src/pages/` EXCEPT the `games/` subfolder
- Everything in `src/assets/` EXCEPT the entire `game/` folder
- Everything in `api/`
- `src/App.jsx`, `src/App.css`, `src/main.jsx`, `src/index.css`
- `package.json`, `vite.config.js`, `vercel.json`, `index.html`
- `.gitignore`, `CLAUDE.md`, `README.md`
- `node_modules/`, `dist/` (not committed anyway)

---

## SECTION 1 — ENVIRONMENT AND PRE-FLIGHT CHECK

```powershell
# Confirm tools available
git --version
node --version
npm --version

# Confirm source location exists and is a git repo
cd "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code"
git status
git remote -v
git branch

# List what currently exists at C:\dev\ (may not exist yet)
ls C:\dev\ 2>$null || echo "C:\dev\ does not exist yet"
```

Report all output. Confirm git is clean (no uncommitted changes) on the portfolio repo before proceeding. If there are uncommitted changes, list them and STOP — do not proceed until the user commits or stashes them.

---

## SECTION 2 — CREATE TARGET FOLDER STRUCTURE

```powershell
# Create the C:\dev\ root and all three project folders
New-Item -ItemType Directory -Force -Path "C:\dev"
New-Item -ItemType Directory -Force -Path "C:\dev\portfolio-site"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets\images"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets\audio"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets\tilemaps"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\seedkeeper-prompts"
New-Item -ItemType Directory -Force -Path "C:\dev\great-pollinator"
New-Item -ItemType Directory -Force -Path "C:\dev\great-pollinator\src"
New-Item -ItemType Directory -Force -Path "C:\dev\great-pollinator\assets"
New-Item -ItemType Directory -Force -Path "C:\dev\great-pollinator\assets\images"
New-Item -ItemType Directory -Force -Path "C:\dev\great-pollinator\assets\audio"
New-Item -ItemType Directory -Force -Path "C:\dev\great-pollinator\assets\tilemaps"
```

Confirm all folders created. Report structure.

---

## SECTION 3 — MIGRATE PORTFOLIO SITE

The portfolio site git repo moves wholesale. We copy the entire Backend Code folder to C:\dev\portfolio-site\ preserving the .git history, then clean out the game files from the copy.

### 3A — Copy Entire Repo to New Location

```powershell
$source = "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code"
$dest = "C:\dev\portfolio-site"

# Copy everything including hidden folders (.git, .claude)
Copy-Item -Path "$source\*" -Destination $dest -Recurse -Force
```

Confirm copy completed. Count files at source vs destination to verify.

### 3B — Remove Game Files from Portfolio Copy

Now surgically remove the game files from `C:\dev\portfolio-site\` only. The originals at the source location are untouched.

```powershell
$portfolioRoot = "C:\dev\portfolio-site"

# Remove Great Pollinator game files
Remove-Item -Path "$portfolioRoot\src\pages\games" -Recurse -Force
Remove-Item -Path "$portfolioRoot\src\assets\game" -Recurse -Force
Remove-Item -Path "$portfolioRoot\src\components\GameDesign.jsx" -Force
Remove-Item -Path "$portfolioRoot\src\components\GameDesign.module.css" -Force
Remove-Item -Path "$portfolioRoot\great-pollinator-game-prompt.md" -Force
Remove-Item -Path "$portfolioRoot\great-pollinator-phase2-prompt.md" -Force
Remove-Item -Path "$portfolioRoot\great-pollinator-phase3-prompt.md" -Force

# Remove Seedkeeper files
Remove-Item -Path "$portfolioRoot\seedkeeper-prompts" -Recurse -Force
```

After removal, verify these paths NO LONGER EXIST in portfolio-site:
- `C:\dev\portfolio-site\src\pages\games\`
- `C:\dev\portfolio-site\src\assets\game\`
- `C:\dev\portfolio-site\src\components\GameDesign.jsx`
- `C:\dev\portfolio-site\seedkeeper-prompts\`

And verify these paths STILL EXIST in portfolio-site:
- `C:\dev\portfolio-site\src\components\AIInterview.jsx`
- `C:\dev\portfolio-site\src\components\Nav.jsx`
- `C:\dev\portfolio-site\api\chat.js`
- `C:\dev\portfolio-site\vercel.json`

### 3C — Check for Broken Imports in Portfolio Site

The removal of GameDesign.jsx may leave broken import references in other files. Check:

```powershell
# Search for any remaining references to GameDesign or game routes in portfolio src
Select-String -Path "C:\dev\portfolio-site\src\*" -Pattern "GameDesign|games/pollinator|great-pollinator" -Recurse
```

If any matches found: list the file paths and the matching lines. DO NOT edit them yet — report them and continue. These will need manual fixes after migration.

Also check App.jsx for any route pointing to the games page:
```powershell
Get-Content "C:\dev\portfolio-site\src\App.jsx"
```

Print the full content. If there is a route like `/game` or `/games` or an import of GameDesign, note it — the user will need to decide whether to remove that route or replace it with a placeholder.

### 3D — Commit Cleaned Portfolio Repo

```powershell
cd "C:\dev\portfolio-site"
git status
```

Print the git status — it should show the deleted game files as changes to be committed.

```powershell
git add -A
git status
```

Print the staged changes list. Then commit:

```powershell
git commit -m "chore: extract game projects to separate repos — remove pollinator and seedkeeper files"
```

DO NOT push yet. Print the commit hash and confirm.

### 3E — Create Dev Branch on Portfolio Repo

```powershell
cd "C:\dev\portfolio-site"
git checkout -b dev
git branch
```

Confirm both `main` and `dev` branches exist. Stay on `dev`.

---

## SECTION 4 — MIGRATE GREAT POLLINATOR

### 4A — Copy Game Files to New Repo

```powershell
$source = "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code"
$dest = "C:\dev\great-pollinator"

# Copy game source code
Copy-Item -Path "$source\src\pages\games\pollinator\*" -Destination "$dest\src\" -Recurse -Force

# Copy game assets (everything except seedkeeper subfolder)
$gameAssets = "$source\src\assets\game"
Get-ChildItem -Path $gameAssets | Where-Object { $_.Name -ne "seedkeeper" } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "$dest\assets\" -Recurse -Force
}

# Copy GameDesign component (the main game component)
Copy-Item -Path "$source\src\components\GameDesign.jsx" -Destination "$dest\src\" -Force
Copy-Item -Path "$source\src\components\GameDesign.module.css" -Destination "$dest\src\" -Force

# Copy prompt files for reference
Copy-Item -Path "$source\great-pollinator-game-prompt.md" -Destination "$dest\" -Force
Copy-Item -Path "$source\great-pollinator-phase2-prompt.md" -Destination "$dest\" -Force
Copy-Item -Path "$source\great-pollinator-phase3-prompt.md" -Destination "$dest\" -Force
```

Confirm all files copied. List the contents of `C:\dev\great-pollinator\` after copy.

### 4B — Create Required Project Files

**Check if these exist, create only if missing:**

**package.json** — if missing:
```json
{
  "name": "great-pollinator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.60.0"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

**vite.config.js** — if missing:
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    port: 3002
  }
});
```

**index.html** — if missing, create minimal entry point:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Great Pollinator</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a1a0a; display: flex; justify-content: center; align-items: center; height: 100vh; }
    #game-container { width: 100%; max-width: 1600px; aspect-ratio: 16/9; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**.gitignore:**
```
node_modules/
dist/
.env
.env.local
.DS_Store
Thumbs.db
*.log
assets-raw/
```

**CREDITS.md** — create if missing:
```markdown
# Great Pollinator — Asset Credits

## Art
[Add asset credits here as assets are confirmed]

## Frameworks
Phaser 3 — https://phaser.io — MIT License
Vite — https://vitejs.dev — MIT License

## Development
Built by Jaxon Travis
AI-assisted development using Claude (Anthropic)
All design decisions and creative direction by the developer
```

### 4C — Assess Existing Game Entry Point

```powershell
ls "C:\dev\great-pollinator\src"
```

Print the full listing. Identify whether a `main.js` or equivalent Phaser entry point exists from the Phase 3 build. If the game code uses a different entry point filename, note it — do not rename files.

### 4D — Attempt Build

```powershell
cd "C:\dev\great-pollinator"
npm install
npm run build
```

If build succeeds: confirm and move on.
If build fails: print the exact error. DO NOT attempt to fix game code. Note the error in the final report and continue to the next section — a failed build does not block git setup.

### 4E — Initialize Git Repo

```powershell
cd "C:\dev\great-pollinator"
git init
git add .
git status
```

Print the staged file list. Then:

```powershell
git commit -m "chore: initial extraction from portfolio repo — great pollinator phase 3 build"
git branch -M main
git remote add origin https://github.com/jet750/great-pollinator.git
```

DO NOT push yet. Confirm commit created successfully.

### 4F — Create Branch Structure

```powershell
cd "C:\dev\great-pollinator"
git checkout -b dev
git branch
```

Confirm both `main` and `dev` branches exist. Stay on `dev`.

---

## SECTION 5 — MIGRATE SEEDKEEPER

### 5A — Copy Seedkeeper Assets

```powershell
$source = "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code"
$dest = "C:\dev\seedkeeper"

# Copy seedkeeper game assets from the tangled portfolio assets folder
Copy-Item -Path "$source\src\assets\game\seedkeeper\*" -Destination "$dest\assets\" -Recurse -Force

# Copy seedkeeper prompts folder
Copy-Item -Path "$source\seedkeeper-prompts\*" -Destination "$dest\seedkeeper-prompts\" -Recurse -Force
```

### 5B — Check for Existing Assets-Raw

```powershell
ls "C:\dev\seedkeeper\" 2>$null
ls "C:\dev\seedkeeper\assets-raw\" 2>$null || echo "assets-raw not present at C:\dev\seedkeeper\"
```

If `assets-raw\` already exists at `C:\dev\seedkeeper\assets-raw\` from the earlier asset organizer session, leave it completely untouched.

If it does NOT exist, check the source location:
```powershell
ls "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code\assets-raw\" 2>$null || echo "assets-raw not in Backend Code either"
```

Report what you find but do not move the assets-raw folder — it is large and excluded from git via .gitignore anyway. Note its location in the final report.

### 5C — Create Required Project Files

Same as Section 4B but for Seedkeeper. Check and create if missing:

**package.json:**
```json
{
  "name": "seedkeeper",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.60.0"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

**vite.config.js:**
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    port: 3001
  }
});
```

**index.html** — minimal placeholder, title "Seedkeeper"

**.gitignore** — same as Great Pollinator

**src/main.js** — if missing:
```javascript
// Seedkeeper — awaiting Sprint 1
// Run seedkeeper-prompts/seedkeeper-prompt-1.md in Claude Code to begin
console.log('Seedkeeper initialized. Ready for Sprint 1.');
```

**CREDITS.md** — if the seedkeeper-prompts folder contains a CREDITS.md already, leave it. Otherwise create from the template in seedkeeper-prompts/seedkeeper-asset-setup.md if that file exists.

### 5D — Initialize Git Repo

```powershell
cd "C:\dev\seedkeeper"
git init
git add .
git status
```

Print staged files. Then:

```powershell
git commit -m "chore: initial scaffold — assets migrated, awaiting sprint 1 build"
git branch -M main
git remote add origin https://github.com/jet750/seedkeeper.git
```

DO NOT push yet.

### 5E — Create Branch Structure

```powershell
cd "C:\dev\seedkeeper"
git checkout -b dev
git branch
```

---

## SECTION 6 — MIGRATE CLAUDE.MD AND WORKSPACE FILE

The CLAUDE.md should live at `C:\dev\` — above all three repos — so it applies as a workspace-level instruction file when `C:\dev\` is opened in VS Code.

```powershell
$claudeMdSource = "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\Backend Code\CLAUDE.md"

# Copy to C:\dev\ root
Copy-Item -Path $claudeMdSource -Destination "C:\dev\CLAUDE.md" -Force
```

Check if a VS Code workspace file (.code-workspace) exists anywhere in the source location:

```powershell
Get-ChildItem -Path "C:\Users\Jaxon Travis\Documents\1 Personal\Jaxon Travis Portfolio Website setup\" -Filter "*.code-workspace" -Recurse 2>$null
```

If found: print the path and contents. Do not move it yet — report it for the user to review.

If NOT found: create a new workspace file at `C:\dev\seedkeeper.code-workspace`:

```json
{
  "folders": [
    { "name": "Portfolio Site", "path": "./portfolio-site" },
    { "name": "Seedkeeper",     "path": "./seedkeeper" },
    { "name": "Great Pollinator","path": "./great-pollinator" }
  ],
  "settings": {
    "files.exclude": {
      "**/node_modules": true,
      "**/dist": true
    }
  }
}
```

This workspace file lets you open all three projects simultaneously in VS Code from one window while keeping their git histories separate.

---

## SECTION 7 — PUSH ALL REPOS

Now push all three repos to GitHub. Do these one at a time.

### 7A — Push Portfolio Site

```powershell
cd "C:\dev\portfolio-site"
git checkout main
git push origin main
git checkout dev
git push -u origin dev
```

If push fails with authentication error: print "GitHub auth required — run: gh auth login" and stop this step. Move to 7B and return to 7A after auth is resolved.

### 7B — Push Great Pollinator

```powershell
cd "C:\dev\great-pollinator"
git checkout main
git push -u origin main
git checkout dev
git push -u origin dev
```

### 7C — Push Seedkeeper

```powershell
cd "C:\dev\seedkeeper"
git checkout main
git push -u origin main
git checkout dev
git push -u origin dev
```

---

## SECTION 8 — VERIFY PORTFOLIO SITE STILL WORKS

This is critical — the live site must not be broken by the extraction.

```powershell
cd "C:\dev\portfolio-site"
npm install
npm run build
```

If build succeeds: the portfolio site is intact and will deploy cleanly from the new location.

If build fails: print the FULL error output. The most likely cause is a broken import in App.jsx referencing the removed GameDesign component or games route. Print the contents of App.jsx:

```powershell
Get-Content "C:\dev\portfolio-site\src\App.jsx"
```

If App.jsx imports GameDesign or has a route to `/game` or `/games`, those need to be removed. Show the user the exact lines and ask for confirmation before removing them. Do not edit App.jsx without explicit confirmation.

---

## SECTION 9 — FINAL REPORT

Print this complete summary:

```
MIGRATION COMPLETE
══════════════════════════════════════════════════════════════

FOLDER STRUCTURE:
  C:\dev\
  ├── CLAUDE.md                    [migrated ✓ / MISSING ✗]
  ├── [workspace].code-workspace   [created ✓ / MISSING ✗]
  ├── portfolio-site\              git: jet750/jaxontravis-com
  ├── seedkeeper\                  git: jet750/seedkeeper
  └── great-pollinator\            git: jet750/great-pollinator

GIT STATUS:
  portfolio-site:    main [pushed ✓ / pending] | dev [pushed ✓ / pending]
  seedkeeper:        main [pushed ✓ / pending] | dev [pushed ✓ / pending]
  great-pollinator:  main [pushed ✓ / pending] | dev [pushed ✓ / pending]

BUILD STATUS:
  portfolio-site:    [OK ✓ / FAILED — reason]
  great-pollinator:  [OK ✓ / FAILED — reason]
  seedkeeper:        [OK ✓ / FAILED — reason]

BROKEN IMPORTS IN PORTFOLIO SITE:
  [list any files with remaining references to GameDesign or game routes]
  [or: "None found — portfolio site imports are clean"]

ASSETS-RAW LOCATION:
  [report where assets-raw currently lives]

ITEMS REQUIRING MANUAL CLEANUP BY USER:
  1. Original files still at C:\Users\Jaxon Travis\Documents\... — safe to delete
     after verifying everything works from C:\dev\
  2. [Any other items needing user attention]

VERCEL — NEXT STEPS:
  portfolio-site deploys automatically from jet750/jaxontravis-com (already connected)
  great-pollinator will deploy on next push to main (connect jet750/great-pollinator
     in Vercel dashboard if not yet connected)
  seedkeeper will deploy on next push to main (connect jet750/seedkeeper
     in Vercel dashboard if not yet connected)

BROKEN IMPORTS TO FIX BEFORE PORTFOLIO SITE GOES LIVE:
  [list exact files and line numbers if any found in Section 3C or 8]

NEXT SPRINT COMMANDS:

  Seedkeeper Sprint 1:
    cd C:\dev\seedkeeper
    git checkout dev
    git checkout -b feature/sprint-1
    [run seedkeeper-prompts/seedkeeper-prompt-1.md in Claude Code]

  Great Pollinator next phase:
    cd C:\dev\great-pollinator
    git checkout dev
    git checkout -b feature/phase-4
    [continue game development]

  Portfolio site fixes (if broken imports found):
    cd C:\dev\portfolio-site
    git checkout dev
    git checkout -b fix/remove-game-imports
    [fix App.jsx imports, commit, merge to dev, test, merge to main]
```
