#!/usr/bin/env node
/*
 * gen_image_imports.cjs — generate src/data/imageImports.js from assetManifest.json.
 *
 * BootScene's eager import.meta.glob silently drops most of /assets/images in the
 * production build (see MEMORY: vite-glob-asset-emission) — the per-plant crop
 * sprites never emitted, so plants rendered as fallback dots in prod. This script
 * emits one explicit `?url` import per manifest image (the deterministic pattern
 * from src/world/tilesetImages.js) and a key→url map BootScene consumes.
 *
 * Re-run after adding/removing manifest images:  node scripts/gen_image_imports.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'assetManifest.json'), 'utf8'));
const OUT = path.join(ROOT, 'src', 'data', 'imageImports.js');

// All image-bearing manifest entries (audio stays on the glob; it emits fine).
const entries = [...manifest.spritesheets, ...manifest.images];

// Dedupe by path → one import var; verify each file exists on disk.
const pathToVar = new Map();
const importLines = [];
let n = 0;
for (const e of entries) {
  if (pathToVar.has(e.path)) continue;
  if (!fs.existsSync(path.join(ROOT, e.path))) {
    throw new Error('manifest image missing on disk: ' + e.path);
  }
  const v = 'img' + n++;
  pathToVar.set(e.path, v);
  // Path is relative to src/data/. Spaces in the literal are resolved by Vite.
  importLines.push(`import ${v} from '../../${e.path}?url';`);
}

const mapLines = entries.map((e) => `  ${JSON.stringify(e.key)}: ${pathToVar.get(e.path)}`);

const body = `// imageImports.js — AUTO-GENERATED from assetManifest.json (scripts/gen_image_imports.cjs).
// Do not hand-edit: re-run \`node scripts/gen_image_imports.cjs\` after changing the
// manifest's images/spritesheets.
//
// Explicit \`?url\` imports for every manifest image so Vite STATICALLY emits each
// file. BootScene's eager import.meta.glob silently drops most of /assets/images in
// the production build (MEMORY: vite-glob-asset-emission) — e.g. the per-plant crop
// sprites never emitted, so plants rendered as fallback dots in prod. Importing each
// with \`?url\` is deterministic (Vite emits a file, or inlines a data URI under
// assetsInlineLimit), so every key resolves. Keyed by the manifest \`key\`.
// Pattern mirrors src/world/tilesetImages.js.

${importLines.join('\n')}

// Manifest key → emitted URL.
const IMAGE_URLS = {
${mapLines.join(',\n')}
};

export default IMAGE_URLS;
`;

fs.writeFileSync(OUT, body);
console.log(`Wrote ${path.relative(ROOT, OUT)} — ${pathToVar.size} unique imports, ${entries.length} keys.`);
