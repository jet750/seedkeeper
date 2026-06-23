#!/usr/bin/env node
/*
 * bake_world.cjs — turn the Tiled export into a Phaser-loadable world map.
 *
 * Tiled exports world_v1_massive.tmj with EXTERNAL tileset references
 * ({ firstgid, source: "x.tsx" }). Phaser's tilemapTiledJSON parser cannot read
 * external .tsx tilesets — it logs "External tilesets unsupported" and renders
 * every tile as a blank/red tile (the historical "red tiles" breakage). This
 * script inlines each .tsx (image, dimensions, tilecount, columns) into the JSON
 * so Phaser parses it as a normal embedded tileset.
 *
 * It also drops the heavy `nature_dynamic` object layer (4.3 MB of wild-plant
 * grow-cycle metadata) — that system is out of scope for the static world import
 * (Sprint 9); the prop tile layers already carry each element's frame-0 sprite,
 * so the world still renders fully. The lightweight `markers` object layer
 * (garden beds, well, work station, gates, player_start) is kept for placement.
 *
 * Input : assets/tilemaps/world_v1_massive.tmj   (Tiled JSON export)
 * Output: assets/tilemaps/world_v1.json          (minified, Phaser-ready)
 *
 * Re-run after re-exporting the map from Tiled:  node scripts/bake_world.cjs
 */
const fs = require('fs');
const path = require('path');

const TILEMAP_DIR = path.join(__dirname, '..', 'assets', 'tilemaps');
const SRC = path.join(TILEMAP_DIR, 'world_v1_massive.tmj');
const OUT = path.join(TILEMAP_DIR, 'world_v1.json');

function attr(xml, re) {
  const m = xml.match(re);
  return m ? m[1] : null;
}

// Parse a Tiled .tsx external tileset into the fields Phaser needs embedded.
function parseTsx(tsxPath) {
  const xml = fs.readFileSync(tsxPath, 'utf8');
  const imgSrc = attr(xml, /<image[^>]*\ssource="([^"]+)"/);
  return {
    name: attr(xml, /<tileset[^>]*\sname="([^"]+)"/),
    tilewidth: parseInt(attr(xml, /\stilewidth="(\d+)"/), 10),
    tileheight: parseInt(attr(xml, /\stileheight="(\d+)"/), 10),
    tilecount: parseInt(attr(xml, /\stilecount="(\d+)"/), 10),
    columns: parseInt(attr(xml, /\scolumns="(\d+)"/), 10),
    margin: parseInt(attr(xml, /<tileset[^>]*\smargin="(\d+)"/) || '0', 10),
    spacing: parseInt(attr(xml, /<tileset[^>]*\sspacing="(\d+)"/) || '0', 10),
    image: imgSrc ? path.basename(imgSrc) : null,
    imagewidth: parseInt(attr(xml, /<image[^>]*\swidth="(\d+)"/), 10),
    imageheight: parseInt(attr(xml, /<image[^>]*\sheight="(\d+)"/), 10)
  };
}

function main() {
  const map = JSON.parse(fs.readFileSync(SRC, 'utf8'));

  // 1. Embed every external tileset.
  map.tilesets = map.tilesets.map((ts) => {
    if (!ts.source) return ts; // already embedded
    const tsx = parseTsx(path.join(TILEMAP_DIR, ts.source));
    if (!tsx.image || !tsx.imagewidth) {
      throw new Error(`Tileset ${ts.source} did not resolve an image — would render as red tiles`);
    }
    return { firstgid: ts.firstgid, ...tsx };
  });

  // 2. Drop the out-of-scope dynamic-nature object layer; keep everything else.
  map.layers = map.layers.filter((l) => l.name !== 'nature_dynamic');

  fs.writeFileSync(OUT, JSON.stringify(map));

  const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
  console.log(`Baked ${OUT}`);
  console.log(`  tilesets embedded: ${map.tilesets.length}`);
  console.log(`  layers kept:       ${map.layers.map((l) => l.name).join(', ')}`);
  console.log(`  output size:       ${mb} MB`);
}

main();
