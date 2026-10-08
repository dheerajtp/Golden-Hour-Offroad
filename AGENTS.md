# AGENTS.md — Golden Hour Offroad

Browser-based golden-hour low-poly offroading game. Vanilla JS ES modules + Three.js, zero backend, no build step.

Scope and design decisions: see `docs/intent/offroad-game.md` (source of truth — read it before changing gameplay or visuals).

## Run

```sh
python3 -m http.server 8080   # from repo root, then open http://localhost:8080
```

No npm, no bundler required. ES modules load directly from the browser. Vendored libraries in `vendor/`:

- `three.module.js` + `three.core.js` (Three.js r0.180.0) — pinned via import map in `index.html`: `"three": "./vendor/three.module.js"`
- `loaders/GLTFLoader.js`, `utils/BufferGeometryUtils.js` — relative imports; keep directory layout
- `peerjs.min.js` (PeerJS 1.5.4, UMD global `Peer`) — loaded as classic script before the module script

## Bundle sanity check

Not needed to run, but catches syntax/import errors instantly:

```sh
npx esbuild src/main.js --bundle --alias:three=./vendor/three.module.js --outfile=/tmp/bundle.js
```

## Architecture

```
index.html            import map, session panel (#panel), race HUD (#raceHud, #raceToast),
                      rest hint (#restHint), fade (#fade), touch controls (#touch), peerjs script
src/main.js           boot + game loop + wiring; debug hook window.__game
src/config.js         PALETTE, WORLD, TIME, CAMERA, GARAGE, LIGHT_GAIN, HEADLIGHT, REST, ANIMALS, FOOT, WATER,
                      CONFIG (quality + atmosphere flags)
src/world/terrain.js  height grid, trail spline (Catmull-Rom loop), heightAt(), trailWeightAt(), trailPoint(u),
                      water carve passes (lake/pond/tidepools/stream+ford/cliff+gorge/rim/beach — trail carve
                      first, gorge/cliff use nearest-sample-only drops), isWater(x,z), slopeAt(x,z), `terrain.water`
src/world/water.js    buildWater(terrain) → discs (lake/pond/tidepool), stepped stream quads + chute box +
                      falls foam, reeds/driftwood/shells, gorge rock rows; updateWater(group, t) (foam flicker,
                      reed sway, fall pulse) — no dynamic lights
src/world/sky.js      gradient+stars ShaderMaterial dome, keyframed sun/hemi/fog, nightFactor, follows camera;
                      moon disc+glow (opposite sunDir, night fade, CONFIG.atmosphere.moon)
src/world/atmosphere.js  makeAtmosphere(terrain) → {group, flags, counts(), visible(), update(dt, ctx)}:
                      camera-anchored clouds (drift 1.2 u/s, lerp fog→white .45), 3 bird flocks (V-quads,
                      circular r70 @9 u/s, 6 Hz flap, morning/golden full / day ≤2 / night 1 @op .5),
                      10 mist quads (radial tex, lake/stream/valley anchors, forced within 90 of player),
                      shooting star (90 u/s, life 0.9 game-s, 25–60 s at night, `fireStar()` debug trigger,
                      `starState()`), fireflies (40/26/16 additive glow quads, night only, water/off-trail
                      ring 8–55, blink 0.4–1.1 Hz, wander, despawn >70),
                      rain streak cylinder around camera (300/200/100, r42 h46, windows 0.22–0.44 +
                      0.68–0.86, slant 0.35 rad, tint fog→white .4),
                      rainbow half-ring (r118 opposite low sun, 6-band canvas tex, active while raining
                      with sun elev < 12–28°, anchored player at 125), autumn leaves (48/34/20 gold
                      quads, orbital drift around player, golden window 0.60–0.87),
                      chimney/campfire smoke (24/12/6 puffs, DoubleSide billboards from the 12
                      cabin-roof + fire-pit sources passed to makeAtmosphere(terrain, smokeSources),
                      rise 6–9 u, pad 0.5→2.5, windows 0.16–0.50 + 0.60–0.96),
                      butterflies (28/22/16 colored DoubleSide quads, camera-billboarded + rotateZ
                      roll, lazy ring 6–30 off-trail spawn, flutter flap 24 Hz, day only nf < 0.55,
                      fade near cutoff); local-only, not networked
src/world/regions.js  regionWeights/regionAt/weightOf(name,x,z) from `REGIONS` (config.js): w=smoothstep(1-(d-r)/blend),
                      normalized on overlap, "in region" = dominant w>0.5 else 'autumn'. Stage E: pine-highlands
                      (-40,255 r50 blend40) = green grass + snow above h5.0 (terrain.js, skips trail mask>=0.5),
                      +8 extra pine clusters w/ own rng 5150 and no autumn trees (forest.js), fog lerp toward
                      0xd8e4ee/50/220 max .5 after morning fog (main.js), first-entry toast, `__game.region()`.
                      Stage F: beach-coast (95,15 r50; sand tint, forest keep .3) and misty-valley (-55,50 r55;
                      olive tint, keep .7, fog 0xe8eef2/25/170 max .85); region fog loops every REGIONS[*].fog.
                      Stage G: desert-mesa (-140,90 r45; tan tint, keep .15, fog 0xffcf9e/55/230 max .45).
src/world/regionProps.js  async buildRegionProps(terrain): 18 Kenney nature-kit palms on the beach (primitive
                      fallback), lake-shore jetty + canoe (beach) and dock (misty) via shoreAt(angle), 48 instanced
                      misty reeds, H4 dock dressing (rowboat + 9 string-light bulbs on end posts for both docks; bulb colour via updateRegionProps(group, nightFactor), no real lights) and a beach hammock, 16 cacti + 6 stacked terracotta-tinted rock formations in the mesa; `__game.regionProps()` (userData palms/reeds/docks)
src/world/structures.js  async buildStructures(terrain) (Phase 3 H1): trail-aligned, VISUAL-ONLY (no colliders; truck height is
                      still heightAt): wooden ford bridge u0.62 (deck +0.26 above the 0.22 ford water, wheels sink
                      slightly), stone gorge bridge u0.90 with piers, rock tunnel arch u0.73 (8.6 m clear). Sites in
                      `STRUCTURES` (config.js); one merged mesh per material; `__game.structures()` (userData.items).
                      H2: windmill (u~0.20, spinning rotor via updateStructures(structs, dt)) + barn with paddock
                      fence (u~0.24); off-trail sites from planSites(terrain, avoid) (called before the forest, added to
                      avoidSpots; >=24 m from cabins/tents/garage, >=30 m from race gates, outside regions/water/slope);
                      `__game.sites()`.
                      H3: ruins (broken walls + hollow watchtower, u~0.50) via planSites; lighthouse on the lake shore
                      (shoreAt angle 0.7, 5 m inland; sited by height, not isWater) with lamp colour + rotating
                      additive beam driven by updateStructures(structs, dt, nightFactor) (night only, no real light)
src/world/forest.js   instanced pines + autumn trees (avoids cabin positions)
src/world/props.js    hollow A-frame cabins (door opening, emissive interior: rug/bed/table/lamp,
                      night-lit windows), 2 designated campsites (tent + stone-ringed campfire +
                      log seats + picnic table), scenery (logs, stumps, signposts, lantern posts,
                      mushrooms, hay/pumpkins, dead ridge trees, firewood, mailboxes, mile markers,
                      benches, instanced bushes/ferns `bushes`, flowers); 1 re-targeted night
                      PointLight on nearest campfire; updateProps(props,
                      nightFactor, playerPos, dt); seeds 9001/9021/31337
src/world/animals.js  procedural low-poly deer + rabbits (graze/wander/flee/lie-down)
src/world/traffic.js  4 ambient AI trucks driving the trail loop (headlight glow at night)
src/world/raceZone.js marked start/finish gates (trail u 0.33/0.45), countdown state machine, net hooks
src/world/garage.js   open-front shed near spawn + 3 slot coords; parked trucks = the two ids
                      you are NOT driving (local-only display, refreshed on every switch)
src/vehicle/truck.js  GLB → scaled chassis, wheels, accessories, headlight rig (local: 2 SpotLights + lens quads)
src/vehicle/drive.js  arcade physics: speed, yaw, suspension bounce; keys Set (INPUT-guarded)
src/vehicle/foot.js   makePerson() shared box avatar + Walker (exit truck, walk/sit/lie; A/D turn, W/S move)
src/vehicle/chaseCam.js  chase camera (7 back, 3 up, FOV 58); walk (4.2/2.1) or frame override
                      {back:2.1, up:1.5} within 7 m of cabin/tent; sit/lie framing (pitch 40°/65°)
src/vehicle/assets.js GLTF loader + texture resolution
src/net/session.js    PeerJS session: host (id `gh4x-<CODE>`) / guest, star topology relay
src/net/remoteCars.js interpolated remote player cars; on-foot avatar (makePerson) when s.f set
src/ui/hud.js         session panel (M key), race countdown HUD, result toast, contextual hint (setHint)
src/ui/touchControls.js  mobile buttons (gas/steer/brake/trucks/L/F/fast/menu); auto on coarse pointers or ?touch=1
```

