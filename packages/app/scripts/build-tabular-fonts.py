#!/usr/bin/env python3
"""
Build Poppins TTFs that support OpenType `tnum` (tabular figures).

WHAT
  Reads the four stock Poppins weights the app uses (400Regular, 500Medium,
  600SemiBold, 700Bold) from the installed @expo-google-fonts/poppins package
  and writes modified copies to packages/app/assets/fonts/ under the same file
  names, plus the font's OFL.txt. Each output font gains:
    - unencoded glyphs zero.tf .. nine.tf: copies of the default digit
      outlines, each on an advance equal to the widest default digit in that
      weight, with the outline centred in it;
    - tf copies of the ss04 alternates (two/three/six/nine.ss04), on the same
      width, so tnum still holds if ss04 is ever switched on (ss04's lookup
      runs before tnum's, so tnum sees the .ss04 glyph, not the default one);
    - a GSUB `tnum` feature (single substitution digit -> digit.tf), registered
      on every script/language system the font's existing GSUB declares.
  Nothing else changes: default digits keep their proportional widths, cmap is
  untouched, every existing GSUB/GPOS feature is kept as-is.

WHY
  Stock Poppins has proportional digits and no tnum feature (Bold "one" is 376
  units wide, "zero" 652), so every wait/time number changes width as it
  updates. The app already sets `fontVariant: ['tabular-nums']` on those
  numbers (`tabular` in src/theme.ts); iOS CoreText, Android
  fontFeatureSettings and web font-variant-numeric all map that to the `tnum`
  feature, which does nothing on a font that lacks it. With these fonts it
  starts working, with no call-site change, and digits in ordinary prose stay
  proportional because the defaults are not touched.

NAMES / LICENCE
  Poppins is under the SIL OFL 1.1 with NO Reserved Font Name (checked: the
  package's LICENSE_FONT copyright line and name IDs 0/13/14 declare none), so
  a modified version may keep the name. Family/full/PostScript names are kept
  unchanged on purpose: the app registers the fonts under its own keys and iOS
  resolves some paths by PostScript name. The modification is recorded in
  name ID 5 (version) and ID 10 (description). The build aborts if an RFN ever
  appears in the licence, or if the font already has a tnum feature or .tf
  glyphs (the premise of this script would then be wrong).

HOW TO RUN
  Needs fontTools (`pip install fonttools`) - use a venv, not a global install:
      python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools
      /tmp/fontenv/bin/python packages/app/scripts/build-tabular-fonts.py
  Run after `pnpm install` (it reads the stock TTFs from node_modules). It is
  deterministic: re-running on the same package version rewrites identical
  output. Re-run it whenever @expo-google-fonts/poppins is upgraded.
"""

from __future__ import annotations

import copy
import re
import shutil
import sys
from pathlib import Path

from fontTools.otlLib import builder as otl
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

APP_DIR = Path(__file__).resolve().parent.parent
PKG_DIR = APP_DIR / "node_modules" / "@expo-google-fonts" / "poppins"
OUT_DIR = APP_DIR / "assets" / "fonts"

WEIGHTS = ["400Regular", "500Medium", "600SemiBold", "700Bold"]
DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
TF_SUFFIX = ".tf"

VERSION_NOTE = "modified: OpenType tnum tabular-figure alternates added"
DESCRIPTION = (
    "Poppins with an added OpenType tnum feature: unencoded tabular-figure "
    "alternates (zero.tf-nine.tf) on the widest digit's advance, outlines "
    "centred. Default digits and all other glyphs and features are unchanged. "
    "Modified from the Google Fonts release for the Otrolado app; licensed "
    "under the SIL Open Font License 1.1."
)


def die(msg: str) -> None:
    sys.exit(f"build-tabular-fonts: {msg}")


def check_licence(font: TTFont, licence_text: str) -> None:
    """Refuse to keep the family name if the licence reserves it."""
    header = licence_text.split("SIL OPEN FONT LICENSE", 1)[0]
    name_texts = [font["name"].getDebugName(i) or "" for i in (0, 13)]
    for text in [header, *name_texts]:
        if re.search(r"reserved\s+font\s+name", text, re.IGNORECASE):
            die(
                "the licence declares a Reserved Font Name; a modified font may "
                "not keep the name. Rename the family before shipping."
            )


