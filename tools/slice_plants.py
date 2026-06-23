"""
slice_plants.py — Seedkeeper farming asset extractor
Exports all 30 plants from farming_plants_v2.png as individual PNG strips.
Tall plants export as 16x32 (overflow row above + primary row combined).
Standard plants export as 16x16 with 7 frames.

Usage:
    cd C:\dev\seedkeeper
    python tools/slice_plants.py
"""

from PIL import Image
import os, json

SOURCE  = "assets/images/farming_plants_v2.png"
OUT_DIR = "assets/images/plants"
TILE_W  = 16
TILE_H  = 16

# (name, is_primary, is_tall)
# is_primary=False = overflow row, skip as standalone export
# is_tall=True on primary = export 16x32 combining overflow+primary
ROW_MAP = [
    ("corn",               False, True),   # 0  overflow (mature stages)
    ("corn",               True,  True),   # 1  primary
    ("carrots",            True,  False),  # 2
    ("cauliflower",        True,  False),  # 3
    ("red_berry",          True,  False),  # 4
    ("eggplant",           True,  False),  # 5
    ("blue_flower",        True,  False),  # 6
    ("cabbage",            True,  False),  # 7
    ("wheat",              True,  False),  # 8
    ("pumpkin",            True,  False),  # 9
    ("parsnip",            True,  False),  # 10
    ("red_lettuce",        True,  False),  # 11
    ("purple_beets",       True,  False),  # 12
    ("blue_flower_2",      True,  False),  # 13
    ("cucumber",           True,  False),  # 14
    ("sunflower",          False, True),   # 15 overflow
    ("sunflower",          True,  True),   # 16 primary
    ("sweet_potatoes",     True,  False),  # 17
    ("white_carrots",      True,  False),  # 18
    ("watermelon",         True,  False),  # 19
    ("purple_carrot",      True,  False),  # 20
    ("blue_melon",         True,  False),  # 21
    ("beanstalk",          False, True),   # 22 overflow
    ("beanstalk",          True,  True),   # 23 primary
    ("pineapple",          False, True),   # 24 overflow
    ("pineapple",          True,  True),   # 25 primary
    ("green_melon",        True,  False),  # 26
    ("horseradish",        True,  False),  # 27
    ("tomato",             False, True),   # 28 overflow
    ("tomato",             True,  True),   # 29 primary
    ("purple_cauliflower", True,  False),  # 30
    ("blue_carrot",        True,  False),  # 31
    ("bok_choy",           True,  False),  # 32
]

def main():
    img = Image.open(SOURCE)
    w, h = img.size
    cols = w // TILE_W

    print(f"\nSheet: {SOURCE}  ({w}x{h}px — {cols} frames per plant)")
    print(f"Exporting to: {OUT_DIR}/\n")

    os.makedirs(OUT_DIR, exist_ok=True)

    manifest = []
    plants   = {}

    for row, (name, is_primary, is_tall) in enumerate(ROW_MAP):
        if not is_primary:
            print(f"  row {row:02d}  [overflow: {name}]")
            continue

        if is_tall:
            # combine overflow row above + this primary row = 16x32
            strip = img.crop((0, (row - 1) * TILE_H, w, (row + 1) * TILE_H))
            fh    = TILE_H * 2
        else:
            strip = img.crop((0, row * TILE_H, w, (row + 1) * TILE_H))
            fh    = TILE_H

        out_path = os.path.join(OUT_DIR, f"{name}.png")
        strip.save(out_path)
        print(f"  row {row:02d}  {name}.png  ({w}x{fh}px)")

        manifest.append({
            "key":         name,
            "path":        f"assets/images/plants/{name}.png",
            "frameWidth":  TILE_W,
            "frameHeight": fh
        })

        plants[name] = {
            "name":       name.replace("_", " ").title(),
            "color":      "#FFFFFF",
            "growDays":   1,
            "statTree":   None,
            "sellValue":  3,
            "frameCount": cols,
            "isTall":     is_tall,
            "_note":      "verify color + growDays + statTree before wiring"
        }

    with open(os.path.join(OUT_DIR, "_manifest_entries.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    with open(os.path.join(OUT_DIR, "_plants_stubs.json"), "w") as f:
        json.dump(plants, f, indent=2)

    print(f"\nExported {len(manifest)} plants to {OUT_DIR}/")
    print(f"Manifest → {OUT_DIR}/_manifest_entries.json")
    print(f"Plants   → {OUT_DIR}/_plants_stubs.json\n")

if __name__ == "__main__":
    main()