Game loop order (in `frame`): sky clock → sky.update → driver-or-walker → chase (mode-aware) → traffic → remotes → props → water → race zone → send net state → render.

Two dt values: `rawDt` (≤0.25s, wall-clock) drives the sky/day clock, race timers, net send timers; `dt` (≤0.05s) drives physics and interpolation. Headless/low-fps machines still get correct time-of-day.

## Conventions

- **Forward vector**: `(sin yaw, 0, cos yaw)`. Right turn → yaw **decreases**. Front-wheel steer visual: `rotation.y = -turn * 0.5`.
- **Height**: `terrain.heightAt(x, z)` bilinear; `trailWeightAt(x, z)` 0..1 trail proximity (dirt blend + speed assist). Use both — never raycast.
- **Trail**: `trailPoint(u)` → `{pos, tan, y}`, u wraps 0..1. Race gates, spawn, traffic all derive from u.
- **Lighting**: Three.js physical lights divide by π → keyframe intensities in `TIME` are multiplied by `LIGHT_GAIN = 3.5` in `sky.js`. If you retune keyframes, keep the gain in mind.
- **Wheel order on Kenney GLBs**: YXZ euler; model forward = **+Z** (front wheels at +z). Wheel names `wheel-front-*`/`wheel-back-*`.
- **GLB textures**: uri `Textures/colormap.png` relative to GLB — keep `assets/kenney/car-kit/Textures/colormap.png` in place.
- **Keys**: 1/2/3 switch trucks (blocked on foot), hold T = 25× time, M = session panel, L = headlight override
  (auto→forced→auto cycle), E = rest/camp at anchor (night only, host-authoritative time jump to 0.30),
  F = exit truck / get in / sit → lie → stand (exit needs |speed| < 0.8 && zone idle).
  All key handlers early-return when `e.target.tagName === 'INPUT'`.
