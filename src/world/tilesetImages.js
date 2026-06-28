// tilesetImages.js — explicit asset imports for the Tiled world (Sprint 9).
//
// The world_v1 map references 17 tileset images. They CANNOT be loaded through
// BootScene's import.meta.glob pipeline: that eager glob silently drops a subset
// of /assets/images in the production build (see MEMORY: vite-glob-asset-emission;
// e.g. mushrooms_flowers_stones.png, 6 KB, never emits). A dropped tileset image
// renders its tiles blank — the "red tiles" breakage.
//
// Importing each image with an explicit `?url` query is deterministic: Vite always
// resolves it (emitting a file, or inlining a data URI when < assetsInlineLimit),
// so every tileset is guaranteed present in the bundle. Keyed by the Tiled tileset
// `name` so GameScene can match map.tilesets[i].name → texture key.

import garden_tiles from '../../assets/images/ground/Grass_tiles_v2.png?url';
import forest_tiles from '../../assets/images/ground/Darker_Grass_Tiles_v2.png?url';
import garden_soil from '../../assets/images/ground/Soil_Ground_Tiles.png?url';
import forest_soil from '../../assets/images/ground/Darker_Soil_Ground_Tiles.png?url';
import stone_tiles from '../../assets/images/ground/Stone_Ground_Tiles.png?url';
import sprout_land_water from '../../assets/images/ground/Water.png?url';
import stone_path from '../../assets/images/paths/Stone_Path.png?url';
import wooden_path from '../../assets/images/paths/Paths.png?url';
import bridges from '../../assets/images/paths/Wooden_Bridge_v2.png?url';
import trees_shrubs from '../../assets/images/nature/trees_stumps_bushes.png?url';
import mushroom_flower_stone from '../../assets/images/nature/mushrooms_flowers_stones.png?url';
import water_props from '../../assets/images/nature/Water Objects.png?url';
import fences from '../../assets/images/structures/Fences.png?url';
import fence_gate from '../../assets/images/structures/fence_gate.png?url';
import water_well from '../../assets/images/structures/water_well.png?url';
import work_station from '../../assets/images/structures/work_station.png?url';
import signs from '../../assets/images/structures/signs.png?url';

// Keyed by the exact Tiled tileset `name` (the .tsx <tileset name="...">).
const TILESET_IMAGES = {
  'garden tiles': garden_tiles,
  'forest tiles': forest_tiles,
  'garden soil': garden_soil,
  'forest soil': forest_soil,
  'stone tiles': stone_tiles,
  'sprout land water': sprout_land_water,
  'stone path': stone_path,
  'wooden path': wooden_path,
  bridges,
  'trees shrubs': trees_shrubs,
  'mushroom flower stone': mushroom_flower_stone,
  'water props': water_props,
  fences,
  'fence gate': fence_gate,
  'water well': water_well,
  'work station': work_station,
  signs
};

// Texture key for a Tiled tileset name. Used by BootScene (to load) and GameScene
// (to addTilesetImage) so the two never drift.
export function tilesetKey(name) {
  return 'ts_' + name.replace(/\s+/g, '_');
}

export default TILESET_IMAGES;
