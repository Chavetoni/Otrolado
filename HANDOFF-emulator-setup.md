# Handoff: iOS simulator setup + VS Code debug config

Context for a fresh Claude session asked to review this work.
Repo: `/Users/danny/Desktop/Workspace/Projects/work/Otrolado` (Otrolado / CrossQ).
**Not a git repo** — there is no diff to read. The changed files are listed explicitly below.

## Original request

"How can we run an emulator to run/test/debug our app on VS Code, is it an extension
or something else?" This expanded into getting an iOS simulator working end to end,
because the machine had no Xcode and no Android SDK.

---

## 1. Repo changes to review (this is the entire code surface — 3 files)

### `.vscode/launch.json` (new)
One Chrome launch config, **"Debug app (web, Chrome)"**, targeting the
`react-native-web` build at `http://localhost:8081`.

- `webRoot` is `${workspaceFolder}` (monorepo root), **not** `packages/app`.
  Rationale: Metro's server root is the monorepo root — the served bundle path is
  `/packages/app/node_modules/expo-router/entry.bundle`. Verified by fetching the
  root HTML and reading its `<script src>`.
- `sourceMapPathOverrides` maps `http://localhost:8081/*` → `${workspaceFolder}/*`.

**⚠️ NOT VERIFIED — the main thing worth reviewing.** I confirmed the web bundle
*compiles* (Metro: 956 modules, ~5 MB dev bundle, 0 resolution errors, fetched over
HTTP on a scratch port 8082). I never launched this debug config and never confirmed
a breakpoint actually binds. The `sourceMapPathOverrides` entries are reasoned, not
tested. A reviewer should assume they may be wrong.

### `.vscode/extensions.json` (new)
Recommends `expo.vscode-expo-tools`, `msjsdiag.vscode-react-native`,
`dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`. Recommendations only — none are
installed, none are load-bearing.

### `package.json` (root, one line added at line 19)
```json
"dev:app:web": "pnpm --filter @otrolado/app web"
```
Inserted immediately after `dev:app`. Added via a Python script that preserves key
order; no other keys touched.

**Deliberately NOT done:** no Expo Tools launch config was written. Its debug-adapter
schema wasn't verified, and shipping a guessed config seemed worse than pointing at
*Add Configuration…*. Worth revisiting if a reviewer knows the correct shape.

---

## 2. Environment changes (outside the repo, but part of the work)

| Item | State |
|---|---|
| `xcodes-app` 4.0.5 | installed via Homebrew cask |
| Xcode 26.6 (17F113) | installed at `/Applications/Xcode-26.6.0.app` |
| `xcode-select` | switched from CommandLineTools → Xcode (user ran `sudo`) |
| iOS 26.5 runtime (23F77) | installed, 7.9 GB, `Ready`, 11 devices |
| Postgres 17 + Redis | started via `pnpm services:up` (Redis DB index 1) |

Xcode was installed via `xcodes` (Apple's developer-CDN channel) because the App
Store product page rendered without a Get button. Ruled out as causes, with evidence:
MDM enrollment, config profiles, Screen Time restrictions, store region, disk space,
OS version (26.5.2 ≥ the 26.2 the listing requires), architecture (arm64 ≥ M1).
Root cause of the App Store symptom was never definitively identified. The working
theory — that the Apple ID needed to accept the developer agreement at
developer.apple.com — is **unconfirmed**; the user completed that step and the
download then succeeded via Xcodes, so the App Store path was never retested.

---

## 3. Verified working

- API on `:3000`, `/v1/ports` → 200
- DB seeded: 85 ports, 1,274 wait observations
- Live CBP ingest tick: 85 records, 595 rows written, 0 parse errors
- **`observedSpreadMinutes: 0`** — the timezone canary from CLAUDE.md is clean
- Simulator `iPhone 17 Pro` boots; SpringBoard enumerated 26 apps
- Expo Go (`host.exp.Exponent`) installed into the simulator and survived a reboot
- Metro reaches `› Opening exp://192.168.1.223:8081 on iPhone 17 Pro`

## 4. NOT verified — the app has never rendered on screen

`expo start --ios` failed three times, always the same way:

```
xcrun simctl openurl <udid> exp://192.168.1.223:8081 → non-zero code 60
NSPOSIXErrorDomain code=60, Operation timed out
```

**Cause (evidence-based):** simulator post-install work still running.
`diskimagesiod` at 206% CPU for 20+ min unpacking the 7.9 GB runtime image, with
`update_dyld_sim_shared_cache` starved behind it at 1.7% CPU and 0 bytes written.
System load peaked at 42/64/53. Apps cannot launch until this completes — confirmed
by `openurl` timing out on a plain `https://apple.com` too, so it is unrelated to
Expo or the `exp://` scheme.

As of writing: both processes **still running**, load falling (18.5 / 35.6 / 43.6).

### Two wrong diagnoses I published before this one — do not trust them
1. **"First-boot race, fix by booting first."** Wrong. Rebooted the simulator and it
   failed identically.
2. **"SpringBoard is unresponsive."** Wrong, and based on a broken probe: I used
   `timeout 10 xcrun simctl …`, but macOS ships no `timeout` binary (no GNU
   coreutils). The command errored, grep counted 0, and I misread that as evidence.
   Any conclusion in the transcript resting on a `timeout`-wrapped command is void.

### Unrelated resource contention worth flagging
`avconferenced` (45% CPU), `cameracaptured` (7%), `VTEncoderXPCService` (10%), all
running ~16 hours. Something is holding the camera/video stack open. Not caused by
this work, but it is competing for CPU with the simulator.

---

## 5. Suggested review focus, in priority order

1. **`.vscode/launch.json` correctness** — the only untested artifact. Does the Chrome
   config attach, and do breakpoints in `packages/app/src/ranking.ts` bind? Are the
   `sourceMapPathOverrides` right given Metro's monorepo-root serving?
2. **Whether `HANDOFF-emulator-setup.md` and `.vscode/` belong in the repo at all**, or
   should be untracked local config. There is no `.gitignore` entry for `.vscode`.
3. **Finish the launch** once `diskimagesiod` and `update_dyld_sim_shared_cache` exit:
   ```bash
   pnpm --filter @otrolado/app ios
   ```
   Then confirm `/v1/ports` and `/v1/waits` requests appear in the API log — that is
   what proves the app reached the backend rather than rendering an empty shell.
4. **Expect `src/drive.ts` placeholder behavior on screen.** Straight-line distance ×
   distance-scaled speed; per CLAUDE.md it understates Colombia Solidarity badly.
   Not a ranking bug.

## 6. Background tasks left running in the originating session

- `bo1j1uhaa` — `pnpm dev:api` (Fastify, still up, polls CBP every 15 min)
- `bc3fev6c6` — watcher that prints when the two simulator post-install processes exit

Postgres and Redis were started with `brew services run` (not `start`, per CLAUDE.md —
`start` would re-register the login agent). Stop with `pnpm services:down`.
