// imageImports.js — AUTO-GENERATED from assetManifest.json (scripts/gen_image_imports.cjs).
// Do not hand-edit: re-run `node scripts/gen_image_imports.cjs` after changing the
// manifest's images/spritesheets.
//
// Explicit `?url` imports for every manifest image so Vite STATICALLY emits each
// file. BootScene's eager import.meta.glob silently drops most of /assets/images in
// the production build (MEMORY: vite-glob-asset-emission) — e.g. the per-plant crop
// sprites never emitted, so plants rendered as fallback dots in prod. Importing each
// with `?url` is deterministic (Vite emits a file, or inlines a data URI under
// assetsInlineLimit), so every key resolves. Keyed by the manifest `key`.
// Pattern mirrors src/world/tilesetImages.js.

import img0 from '../../assets/images/character/player_sheet.png?url';
import img1 from '../../assets/images/enemies/slime_sheet.png?url';
import img2 from '../../assets/images/props_decor.png?url';
import img3 from '../../assets/images/chests/obj_chest.png?url';
import img4 from '../../assets/images/ui/ui_slot_frame.png?url';
import img5 from '../../assets/images/effects/fx_dust.png?url';
import img6 from '../../assets/images/furniture/furniture_sheet.png?url';
import img7 from '../../assets/images/structures/fence_gate.png?url';
import img8 from '../../assets/images/ground/Grass_tiles_v2.png?url';
import img9 from '../../assets/images/ground/Darker_Grass_Tiles_v2.png?url';
import img10 from '../../assets/images/ground/Soil_Ground_Tiles.png?url';
import img11 from '../../assets/images/ground/Water.png?url';
import img12 from '../../assets/images/nature/mushrooms_flowers_stones.png?url';
import img13 from '../../assets/images/structures/Fences.png?url';
import img14 from '../../assets/images/Fence gates animation sprites .png?url';
import img15 from '../../assets/images/structures/signs.png?url';
import img16 from '../../assets/images/enemies/skeleton_run.png?url';
import img17 from '../../assets/images/enemies/skeleton_idle.png?url';
import img18 from '../../assets/images/enemies/skeleton_death.png?url';
import img19 from '../../assets/images/ui/ui_weather_icons_small.png?url';
import img20 from '../../assets/images/ui/ui_buttons_square.png?url';
import img21 from '../../assets/images/plants/corn.png?url';
import img22 from '../../assets/images/plants/carrots.png?url';
import img23 from '../../assets/images/plants/cauliflower.png?url';
import img24 from '../../assets/images/plants/red_berry.png?url';
import img25 from '../../assets/images/plants/eggplant.png?url';
import img26 from '../../assets/images/plants/blue_flower.png?url';
import img27 from '../../assets/images/plants/cabbage.png?url';
import img28 from '../../assets/images/plants/wheat.png?url';
import img29 from '../../assets/images/plants/pumpkin.png?url';
import img30 from '../../assets/images/plants/parsnip.png?url';
import img31 from '../../assets/images/plants/red_lettuce.png?url';
import img32 from '../../assets/images/plants/purple_beets.png?url';
import img33 from '../../assets/images/plants/cucumber.png?url';
import img34 from '../../assets/images/plants/sunflower.png?url';
import img35 from '../../assets/images/plants/sweet_potatoes.png?url';
import img36 from '../../assets/images/plants/white_carrots.png?url';
import img37 from '../../assets/images/plants/watermelon.png?url';
import img38 from '../../assets/images/plants/purple_carrot.png?url';
import img39 from '../../assets/images/plants/blue_melon.png?url';
import img40 from '../../assets/images/plants/beanstalk.png?url';
import img41 from '../../assets/images/plants/pineapple.png?url';
import img42 from '../../assets/images/plants/green_melon.png?url';
import img43 from '../../assets/images/plants/horseradish.png?url';
import img44 from '../../assets/images/plants/tomato.png?url';
import img45 from '../../assets/images/plants/purple_cauliflower.png?url';
import img46 from '../../assets/images/plants/blue_carrot.png?url';
import img47 from '../../assets/images/plants/bok_choy.png?url';
import img48 from '../../assets/images/nature/trees_stumps_bushes.png?url';
import img49 from '../../assets/images/tileset_garden.png?url';
import img50 from '../../assets/images/structures/water_well.png?url';
import img51 from '../../assets/images/ui/ui_dialog_big.png?url';
import img52 from '../../assets/images/structures/work_station.png?url';

// Manifest key → emitted URL.
const IMAGE_URLS = {
  "player_sheet": img0,
  "slime_sheet": img1,
  "props_decor": img2,
  "obj_chest": img3,
  "ui_slot_frame": img4,
  "fx_dust": img5,
  "furniture_sheet": img6,
  "fence_gate": img7,
  "grass_tiles": img8,
  "dark_grass_tiles": img9,
  "soil_tiles": img10,
  "water_tiles": img11,
  "mushrooms_flowers": img12,
  "fences": img13,
  "fence_gates": img14,
  "signs": img15,
  "skeleton_run": img16,
  "skeleton_idle": img17,
  "skeleton_death": img18,
  "weather_icons": img19,
  "ui_btn_square": img20,
  "corn": img21,
  "carrots": img22,
  "cauliflower": img23,
  "red_berry": img24,
  "eggplant": img25,
  "blue_flower": img26,
  "cabbage": img27,
  "wheat": img28,
  "pumpkin": img29,
  "parsnip": img30,
  "red_lettuce": img31,
  "purple_beets": img32,
  "cucumber": img33,
  "sunflower": img34,
  "sweet_potatoes": img35,
  "white_carrots": img36,
  "watermelon": img37,
  "purple_carrot": img38,
  "blue_melon": img39,
  "beanstalk": img40,
  "pineapple": img41,
  "green_melon": img42,
  "horseradish": img43,
  "tomato": img44,
  "purple_cauliflower": img45,
  "blue_carrot": img46,
  "bok_choy": img47,
  "trees": img48,
  "tileset_garden": img49,
  "obj_well": img50,
  "ui_dialog_big": img51,
  "work_station": img52
};

export default IMAGE_URLS;