def tnum_sources(font: TTFont) -> list[str]:
    """Default digits (from cmap) plus any single-sub alternates of them."""
    cmap = font.getBestCmap()
    digits = [cmap.get(0x30 + i) for i in range(10)]
    if digits != DIGITS:
        die(f"unexpected digit glyph names {digits}")

    order = set(font.getGlyphOrder())
    if any(g.endswith((".tf", ".tnum")) for g in order):
        die("font already has .tf/.tnum glyphs - tnum premise is wrong")
    gsub = font["GSUB"].table
    if any(fr.FeatureTag == "tnum" for fr in gsub.FeatureList.FeatureRecord):
        die("font already has a tnum feature - premise is wrong")

    # Glyphs that other single substitutions turn digits into (ss04 here).
    # tnum's lookup runs last, so it must map those too.
    alternates: list[str] = []
    for lookup in gsub.LookupList.Lookup:
        for st in lookup.SubTable:
            if lookup.LookupType == 7:
                st = st.ExtSubTable
            if getattr(st, "LookupType", None) == 1:
                for src, dst in st.mapping.items():
                    if src in DIGITS and dst not in alternates:
                        alternates.append(dst)
    return DIGITS + sorted(alternates)


def add_tf_glyphs(font: TTFont, sources: list[str]) -> tuple[int, dict[str, str]]:
    glyf, hmtx = font["glyf"], font["hmtx"]
    width = max(hmtx[d][0] for d in DIGITS)
    if any(hmtx[s][0] > width for s in sources):
        die("an alternate digit is wider than every default digit")

    mapping: dict[str, str] = {}
    new_glyphs = {}
    for src in sources:
        g = copy.deepcopy(glyf[src])
        if g.isComposite():  # not the case in Poppins 4.004; keep it honest
            die(f"{src} is a composite glyph; this script only shifts outlines")
        dx = (width - hmtx[src][0]) // 2
        if g.numberOfContours > 0:
            g.coordinates.translate((dx, 0))
            g.recalcBounds(glyf)
        name = src + TF_SUFFIX
        new_glyphs[name] = (g, (width, g.xMin if g.numberOfContours else 0))
        mapping[src] = name

    # Every table is decompiled before the glyph order changes, so
    # glyph-indexed data (coverage tables, hmtx) is read against the old order.
    for tag in font.keys():
        font[tag]
    order = font.getGlyphOrder() + list(new_glyphs)
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    for name, (g, metrics) in new_glyphs.items():
        glyf[name] = g
        hmtx[name] = metrics
    font["maxp"].numGlyphs = len(order)
    return width, mapping


def add_tnum_feature(font: TTFont, mapping: dict[str, str]) -> None:
    gsub = font["GSUB"].table
    lookup = otl.buildLookup([otl.buildSingleSubstSubtable(mapping)])
    gsub.LookupList.Lookup.append(lookup)
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)

    rec = otTables.FeatureRecord()
    rec.FeatureTag = "tnum"
    rec.Feature = otTables.Feature()
    rec.Feature.FeatureParams = None
    rec.Feature.LookupListIndex = [len(gsub.LookupList.Lookup) - 1]
    rec.Feature.LookupCount = 1

    # Keep FeatureList sorted by tag (spec requirement), remapping every
    # LangSys's feature indices to the new positions.
    records = gsub.FeatureList.FeatureRecord + [rec]
    new_index = len(records) - 1
    ordered = sorted(range(len(records)), key=lambda i: records[i].FeatureTag)
    remap = {old: new for new, old in enumerate(ordered)}
    gsub.FeatureList.FeatureRecord = [records[i] for i in ordered]
    gsub.FeatureList.FeatureCount = len(records)

    def langsystems():
        for srec in gsub.ScriptList.ScriptRecord:
            if srec.Script.DefaultLangSys is not None:
                yield srec.Script.DefaultLangSys
            for lrec in srec.Script.LangSysRecord:
                yield lrec.LangSys

    for ls in langsystems():
        ls.FeatureIndex = sorted([remap[i] for i in ls.FeatureIndex] + [remap[new_index]])
        ls.FeatureCount = len(ls.FeatureIndex)
        if ls.ReqFeatureIndex != 0xFFFF:
            ls.ReqFeatureIndex = remap[ls.ReqFeatureIndex]

    if getattr(gsub, "FeatureVariations", None) is not None:
        die("GSUB has FeatureVariations; index remapping would need extending")