- **Headlights**: auto-on when `nightFactor > 0.2` (HEADLIGHT config). Local truck = 2 real
  SpotLights (intensity × LIGHT_GAIN not needed — spot intensities live in HEADLIGHT) + emissive
  lens quads; remote/traffic trucks = lens glow only. `setHeadlights(nightFactor, manual, dt)`.
- **Rest**: rest anchors = 5 cabins + 2 tents, within 9 m at night (and zone idle) → hint → E/tap →
  fade → time jumps to 0.30 (tent anchor hint/toast says "camp"). Guests send `{t:'rest'}`; host
  executes and existing `tm` sync propagates.
- **Animals**: ambient only, NOT networked (like traffic). `animals.update(dt, playerPos, nightFactor)`.
  Flee within 12 m, bed down at `nightFactor > 0.7` beyond 15 m. Seeded via `mulberry32(777)`.
- **Mobile**: touch controls auto-enable on coarse pointers (or `?touch=1`); buttons inject into
  `driver.keys` (`KeyW/KeyS/KeyA/KeyD`) so physics is shared. Viewport locked, `touch-action: none`.
- **Foot**: `playerPos` = walker pos when out of the truck (sky/chase/animals/rest follow it); the
  `s` net message and race `actors` keep the **truck's** parked coords (`actors = []` on foot).
  `#restHint` tap = the hint's action (rest or F).
