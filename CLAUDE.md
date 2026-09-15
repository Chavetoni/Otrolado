# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Otrolado (working title CrossQ) — a US–Mexico border wait-time app. Pilot region is the **Rio Grande Valley, TX** (Brownsville, Hidalgo/Pharr, Progreso, Rio Grande City, Roma — 11 crossings). The product ranks crossings by **total door-to-door time** (drive + predicted wait on arrival), not by raw wait.

Two halves live here:

- `packages/` — the application (pnpm workspace). Fastify + Postgres API today; Expo RN app to come.
- `design/` — the handoff bundle: interactive HTML prototypes and written specs. Reference material, not code to import.

`README.md` is the design handoff doc (tokens, per-screen specs, target stack). The two spec pages in `design/` are the backend contract.

`HANDOFF-emulator-setup.md` documents the iOS-simulator and VS Code debug setup (what was verified, what wasn't, and two retracted wrong diagnoses); read it before touching `.vscode/` or the simulator workflow.

`Otrolado Design System.md` (v1.0, "Cobalt") is the canonical design spec — colors, radii, spacing, type — implemented in `packages/app/src/theme.ts`. It supersedes the prototype's own palette; `design/` still governs layout, copy and behavior (`renderVals()`), not hex values. See the "pre-Cobalt and superseded" note in README.md's Design Tokens section.

One token deviates from that spec on purpose. `color.muted` is `#5B6B95`, not
the spec's `#7E8DB5`, which measured **2.9:1 on `mist` and 3.3:1 on white** —
below WCAG AA at any size. That token carries every caveat in the app (ages,
"approx", CBP attribution, the reason a row has no total) at 11px, on a screen
used in a car in Rio Grande Valley sun, so the disclosures were the least
legible text on every screen. The replacement keeps the same blue-grey family
at 4.7:1 / 5.3:1. Re-syncing `theme.ts` from the design doc must not silently
restore the old value.

## Commands

```bash
pnpm install
pnpm migrate                       # apply packages/api/migrations/*.sql in order
pnpm db:reset                      # drop schema + replay all migrations
pnpm --filter @otrolado/api seed    # seed all ~85 crossings from the live feed
pnpm ingest                        # one CBP poll, prints a JSON result
pnpm import:typical                # CBP previous-year hourly averages -> typical_waits (pilot ports)
pnpm dev:api                       # Fastify on :3000, polls CBP every 15 min
pnpm dev:app                       # Expo dev server; open with the dev build on the phone (Expo Go no longer works — see App constraints)
pnpm dev:app:web                   # react-native-web build on :8081 (Chrome debuggable)
pnpm --filter @otrolado/app ios    # build + install the dev build (add `--device` for a plugged-in iPhone; simulator too RAM-heavy on this machine)
pnpm typecheck                     # all packages
pnpm test                          # unit tests, all packages (no infra needed)
pnpm test:integration              # api integration suite — needs services:up (real Postgres + Redis, disposable db)
pnpm coverage                      # which archive hours are actually populated, against $DATABASE_URL
```

Unit tests need nothing running and cover the pure modules: `cbp-parse`, `infer-tz`, `tz` in the api, and `ranking`/`trip`/`alerts`/`prefs`/`useFreshness` in the app (all under `src/**/*.test.ts`, run with `vitest`). Integration tests (`packages/api/test/integration/**`) hit a real, disposable `otrolado_test` database and Redis DB 15 — never the dev database — and are deliberately excluded from `pnpm test`; run a single file with `pnpm --filter @otrolado/api exec vitest run --config vitest.integration.config.ts <path>`. The app's test script runs under `TZ=America/Chicago` on purpose (see `vitest.config.mts`) — the calendar-date tests assert that zone took effect, so a bare `npx vitest` outside pnpm can silently pass in UTC and miss local-date bugs.

Local services are Homebrew, not Docker, and are deliberately NOT registered to
start at login — bring them up when working and down when done:

```bash
pnpm services:up       # start Postgres + Redis for this session
pnpm services:down     # stop both
pnpm services:status   # what's running

export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"   # for psql
psql -U otrolado -d otrolado
```

`services:up` uses `brew services run`, not `brew services start` — `start`
re-registers the login agent and would silently undo the no-autostart setup.

Redis uses DB index 1 (`redis://localhost:6379/1`), not the shared default 0,
so another project on this machine cannot collide with or flush our keys.

Docker is the better answer once a second project needs Postgres or Redis on
this machine; it wasn't installed when this was set up. Only the connection
strings would change.

Copy `.env.example` to `.env` first. `INGEST_PORT_IDS` is empty by default, meaning **archive every crossing CBP reports** — it is the same single feed call either way, and wait history cannot be backfilled. That setting governs collection only; the UI scopes to the pilot region separately.

Seeding is two-tier: every crossing gets a row from the feed (name, border, hours, inferred `feed_tz`), then pilot crossings are overlaid with curated values (display name, coordinates, `routable`). The upsert is provenance-aware — a reseed corrects `inferred` values but never clobbers `curated` ones.

## Architecture

The load-bearing fact: **wait data is identical for every user.** ~85 CBP crossings × ~7 lane slots is a small blob, so the read path is a Redis snapshot behind an ETag'd 30 s CDN cache. A million users produce cache hits, not queries. Keep it that way — no per-user work on `/v1/waits`.

```
CBP feed ──poll──▶ parse ──▶ wait_observations (partitioned) ──▶ Redis snapshot ──▶ /v1/waits
                                     │                                                  │
                              model training set                            freshness applied at read time
```

- `packages/shared` — domain vocabulary, port directory, freshness policy. Imported by both API and app.
- `packages/app` — Expo + expo-router. `src/ranking.ts` is the domain core (pure, testable outside React); `src/theme.ts` holds the design tokens.
- `packages/api/src/ingest/cbp-parse.ts` — pure feed → readings. No I/O; the place to test parsing.
- `packages/api/src/ingest/run.ts` — one poll: fetch, parse, ensure partition, upsert, rebuild snapshot, record the run.
- `packages/api/src/snapshot.ts` — builds/reads the Redis blob, falls back to Postgres.

### Non-obvious things that will bite you

**`lane_status` has five values and three of them are not numbers.** CBP emits `no delay`, `delay`, `N/A`, `Lanes Closed`, `Update Pending`. A lane that doesn't exist, a closed lane, and an overdue report are three different sentences on screen — none of them "0 min". A CHECK constraint enforces `wait_minutes IS NULL` unless `status = 'open'`. Do not relax it.

**CBP timestamps are port-local, and the zone is inferred, not given.** The feed's `time` differs per record because each is in that crossing's own zone. CBP publishes no timezone field, so `ingest/infer-tz.ts` recovers it: every record in a document describes the same instant, so the zone is whichever one makes the stated wall time land on our fetch time.

**`feed_tz` is not the crossing's civil timezone.** CBP applies daylight time uniformly, so Arizona crossings (Nogales, San Luis, Lukeville) are published in Mountain *Daylight* (UTC-6) even though Arizona does not observe DST and is really `America/Phoenix` (UTC-7 year round). Verified against the live feed: Nogales reads 20:35 while Blaine WA reads 19:35 at the same instant. `America/Phoenix` is therefore *excluded* from the candidate list — it is geographically correct and would mis-parse every Arizona reading by an hour. The column is named `feed_tz` for this reason. Expanding the UI into Arizona will need a separate curated `local_tz` for port hours and forecast hour labels.

**The zero-spread invariant is the canary.** Since all records in a document share one instant, `observedSpreadMinutes` is 0 when every `feed_tz` is right and jumps to ~60 the moment one is wrong. Ingest computes it every tick and the server warns above 5. If it ever fires, reseed ports — history written under a wrong zone lands in the wrong hour and cannot be repaired after the fact.

**`update_time` is hour-granular and sometimes in the future.** A port stamped 15:49 local reports "At 3:00 pm"; one stamped 16:49 reported "At 5:00 pm". So `feed_age_seconds` sweeps 0→~59 min every hour regardless of data quality. The integration spec's "feed age > 30 min → ESTIMATED" rule, applied to this field, makes the badge a clock hand. `packages/shared/src/freshness.ts` deliberately gates on our own ingest age plus CBP's explicit `Update Pending` instead. Read the comment there before changing it.

**The snapshot stores facts, not verdicts.** Freshness depends on elapsed time since generation, so baking it into the cached blob would freeze it at write time. Routes apply the policy on read.

**Custom enum arrays need a registered parser.** node-pg has no built-in parser for `travel_mode[]`, so it arrives as the raw literal `{passenger,pedestrian}`. `src/db/index.ts` looks up the array OIDs at startup (they're per-database, not constants) and reuses pg's text-array parser.

**Ingest is idempotent.** The PK is `(observed_at, port_id, mode, lane, direction)` and inserts are `ON CONFLICT DO NOTHING`, so re-polling an unchanged feed document writes 0 rows. `rows_written: 0` in an ingest result is success, not failure.

**`pnpm db:reset` refuses to drop a database that has data or isn't local.** Since ingest now runs continuously against a remote archive (see below) that cannot be recollected, `--reset` checks `wait_observations` for rows and the target host for "is this machine" before dropping `public`; either condition blocks it unless you name the target back via `OTROLADO_RESET_CONFIRM=<host>/<db>`. Only an empty local database resets frictionlessly.

**Partitioning, not Timescale.** ~5M rows/yr is small; declarative monthly partitions + BRIN match Timescale's performance at this scale without the extension dependency. `ensure_wait_partition()` is called lazily on each ingest so month boundaries never fail.

### App constraints

**Targets a local dev build; Expo Go is dead for this project.** Decided 2026-09-01. The app is on SDK 57, but Expo stopped updating Expo Go on the App Store after SDK 54 (latest is 54.0.2, released 2025-09-23) — so no installable Expo Go can run this project on a physical iPhone, and updating the phone app cannot fix the "requires a newer version of Expo Go" error. The simulator (which pulls Expo Go 57 straight from Expo's servers) would work but is too RAM-heavy for this machine. The dev build is the standard `npx expo run:ios --device` flow: `expo-dev-client` is installed, `expo prebuild` generates `ios/` (gitignored — regenerable), CocoaPods 1.17 is via Homebrew. Signing uses a free personal Apple ID team, which expires every 7 days — re-run `expo run:ios --device` weekly; the JS itself still hot-reloads from Metro (`pnpm dev:app`) between builds, so rebuilds are only needed for the cert or for native changes. Consequences:

- Custom native modules are now *possible*, but each one added is a rebuild-on-every-phone cost — keep the dependency bar where it was.
- **AsyncStorage stays for now.** The plan specifies MMKV and the dev build could load it; swapping means changing the persister in `app/_layout.tsx` and nothing else. Do it deliberately, not as a drive-by.
- The `.vscode/launch.json` Chrome debug config remains reasoned-but-untested (see `HANDOFF-emulator-setup.md`); the handoff doc's simulator narrative predates this decision.

**The origin is settable, and it is the app's most consequential input.**
Every ranking, total and leave-by is measured from one point. `useOrigin` is a
module store with three sources, and they are three different sentences: a GPS
fix (`Starting near <nearest town>`), a town the user picked
(`Starting from <town>` — as trustworthy as GPS, so NOT flagged approximate),
and the fallback (`Approximate start`, `isFallback: true`, amber dot). A chosen
place **suppresses the GPS read entirely** — someone who has told us where they
are must not also be asked for location permission. `src/places.ts` holds the
eleven pilot-region towns as CITY centroids; that precision is honest for a
straight-line drive estimate whose error dwarfs it, unlike the port
coordinates, which Routes would measure *to* and which therefore carry
`coordsApproximate`. Picker is `app/origin.tsx`, reached from `OriginChip` on
Crossings and Plan.

**The detail screen compares live against typical, and that is the strongest
thing it says.** "UNUSUALLY BUSY · 20 min longer than a typical Wednesday at
2 pm" is computed by `compareToTypical` from `typical_waits` — a live number
set against its OWN history, which is what a raw 60-minute figure can never
tell you. Gated on a live reading (a verdict on a stale number is not a
verdict), and on `UNUSUAL_THRESHOLD` (15 min), which clears CBP's ±10 min
reporting accuracy — the same value and reasoning as the spike and faster
thresholds. Both directions fire: an unusually SHORT line is at least as
actionable. `src/typical.ts` is the pure half (no React, no I/O, tested);
`src/useTypicalNow.ts` is the query wrapper. Both the banner and `TypicalCard`
read the same hook so they cannot quote different figures for the same hour.

**The detail screen will not claim things it hasn't checked.** Two claims were
proposed by a mockup round and deliberately not built:
- A green **"Verified approach point"** badge. All eleven coordinates are
  unsurveyed OSM centroids; a tick saying otherwise is a claim that something
  was checked when it was not, and it stops the user checking too. The entrance
  row instead names which point it routes to — the curated line-start where one
  exists, otherwise the bridge pin with "hand-placed, not surveyed". Earn the
  badge with the survey (see "Port coordinates" below).
- A green **"High confidence"** shield on the Crossings hero. Nothing in this
  system estimates how LIKELY a number is to be right — only how old it is and
  whether CBP flagged it. The freshness pill is the honest version.

**The booth line states a fact and stops.** `BoothsLine` renders "1 of 12
booths open" from CBP's own `lanes_open` / `max_lanes`. It used to append
"line drains slowly" / "line moves steadily" off a staffing ratio; that is a
claim about how a queue BEHAVES, and nothing here has ever measured throughput
per booth. The colour still tracks the ratio; the prediction is gone.

**The map is an inline card that expands.** Home renders `CrossingsMap` at
`variant='card'` (260px) between the hero and the ranking, fed the same
`ranked` array the list renders so a pin and a row can never disagree about a
crossing. A tap on the basemap pushes the full-screen route (`app/map.tsx`,
`variant='full'`), which is where panning actually works — panning does not
belong inside a scroll view. Mode travels with the push so the map opens on
what Crossings was showing.

This reverses an earlier call (the card was briefly a "View map" row) and
takes back its tradeoff knowingly: at card size the RGV pins bunch around
Reynosa–Matamoros and the labels overlap. The card earns its third of the
screen as an at-a-glance overview of where the crossings *are*; reading an
individual pin is the expanded map's job, and the tap target is right there.
`VISIBLE_CROSSINGS` was cut from 4 to 3 to pay for the height. If the pin
crowding is ever attacked directly, do it with clustering or label collision
in `map-pin.ts` — not by removing the card again.

Pins stay **wait-only** with the chip reading "· wait" — a proposed
"Total time / Border wait" toggle would reintroduce exactly the ambiguity
`map-pin.ts` exists to prevent, since the same pin would mean two things at
different times.

**Northbound is the default on every screen that has a direction control**
(Crossings, Plan, port detail). Southbound is offered, because travellers ask,
and answered with the no-official-data notice. A mockup round drew "To Mexico"
selected with a fully populated ranking; there is no southbound feed, so that
would make the app's first screen a page of invented numbers.

**The API base URL is derived, not hardcoded.** On a physical device `localhost` is the phone, so `src/api.ts` reads Expo's `hostUri` to find the dev machine on the LAN. `EXPO_PUBLIC_API_URL` overrides it.

**Drive times are placeholders.** `src/drive.ts` is straight-line distance x a distance-scaled speed — it ignores roads, bridges and traffic, and understates Colombia Solidarity badly. It exists because the plan names this as the Routes degrade path, so the "approx" presentation is needed regardless. Every derived number renders with its approximation disclosed. Swapping in Google Routes means replacing that one module.

**Ranking is on the standard lane, deliberately.** Ranking each crossing on whichever lane is fastest would silently change what the headline number means between rows — a SENTRI figure and a standard figure are not comparable, and most users cannot use the former. A crossing with closed standard lanes keeps its row (its trusted lane may still be usable), shows a red CLOSED chip, has no total, and sorts below everything that does.

**Plan and Alerts are today-only and foreground-only.** Both screens are real,
but each is capped by a missing input, and the cap is stated on screen rather
than hidden:

- The tab is labelled **Plan**; the route is still `/trips` and the file is
  still `app/(tabs)/trips.tsx`. Renaming the route would break existing deep
  links for a label change, and the path is not user-visible.
- `src/trip.ts` solves leave-by = target − drive − wait from the wait CBP
  reports *right now*, held constant for the length of the drive, on top of the
  straight-line drive estimate. That is the honest limit without a forecast.
  **No slack is added and no range is quoted.** The prototype's 10-min buffer
  went with the table redesign, and a later mockup round proposed bringing it
  back as "about 59–69 min total · includes a 10 min safety buffer" — that
  interval is a constant added to one number, wearing the visual language of a
  measured band. There is no measured spread until the archive matures, so the
  screen states the arithmetic it did and tells the user to add their own slack.
  (`typicalSpread` is the shape a real range would take: quartiles of actual
  data, labelled as hours rather than waits.)
- Every option in a plan is solved on ONE lane, which is what keeps the
  leave-by times comparable. Travel mode (Vehicle / Walking) and lane type
  (Standard / Ready Lane / SENTRI) are **separate controls** that collapse to a
  single `TripLane` via `toTripLane` — the split is presentation only.
- A missed departure renders as **"Leave now · about N min late"**
  (`minutesLate`), not "too late". The old copy told a user their plan had
  failed without telling them by how much, and 6 minutes late is a completely
  different decision from 90.
- Tomorrow is rendered **disabled with the data gap named** — deliberately NOT
  gated behind Plus the way the prototype does it, because the blocker is six
  weeks of missing history, not a missing payment. Selling it as premium would
  be selling a capability that does not exist. It is a plain row, not a
  dropdown: a chevron promises a menu of days and there is only one.
- The saved trip (a tapped row) stores the *question* — target, lane, crossing
  — never the answer. `useSavedTrip` re-solves it on every poll and the
  time-to-leave nudge fires on that, so it never nudges on a leave time from
  save time; a trip expires with the day it was saved on.
- `src/alerts.ts` + `src/useAlertWatch.ts` evaluate rules **in the app**, against
  each `/v1/waits` poll, and require a previous snapshot — a first poll fires
  nothing, or every crossing would "spike" merely because we just started
  looking. The watcher is mounted in `app/(tabs)/_layout.tsx`, above the
  screens, so rules keep running on whichever tab is showing. Evaluation is on
  the passenger standard lane; widening it means keying the previous snapshot by
  mode, or a mode switch diffs a walk lane against a drive lane.
- **"Another crossing is faster" (`faster`) leads the rule list**, and replaced
  `reroute`. `reroute` was permanently disabled behind "needs turn-by-turn
  routing" — too ambitious a framing for the question most people have.
  Comparing a saved trip's crossing against the alternatives from a STATIC
  origin needs no position on the road: only the saved trip and the feed we
  already poll. `evaluateFasterRule` compares **leave-by times** (door-to-door,
  so it folds in the drive) on the trip's own lane, refuses to fire off a
  non-live reading on either side, refuses once either departure has passed,
  and keys one event per alternative so a moving margin does not spam. It rides
  the `generatedAt` guard, not a timer — the answer can only change when the
  document does. A mid-drive version still needs routing; this is the part that
  does not.
- A rule that cannot be evaluated would render disabled with the reason. Never
  ship an alert toggle that moves and does nothing — silent non-delivery is the
  characteristic failure of an alerts product. As of the `faster` rule, all four
  run, so nothing is currently blocked.
- The Alerts screen's top banner says **"Alerts only run while the app is
  open"**, in amber. A mockup round proposed a green "Push notifications on"
  tick in that slot; there is no push, so that would promise delivery that
  cannot happen — the exact failure the screen exists to prevent.
- `src/prefs.ts` is client-owned state (saved trip, rule switches, watchlist,
  activity), not server cache, so it is a `useSyncExternalStore` module store
  rather than anything in React Query. It has to be readable from the tab layout,
  which sits above every screen.

**Cargo mode is descoped, but commercial data is still collected.** The app
offers Vehicle and Walk only — freight is a different product (brokers, docks,
FAST enrolment, a lane whose wait behaves nothing like the passenger one) and
the pilot targets ordinary travellers. That is a product decision, not a data
one: ingest still parses and archives `commercial` lanes and `fast` lanes every
tick, because wait history cannot be backfilled and it is the same single feed
call either way. `travel_mode` keeps its three values, and `ports.modes` still
records commercial accurately — it describes the crossing, not our feature set.
The UI's mode list is `packages/app/src/modes.ts`; re-adding cargo starts there,
and `rankPorts` already filters on `port.modes.includes(mode)` so a truck-only
bridge can never appear in a passenger ranking.

### Deferred on purpose

- **Auth.** `/v1/ports` and `/v1/waits` are unauthenticated so the CDN can cache them for everyone, so slice 1 needs no provider. Trips and alerts exist client-side only and store nothing off-device, so they still need no account; Clerk-vs-Supabase gets decided when rules have to run server-side. Until then: no provider SDKs, no RLS assumptions. `users.id` stays a UUID we own, with the provider subject as a separate nullable column.
- **Cloud hosting for the app itself.** Local Postgres for development until the schema settles. Keep everything vendor-portable. (Continuous archival ingest is the one thing that already runs against a managed remote Postgres — see below — because a laptop cannot poll around the clock; that database is not yet where `dev:api` or the eventual serving path points.)
- **Southbound.** No federal feed exists. The prototype's `dFac = 0.35` southbound multiplier is invented mock data and must not ship as if it were fed. The app renders an explicit "no official data" state instead. See `LIMITS.southbound`.
- **Push delivery.** Alerts fire in the foreground only. Background notifications need an account to attach rules to and a queue (BullMQ + APNs/FCM) to send from; until then the Alerts screen says so in the same weight as the feature.
- **Forecasts.** The 12-hour chart, trend arrows and future-day trip planning need roughly six weeks of archived history that does not exist yet — continuous collection only started once CI ingest replaced the laptop (see "Continuous archival ingest" below), so the clock on that six weeks starts from then, not from project start. The detail screen says so rather than drawing a curve. Interim: `typical_waits` holds CBP's own previous-year hour-by-weekday averages (`pnpm import:typical`, from the undocumented API behind bwt.cbp.gov/historical — see migration 011 and `scripts/import-typical-waits.ts` for the feed's quirks). It is a climatology attributed to CBP, not our forecast — anything rendered from it must say so, and it gets superseded by our own status-aware medians once the archive matures. Served by `/v1/typical/:portId` and rendered by the detail screen's TypicalCard (single cobalt, never the live severity colors; attribution carries the import vintage).
- **Port coordinates.** All eleven pilot coordinates are OSM named-bridge-way
  centroids — one source, one rule — and flagged `coordsApproximate`. Routes
  measures to the point we give it, so these must be surveyed before ETAs ship.

  Audited against OSM `barrier=border_control` and Nominatim: every one resolves
  to its actual named international bridge, 10 of 11 within ~500 m of a tagged
  border-control point. They are not misplaced. Two things the audit settled,
  so they are not rediscovered as bugs:

  - Reverse-geocoding returns **México for 7 of 11**. That is not an error — a
    mid-span centroid lands on whichever half of the river it falls, and
    Nominatim names the bridge structure, not a plaza.
  - The survey target is **not** the US inspection plaza. CBP publishes
    northbound only, and a northbound driver joins the queue on the *Mexican*
    approach, since the line backs up across the bridge. The drive leg ends
    where the queue begins. Moving pins to the US side would point past the
    very wait being measured.

  When the survey happens it must move **all eleven** to one consistent rule.
  Patching a subset reintroduces the systematic offset between compared rows
  that `packages/shared/src/ports.ts` exists to avoid.

## Continuous archival ingest

A laptop cannot poll CBP around the clock — `launchd` doesn't run through sleep, and the first days of local-only collection left most hours uncovered (11pm local was never sampled). So archival ingest now runs in `.github/workflows/ingest.yml` against a managed remote Postgres (its `DATABASE_URL` is a repo secret, applied once via `pnpm migrate` + `pnpm --filter @otrolado/api seed`, then never auto-migrated by the workflow itself — a schema change is applied by hand). The workflow spins up a throwaway Redis service container per run since ingest needs one to rebuild a snapshot, but that snapshot is discarded with the runner; this pipeline archives, it does not serve. `pnpm coverage` (against that same `DATABASE_URL`) is the health check — it reports which UTC hours actually have an observation, because row counts alone can't distinguish "ran all day" from "ran three hours and got lucky," and wait history cannot be backfilled once a gap happens.

GitHub's own `schedule:` cron proved unreliable on this repo (measured: 3 of 22 possible hourly windows fired in one 12-hour stretch), while `workflow_dispatch` has fired every time it was tried. `workers/ingest-cron` is a Cloudflare Worker with no `fetch` handler — just a cron trigger that calls `workflow_dispatch` on `ingest.yml` every 15 minutes. It holds a fine-grained GitHub PAT (`Actions: Read and write` only) as a Wrangler secret, never in this repo. The workflow's own `schedule:` stays in place as free redundancy — ingest is idempotent, so a doubled run just writes 0 rows.

Two guards against the archive stopping silently. The Worker re-enables `ingest.yml` before every dispatch, because GitHub disables scheduled workflows after 60 days without a commit on a public repo, and a disabled workflow rejects `workflow_dispatch` as well. And the workflow's last step checks in with healthchecks.io (repo secret `HC_PING_URL`; both check-in steps skip while it is unset and can never fail the job), which alerts when check-ins stop — the only thing that catches a run that never starts, since GitHub only emails about runs that start and fail.

## Working with `design/`

`.dc.html` files are rendered client-side by `support.js` (vendored `dc-runtime`). Serve over HTTP — the runtime fetches page source and `x-import`ed modules, both of which fail on `file://`:

```bash
python3 -m http.server 8000 --directory design
```

`support.js` and `ios-frame.jsx` are generated/vendored; don't edit them.

`CrossQ Prototype v3.dc.html` has a `<script data-dc-script>` block with `class Component extends DCLogic` — `renderVals()` is the behavior spec. The other two pages are static prose; read them with tags stripped (`sed 's/<[^>]*>/ /g'`).

Template language: `{{ }}` is a **restricted evaluator, not JavaScript** — dotted paths, `!`, `===`/`!==`/`==`/`!=`, parens, literals. No arithmetic, calls, ternaries, or `&&`/`||`; precompute in `renderVals()`. `<sc-if>` has no `else` (write two with a precomputed inverse), `<sc-for list as>`, `<x-import>`, `style-<pseudo>` attributes compile to real pseudo-class rules. Scenario props (`premiumUnlocked`, `surgeMode`, `showEstimated`) default false; flip them from the console with `__dcSetProps(__dcRootName(), { premiumUnlocked: true })`.

**The prototype's mock data is not reality.** Real feed values differ in ways that change the UI (see below) — always check the live feed before treating a prototype number as a requirement.

## Product principles that are load-bearing

Honesty affordances are architecture, not decoration: every number carries its age and a freshness verdict; stale feeds get ESTIMATED rather than silently rendering as live; leave-by times freeze behind a stale banner rather than drifting. This is the same system as the feed-health alerting — `/health/feeds` and the app's staleness banner read the same data.

Design fidelity is the contract: colors, type scale, spacing, copy and animation curves in the prototype are final. Tabular numerals on every wait/time number.