def annotate_names(font: TTFont) -> None:
    name = font["name"]
    for rec in [r for r in name.names if r.nameID == 5]:
        version = rec.toUnicode()
        if VERSION_NOTE not in version:
            name.setName(f"{version}; {VERSION_NOTE}", 5, rec.platformID, rec.platEncID, rec.langID)
        name.setName(DESCRIPTION, 10, rec.platformID, rec.platEncID, rec.langID)


def self_check(path: Path, stock: TTFont, width: int, mapping: dict[str, str]) -> None:
    """Re-open the written file and confirm the structure the shapers rely on."""
    out = TTFont(path)
    hmtx, gsub = out["hmtx"], out["GSUB"].table
    stock_feats = {fr.FeatureTag for fr in stock["GSUB"].table.FeatureList.FeatureRecord}
    out_feats = {fr.FeatureTag for fr in gsub.FeatureList.FeatureRecord}
    assert out_feats == stock_feats | {"tnum"}, out_feats ^ stock_feats
    tags = [fr.FeatureTag for fr in gsub.FeatureList.FeatureRecord]
    assert tags == sorted(tags)
    tnum_idx = tags.index("tnum")
    for srec in gsub.ScriptList.ScriptRecord:
        assert tnum_idx in srec.Script.DefaultLangSys.FeatureIndex, srec.ScriptTag
        for lrec in srec.Script.LangSysRecord:
            assert tnum_idx in lrec.LangSys.FeatureIndex, lrec.LangSysTag
    lookup = gsub.LookupList.Lookup[gsub.FeatureList.FeatureRecord[tnum_idx].Feature.LookupListIndex[0]]
    assert lookup.SubTable[0].mapping == mapping
    assert out.getBestCmap() == stock.getBestCmap(), "cmap changed"
    for src, dst in mapping.items():
        assert hmtx[dst][0] == width, dst
        assert hmtx[src] == stock["hmtx"][src], f"{src} metrics changed"
    for d in DIGITS:
        assert out["glyf"][d] == stock["glyf"][d] or (
            list(out["glyf"][d].coordinates) == list(stock["glyf"][d].coordinates)
        ), f"{d} outline changed"
    gpos_glyphs = {
        g
        for lk in out["GPOS"].table.LookupList.Lookup
        for st in lk.SubTable
        for cov in vars(st).values()
        if isinstance(cov, otTables.Coverage)
        for g in cov.glyphs
    }
    assert not gpos_glyphs & set(mapping.values()), "new glyphs appear in GPOS"
    for ident in (1, 2, 4, 6, 16, 17):
        assert out["name"].getDebugName(ident) == stock["name"].getDebugName(ident), ident


def main() -> None:
    if not PKG_DIR.is_dir():
        die(f"{PKG_DIR} not found - run `pnpm install` first")
    licence_path = PKG_DIR / "LICENSE_FONT"
    if not licence_path.is_file():
        die("the package ships no LICENSE_FONT (OFL text)")
    licence_text = licence_path.read_text(encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for weight in WEIGHTS:
        src = PKG_DIR / weight / f"Poppins_{weight}.ttf"
        # recalcTimestamp=False keeps head.modified at the stock value, so a
        # rebuild from the same package version is byte-identical.
        font = TTFont(src, recalcTimestamp=False)
        check_licence(font, licence_text)
        sources = tnum_sources(font)
        width, mapping = add_tf_glyphs(font, sources)
        add_tnum_feature(font, mapping)
        annotate_names(font)

        out_path = OUT_DIR / src.name
        font.save(out_path)
        self_check(out_path, TTFont(src), width, mapping)
        print(f"{out_path.relative_to(APP_DIR)}: tabular width {width}, "
              f"{len(mapping)} tf glyphs ({', '.join(mapping)})")

    shutil.copyfile(licence_path, OUT_DIR / "OFL.txt")
    print(f"{(OUT_DIR / 'OFL.txt').relative_to(APP_DIR)}: copied from {licence_path.name}")


if __name__ == "__main__":
    main()