- **Garage**: on foot, nearest enterable target wins (current truck vs parked slot, 3.5 m) →
  `F — get in` / `F — enter <name>`; entering teleports the truck to the slot (drive out) and the
  old vehicle model returns to its slot. Digits 1/2/3 still switch in place while driving.
  Garage contents are per-player (local display only) — friends may see a different parked car.
- **Races**: only the **host** (or solo player) triggers zone state transitions and broadcasts `{t:'race', ...}` messages; guests mirror via `zone.applyNet`. Results identified by `actorId` (`'host'` or guest peer id).
- **Water**: lake `(20,20,r55,level −0.9)`, pond `(−195,−255)`, stream source `(−60,270)` → ford at trail u0.62
  (water 0.22 above trail = drivable shallow) → lake; `terrain.isWater(x,z)` (lake/pond/tidepool radius + stream <7)
  and `terrain.slopeAt(x,z) > 0.75` guard every scattered placement (forest/animals/props). Submerged bed vertices
  tint to `deepC 0x35485a` so translucent water still reads blue. Water = transparent Phong (opacity 0.78/0.8,
  depthWrite off, renderOrder 1) — the only geometry that renders over terrain.

## Netcode

Host-authoritative PeerJS (free public cloud signaling at 0.peerjs.com — internet required for multiplayer).

- Host: peer id `gh4x-<4-char code>`, relays every guest state to other guests (star topology).
- Message types: `hi/wel/s/tm/veh/race/rest` (see `session.js` `#handle`). The `s` payload gains
  optional on-foot fields: `f:1, wx, wy, wz, wyaw` (truck fields always present = parked coords).
- 15 Hz position state, 0.5 s time-of-day sync; guests lerp toward host clock.
- Races run on host; `zone.takeNet()` gives outbound messages → `session.broadcast`.
- Debug: `window.__game` exposes `{driver, sky, traffic, scene, camera, renderer, session, remotes, zone, animals, touch, walker, getTime, setTime, getVehicle, lightsMode, restReady, restKind, restSpots, campSpots, sight, onFoot, footAction, fires, flowers, hint, garage, parked, terrain, water}`.

## Assets

Kenney (CC0) — `assets/kenney/car-kit/` (`suv/van/truck/delivery` GLBs, `cone.glb`, wheels, colormap, `License.txt`).

## Testing

No test runner in repo. Headless verification lives outside the repo (previous session: `/tmp/opencode/pw/*.js`, Playwright with `chromium.launch({ channel: 'chrome', args: ['--disable-background-timer-throttling', ...] })`, pixel stats via pngjs). Model can't view images — verify visuals via pixel statistics. Scripts: `test.js`/`struct.js` (solo regression), `mp.js` (two-context multiplayer E2E: join, sync, race mirror, leave), `features.js` (headlight auto/L-toggle + full-frame pixel proof, rest, animal lie/flee), `touch.js` (mobile context `?touch=1`: all buttons, gas/steer/truck/fast/lights/menu/rest), `mprest.js` (guest rest request → host time jump → guest converge), `foot.js` (exit/walk/enter, sit camera, rest from sit, networked walking avatar), `garage.js` (walk-up slot enter, parked models, digit in-place switch, MP model swap + race guard), `scenery.js` (prop counts, interior day/night pixel brightness, near-cabin camera override, signpost pixel proof, tent camp rest), `water.js` (geo: carves/shore/ford banks/gorge+cliff drops/isWater, trail regression vs snapshot, spawn y; pixel: water-on/off render diff + blue/white crops for lake/pond/fall/ford — rain/rainbow flags may be disabled for water crops), `structures.js` (7 structures, lamp day/night + beam spin, deck y = trail y, windmill spin, site clearances, on/off pixel diff, drive-through, camera NaN), `regions.js` (boot autumn, pine core region+toast+fog, back to autumn), `/tmp/opencode/pw/regions2.js` (beach/misty region+toast+fog, palms/docks/reeds/cacti/rocks built, desert region+fog), `atmos.js` (per-effect counts/flags/visible, morning fog 38/190→60/260, per-effect centroid pixel proofs, moon opposite sunDir, shooting-star fire/expiry/flag, firefly night/day + flag, rain/rainbow/leaves windows + pixels + flags, smoke/butterflies time windows + instance-targeted pixel proofs + flags, frame median).

