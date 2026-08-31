# Handoff: CrossQ / Otrolado — Border Wait Time App

## Overview
CrossQ (product name **Otrolado**) helps people crossing the US–Mexico border (pilot region: the Rio Grande Valley, TX — the design below was drawn for an earlier Laredo ↔ Nuevo Laredo pilot, which the implementation has since retired) pick the fastest crossing by **total door-to-door time** (drive + predicted wait at arrival), plan trips around a target arrival time, and get proactive alerts (wait spikes, time-to-leave, closures, mid-route reroutes). Includes home/lock-screen widget designs, a premium tier ("Otrolado Plus"), and Spanish localization for widgets.

## Implementation Scope (deviations from this spec)
The prototype below is the design contract, but two things in it are deliberately **not built**:

- **Cargo / commercial mode is descoped.** The mode segmented control ships as Vehicle / Walk only, and the FAST lane, broker and dock surfaces are not built. The pilot targets ordinary travellers; freight is a different product (brokers, docks, FAST enrolment, a lane whose wait behaves nothing like the passenger one) and a half-built version is worse than none. Lines mentioning cargo below are marked *(descoped)*.
  This is a product decision, not a data one — ingest still archives commercial lanes on every tick, because wait history cannot be backfilled and the same feed call returns it either way. The app's mode list lives in one place, `packages/app/src/modes.ts`; re-adding cargo starts there.
- **Southbound** has no federal feed. See `LIMITS.southbound`.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, NOT production code to copy directly. The task is to **recreate these designs in the target stack** (see below) using its established patterns and libraries. The `.dc.html` files open in a browser for reference; the `<script data-dc-script>` block at the bottom of each file contains all interaction logic and mock data — read it as the behavior spec.

## Target Stack (agreed in planning)
- **App**: React Native + Expo (TypeScript), both iOS and Android
- **Data/state**: TanStack Query + MMKV persistence (stale-while-revalidate, offline-first)
- **Backend**: Node.js (Fastify, TS) on Fly.io/Railway; Postgres + TimescaleDB; Redis (Upstash) + BullMQ
- **Auth**: Required accounts — managed provider (Clerk or Supabase Auth), Sign in with Apple + Google
- **Prediction**: nightly LightGBM (Python) writing forecast rows; alerts evaluated server-side
- Full details: `CrossQ Engineering Plan.dc.html` (stack rationale, API contracts, DB schema, model design, alert rules, caching, costs, build order). `CrossQ API Spec.dc.html` covers external data sources (CBP RSS, CBSA, Google Routes).

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate pixel-perfectly with the codebase's component library. The prototype is iOS-framed; adapt chrome (status bar, tab bar) to platform conventions on Android but keep layout, palette, and copy.

## Design Tokens
Font: **Schibsted Grotesk** (weights 400–800), system-ui fallback. Tabular numerals (`font-variant-numeric: tabular-nums`) on ALL wait/time numbers.

Colors:
- Navy (primary/brand): `#17427A`; pressed/hover `#0F2E56`
- Ink (headings): `#0B1F33` · Body-muted: `#33465C` · Secondary text: `#5A6B80` · Tertiary: `#8595A8`
- App background: `#F4F6F9` · Card: `#FFFFFF` · Border: `#D8DFE8` · Hairline: `#EBEFF4` · Chip/track bg: `#EDF0F4` / `#E2E7EE`
- Navy tint (selected bg): `#E3EAF4`, border `#C6D4E6`
- Green (good, <20 min wait / <50 min total): `#1E8E5A`, tint `#E4F2EA`, pressed `#177A4C`
- Amber (moderate, 20–45 wait / 50–65 total): `#C77E14`
- Red (bad, >45 wait / >65 total): `#C0392B`, tint `#FBEAE6`, border `#EFC5BB`, text-on-tint `#7A3B31`
- Plus/premium gold: `#C7A23A` (icon), `#F2C14E` (on dark), badge bg `#F6ECD2`, badge text `#7A5C12`
- Dark-mode widget env: bg `#1D2735`, text `#FFFFFF`, sub `#93A7C0`, green `#4CC98A`, amber `#E8A63D`, red `#E36A52`

