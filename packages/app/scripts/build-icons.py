#!/usr/bin/env python3
"""
Build every app-icon asset from the one official icon.

WHAT
  Reads the master render, design/OtroladoIcon.png (a full-bleed square: the
  white booth with its gate arm raised, on lit cobalt), and writes:

    assets/icon.png                     1024², no alpha — the iOS/Expo app icon
                                        (iOS applies its own corner mask and
                                        rejects an icon with transparency).
    assets/android-icon-background.png  1024² adaptive-icon BACKGROUND layer:
                                        the whole render, scaled into the 72dp
                                        viewport of the 108dp canvas, on the
                                        render's own edge colour. The render's
                                        glow and shadow can't be split into a
                                        separate foreground, so it lives here.
    assets/android-icon-foreground.png  1024², fully transparent (the layer is
                                        required; everything is in background).
    assets/favicon.png                  256², rounded-square cut-out for web.
    assets/logo-tile.png                192², square — the in-app lockup tile
                                        (Crossings and Plan headers). The UI
                                        rounds it with a radius, so the corner
                                        stays a design token, not a pixel.

  `assets/android-icon-monochrome.png` (Android 13 themed icons) is NOT
  regenerated: themed icons must be a flat single-colour silhouette, and the
  existing one is the same booth-and-raised-arm drawing as this render.

  If the prebuilt iOS project exists (packages/app/ios, gitignored), its
  AppIcon set is refreshed too, so the next `expo run:ios` shows the new icon
  without a clean prebuild. The icon only changes on a device after a native
  rebuild — Metro reloads JS, not the home-screen icon.

WHY
  One master, one command: the icon appears in five places across three
  platforms, and hand-exporting each is how they drift apart. To change the
  icon, replace design/OtroladoIcon.png and rerun this.

USAGE
  python3 packages/app/scripts/build-icons.py      (needs Pillow)
"""
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent.parent
MASTER = ROOT / "design" / "OtroladoIcon.png"
ASSETS = APP / "assets"
IOS_ICON = APP / "ios" / "Otrolado" / "Images.xcassets" / "AppIcon.appiconset" / "App-Icon-1024x1024@1x.png"

# Android adaptive icons: a 108dp canvas of which the launcher shows the
# central 72dp through its mask (circle, squircle, rounded square...).
ANDROID_CANVAS = 1024
ANDROID_VIEWPORT = round(ANDROID_CANVAS * 72 / 108)

# Favicon corner: the iOS icon's continuous corner is ~22.37% of the side; a
# plain rounded rectangle at that radius reads the same at favicon sizes.
FAVICON_SIZE = 256
FAVICON_RADIUS = round(FAVICON_SIZE * 0.2237)


def square(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def edge_colour(img: Image.Image) -> tuple[int, int, int]:
    """Median of the border pixels — the render's own ground colour."""
    w, h = img.size
    px = img.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)]
    border += [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    return tuple(int(median(c[i] for c in border)) for i in range(3))


def main() -> None:
    master = Image.open(MASTER).convert("RGB")
    if master.width != master.height:
        raise SystemExit(f"{MASTER.name} must be square, is {master.size}")

    icon = square(master, 1024)
    icon.save(ASSETS / "icon.png", optimize=True)

    bg = Image.new("RGB", (ANDROID_CANVAS, ANDROID_CANVAS), edge_colour(master))
    inset = (ANDROID_CANVAS - ANDROID_VIEWPORT) // 2
    bg.paste(square(master, ANDROID_VIEWPORT), (inset, inset))
    bg.save(ASSETS / "android-icon-background.png", optimize=True)

    Image.new("RGBA", (ANDROID_CANVAS, ANDROID_CANVAS), (0, 0, 0, 0)).save(
        ASSETS / "android-icon-foreground.png", optimize=True
    )

    fav = square(master, FAVICON_SIZE).convert("RGBA")
    mask = Image.new("L", fav.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, FAVICON_SIZE - 1, FAVICON_SIZE - 1), radius=FAVICON_RADIUS, fill=255
    )
    fav.putalpha(mask)
    fav.save(ASSETS / "favicon.png", optimize=True)

    square(master, 192).save(ASSETS / "logo-tile.png", optimize=True)

    written = ["icon.png", "android-icon-background.png", "android-icon-foreground.png",
               "favicon.png", "logo-tile.png"]
    if IOS_ICON.parent.is_dir():
        icon.save(IOS_ICON, optimize=True)
        written.append(str(IOS_ICON.relative_to(APP)))
    print("wrote", ", ".join(written))


if __name__ == "__main__":
    main()