Note: headless software rendering runs ~7–10 fps; zone waits need generous timeouts (15–20 s).

## Working rules for this repo

- The audit docs above are the baseline for "how it works today".
- DB inspection so far has been read-only (schema/config/aggregates, no personal data). Keep it that way unless explicitly told otherwise.

# Mandatory Engineering Workflow

## Audit Before Implementation

For every bug fix, feature request, behavior change, API change, database change, or architectural change:

**DO NOT IMPLEMENT IMMEDIATELY.**

First perform an audit of the existing codebase and determine how the requested behavior currently works.

The required workflow is:

1. Understand the requirement.
2. Locate the relevant routes/controllers/services/repositories/models.
3. Trace the current behavior end-to-end.
4. Identify the actual root cause or implementation gap.
5. Identify existing functionality that can be reused.
6. Identify security, tenant-isolation, RBAC, database, API, and backward-compatibility implications.
7. Determine the minimum correct implementation.
8. Report the audit findings.
9. Provide a copy-pasteable implementation prompt.
10. STOP and wait for explicit approval before modifying code.

Never modify source code during the audit phase unless the user explicitly asks to skip the audit and implement immediately.

---

## Required Audit Response

Before implementation, always provide:

### 1. Current Behavior
Explain what the system currently does.

### 2. Root Cause
Identify the actual technical reason for the issue.

Do not speculate. Inspect the relevant implementation first.

### 3. Affected Code
List the relevant:
- routes
- controllers
- services
- repositories
- models/schema
- middleware
- validators
- background jobs
- configuration

Only include files that are actually relevant.

### 4. Proposed Behavior
Explain exactly what the system should do after the change.

### 5. Implementation Approach
Explain the smallest safe implementation approach.

Consider:
- existing architecture
- tenant isolation
- authentication
- authorization/RBAC
- database integrity
- API compatibility
- backward compatibility
- existing patterns
- error handling

### 6. Risks / Edge Cases
Identify relevant edge cases before implementation.

### 7. Testing Plan
Describe how the implementation will be verified, preferably against the real running backend/database where available.

### 8. Implementation Prompt
After the audit, provide a complete copy-pasteable prompt that can be given to the implementation agent.

The prompt must contain:
- exact requirement
- relevant existing behavior
- root cause
- implementation constraints
- files/components to inspect
- things that must NOT be changed
- acceptance criteria
- testing requirements
- expected final report

### 9. WAIT FOR APPROVAL

After providing the audit and implementation prompt:

**STOP.**

Do not modify code.

Wait for the user to explicitly approve implementation.

Examples of approval:
- "implement it"
- "go ahead"
- "proceed"
- "use this prompt"
- "apply the fix"

Do not interpret questions or discussion as implementation approval.

---

# Implementation Phase

Only after explicit approval:

1. Re-read the relevant implementation and CLAUDE.md rules.
2. Implement the approved change.
3. Do not expand scope without approval.
4. Run relevant tests.
5. Verify against the real database/API when applicable.
6. Check for regressions.
7. Report:
   - files changed
   - implementation summary
   - tests performed
   - test results
   - database/migration changes
   - API/OpenAPI changes
   - remaining limitations

---

# Important: Do Not Mix Audit and Implementation

Never combine:

AUDIT + IMPLEMENTATION

in one step unless the user explicitly asks for immediate implementation.

The default behavior is:

AUDIT → REPORT → IMPLEMENTATION PROMPT → WAIT → IMPLEMENT → TEST → REPORT