Radii: cards 14–16px, buttons 12px, segmented controls 10px (inner 8px), chips 16–17px (pill), widgets 22px, sheets 22px top, floating tab bar 36px.
Shadows: card hover `0 2px 8px rgba(11,31,51,.08)`; widget `0 10px 26px rgba(11,31,51,.22)`; tab bar `0 12px 32px rgba(11,31,51,.20), 0 2px 8px rgba(11,31,51,.08)`; sheet `0 -8px 30px rgba(11,31,51,.25)`.
Spacing: screen gutter 20px; card padding 12–16px; stacked-card gap 8–10px; section gap 14px.
Type scale: page title 28/800 (−0.5px tracking); detail title 19/800; big stat 38–46/800; card title 13.5–15/700; body 12–13; section label 11/700 uppercase +0.8px tracking; captions 10.5.

## Screens

### 1. Home — "Crossings" (default tab)
- Header: location line ("Near Nuevo Laredo, MX" with green GPS dot, tappable → region sheet), 28px title, two 38px round buttons (persona icon, settings gear).
- Optional surge banner (red tint) when lanes closed.
- Direction card: "Heading to USA/Mexico" + auto-detect note + **Flip** button (swaps direction; southbound waits ≈ 35% of northbound).
- Mode segmented control (Vehicle / Walk / ~~Cargo~~ *(descoped)*) with sliding white pill (transform .32s cubic-bezier(.3,.9,.35,1)).
- **Fastest door-to-door hero card** (navy): port name, "Saves X min vs …", green total-minutes badge; optional "why" row when the nearest port isn't fastest.
- Map (260px): stylized region with river, road labels, "You" dot, per-port pins — colored badge (green/amber/red by total) + name tag; legend bottom-right (<50m / 50–65m / >65m).
- Ranked port list: rank circle (green #1), name, "X min drive · waits on arrival" + STD/SENTRI chips (vehicle+northbound only), right side total (20/800) + trend (▲ rising amber / ▼ falling green / ▬ steady gray).
- Dashed "not available in this mode" card; source note ("Live from CBP · updated 2:41 PM").

### 2. Port detail
- Back chevron button, port name + bridge subtitle, OPEN 24H badge (green tint).
- Lane segmented control: Standard / SENTRI / Ready Lane (vehicle + northbound only). Lane multipliers: SENTRI ×0.25, Ready ×0.7.
- Main card: "WHEN YOU ARRIVE · 3:19 PM" label, 38px wait number ± range, "right now it's about X" + trend.
- Optional ESTIMATED badge (gold tint) when feed is lagging — "modeled from history".
- 12-hour forecast bar chart: colored bars (green/amber/red by value), lighter uncertainty band on top of each, navy bar = arrival hour; hour labels (3P…2A). **Free tier**: hours beyond 3 blurred behind gradient + "See beyond 3 hrs" lock pill → premium sheet.
- ~~Cargo mode adds: FAST vs STANDARD lane cards, inspection note, docks & brokers hours.~~ *(descoped — not built)*
- "Day-of-week patterns" row (PLUS-gated) → patterns sheet.
- Actions: "Route here" (navy, full) + "Alert me" (outlined).

### 3. Trips tab
Two stages. **Setup**: Starting-from radio cards (Current location / Home) + privacy note; destination chips per direction; Arrive-by / Leave-at segmented; day chips (Today/Wed/Thu/Fri/Sat — future days PLUS-gated, tap → premium sheet); time stepper card; green "Build my plan" CTA.
**Plan**: summary row + Edit; navy recommendation card — "Leave by 5:02 PM" headline, via-port, 4-step timeline (leave → at bridge → ~X min in line → across ✓ with dots and connector lines), green save-trip/alert CTA; "Other options" list with leave-time deltas; PLUS multi-stop teaser (dashed gold border).
Solver: arrive-by works backward from target minus 10-min buffer; leave-at works forward. Future days use typical day-of-week waits (day factors [1, 0.9, 1.0, 1.3, 1.4]), re-checked live on the day.

### 4. Alerts tab
- 4 toggle rules: Wait spikes at favorites / Time-to-leave for trips / Closures & port status / Better crossing on route. iOS-style toggles (44×26, green on).
- Lock-screen mockup showing 3 notification examples (exact copy in prototype).
- "Home-screen widgets" promo row (NEW badge) → widgets sheet.

### 5. Bottom sheets (all: dim scrim rgba(11,31,51,.45), white 22px-top sheet, drag handle)
- **Route**: Google Maps / Apple Maps handoff + "keeps watching while you drive" note.
- **Premium (Otrolado Plus)**: lock icon, 3 checkmarked benefits (12-hr forecasts, day-of-week patterns, multi-stop), $1.99/mo (7 days free) vs $14.99/yr (save 37%).
- **Settings**: ETA source radio (Google Routes / Apple Maps), Miles, 12-hour clock.
- **Persona**: 3 tiles — I drive / I walk / ~~I haul cargo~~ *(descoped)* (sets mode).
- **Region**: Laredo·Nuevo Laredo (CURRENT) + 3 "SOON" regions.
- **Patterns** (PLUS): day-of-week chips, 18-bar hourly histogram (6 AM–11 PM), QUIETEST/BUSIEST callouts.
- **Widgets**: size tabs (Small/Medium/Large/Lock), port picker chips, live preview on wallpaper, Dark/English/Español chips, staleness explainer ("Data older than 20 min grays out with an 'as of' stamp"), Add to Home Screen CTA.

### 6. Widget surfaces (second device frame in prototype)
Home screen (small 158×158 single-port widget with 46px wait number + hint line; medium/large ranked-list widget, large adds mini-map with pins), lock screen (strip widget: "Colombia · 15 min ▲ · 53 total"), and edit-widget popover (crossing picker + hero-number row). Light + dark envs; EN + ES strings (see `LD` object in prototype logic).

## Interactions & Behavior
- All wait math flows from mock data in `data()`: per-port `now/arr/pm/fc[]/fpm[]/trend`. Direction flip multiplies by 0.35. Color thresholds: wait ≤20 green, ≤45 amber, else red; total <50 green, ≤65 amber, else red.
- Sliding-pill segmented controls animate via transform, .32s cubic-bezier(.3,.9,.35,1); toggles .15s.
- Floating pill tab bar (Crossings/Trips/Alerts), blur backdrop, sliding highlight.
- Premium gating: `premiumUnlocked` flag unlocks forecast hours 4–12, patterns sheet, future trip days.
- Honesty affordances (product principle — keep them): every number has a freshness stamp; ESTIMATED badge on stale feeds; widgets gray out past 20 min; forecast shows ± uncertainty bands.

## State Management (app)
Prototype state keys map to real app state: `tab, mode (vehicle/walk; cargo descoped), dir (us/mx), detailId, lane, sheet, planMode, tripStage/From/Dest/Day, alerts[], patDay, widget size/port/dark/lang`. In production: server data via TanStack Query (`/waits`, `/forecast`, `/etas`, `/trips`, `/alerts`); persona/direction/settings in MMKV; premium via IAP entitlement.

## Assets
No raster assets. All icons are inline SVGs (Material-style car/walk/truck paths + custom strokes) — replace with the RN icon set of choice, keeping sizes (16–20px) and colors. Maps in the prototype are stylized placeholder SVGs — production uses a real map (MapLibre/Mapbox) with the same pin/legend design. Font: Schibsted Grotesk via Google Fonts (`expo-font`).

## Files
- `CrossQ Prototype v3.dc.html` — the app + widgets prototype (primary reference; logic block = behavior spec)
- `CrossQ Engineering Plan.dc.html` — stack, architecture, API contracts, DB schema, model, alerts, costs, build order
- `CrossQ API Spec.dc.html` — external data-source integration (CBP/CBSA feeds, Google Routes)
- `Home A/B/C…`, `Picker A/B…` — earlier explorations (context only; v3 supersedes)
- `ios-frame.jsx`, `support.js` — prototype runtime helpers, not part of the design
