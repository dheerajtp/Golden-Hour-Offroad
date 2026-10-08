# Offroad Game — Confirmed Intent

Interview date: 2026-10-08. Confirmed by user (explicit yes).

## Outcome
A playable browser game — a golden-hour, low-poly open-world offroading
sandbox you can drive in within minutes of opening it.

## User
The user and a few friends, playing from their own machines. No accounts.

## Why now
The visual target is already locked (see "Visual target" below) and Kenney
assets are picked. The gap was everything around the visuals: the game loop,
the world, and playing together.

## Success
You send a friend a code, they appear in your world, you both drive one of
3 era-distinct 4x4s over the same carved trail, see each other, and can pull
up to a marked start gate for an instant 3-2-1 race to the finish — while the
sun sets through the exact palette below.

## Constraint (binding)
Zero backend. Static files + WebRTC P2P (free public signaling),
host-authoritative. Playable from the user's own machine now; static hosting
(GitHub Pages / itch.io) later. Vanilla JS + Three.js, Kenney assets only.

## Out of scope (v1)
- Lobby/menu UI, matchmaking, accounts, persistence/save games
- Scoreboards/leaderboards, damage/repair
- Player-vs-player collisions
- Mobile controls (desktop keyboard first)
- Dedicated game server (may move to a free tier later)

## Gameplay confirmed in interview
- Free roam together is the core; competition is opt-in at marked zones on
  the trail (no lobby, no UI chrome): drive into a start gate with a friend,
  3-2-1 countdown, first to the finish line wins, then back to free roam.
- Garage of 3 era-distinct trucks (60s/70s/80s), same physics model with
  tweaked grip/speed/bounce numbers. All unlocked.
- Full day/night cycle: dawn → golden hour (default spawn) → dusk → night
  (dark blue sky, dim moonlight, lit cabin windows) → dawn, looping.
- One large open-world map: rolling hills, a network of winding dirt trails
  you can leave and roam freely, dense clustered forest, rocks, several
  cabins/landmarks in clearings, ambient AI trucks driving around (no
  collisions, no scoring impact). Sightlines full of scenery in every
  direction, fading into fog.

## Visual target (match this look — from user)
- Camera: third-person chase cam, ~7 units behind and ~3 above the vehicle,
  FOV 58, looking slightly above the vehicle so the trail ahead is visible.
  Smooth follow with a slight lag on turns.
- Shading: flat/low-poly, MeshLambertMaterial (no textures, no outlines),
  one warm directional light (#FFD9A0) plus a HemisphereLight
  (sky #FFB88A, ground #C9A24B).
- Palette: grass #D9A441 (golden), dirt trail #7A5A3A, pine green #2F6B4A,
  autumn tree #E8C23A, cabin roof #B8442E, rock #8A7F73.
- Sky: vertical gradient from peach #FFC9A0 at the horizon to soft orange
  #F08A5D above. Fog color equals the horizon color, near 60, far 260, so
  distant hills fade into haze in 3 to 4 visible layers.
- Terrain: rolling hills with a winding dirt trail carved into the height
  map (lower, brown vertex colors along a spline path).
- Trees: tall stacked-cone pines (3 tiers) in dark green, mixed ~1 in 5
  with yellow autumn trees, scattered in clusters, not evenly.
- Vehicle: SUV with a roof rack, cargo box and a spare tire on the back in
  a contrasting color. Wheels spin, the body bounces on bumps.
- Landmarks: a few red A-frame cabins placed in clearings, and slow AI
  trucks driving along the trail as ambient convoy traffic.
- Golden hour is the default time of day; the day/night cycle should pass
  through this look at sunset.

## Assets
Kenney.nl asset packs only (free, CC0). Download into `assets/kenney/`.
