# Golden Hour Offroad

A golden-hour, low-poly open-world offroading game that runs entirely in the
browser. Zero backend, no build step — vanilla JS ES modules + Three.js.
Drive three era-distinct 4x4s over a carved trail through rolling hills,
race friends from marked gates, and watch the sun set over the world together.

Send a friend a session code and they appear in your world: free roam
together, then pull up to a start gate for an instant 3-2-1 race to the finish.

## Features

- **Open world** — rolling hills, winding dirt trail, dense forest, lake,
  stream & ford, gorge, beach, desert mesa, and landmark regions, all fading
  into fog
- **Full day/night cycle** — dawn → golden hour (default spawn) → dusk →
  night with moonlight and lit cabin windows → dawn, looping (60-minute
  cycle; time slows to a crawl while you're parked or sitting/lying)
- **3 trucks** — era-distinct 60s/70s/80s 4x4s (all unlocked), arcade
  physics with suspension bounce
- **Multiplayer** — free P2P (WebRTC via PeerJS), host-authoritative,
  share a 4-char code to join each other's world
- **Opt-in races** — drive into a marked start gate with a friend,
  3-2-1 countdown, first to the finish wins *(currently disabled for a
  stress-free session — set `RACE.enabled = true` in `src/config.js` to
  restore)*
- **On foot** — exit the truck, sit or lie down anywhere, rest at cabins &
  campsites (jumps time to early morning)
- **World life** — ambient AI trucks, deer & rabbits, cabins, campsites,
  windmill, barn, ruins, lighthouse, bridges, rock tunnel
- **Atmosphere** — clouds, birds, mist, shooting stars, moon, rain & rainbow,
  autumn leaves, chimney smoke, fireflies, butterflies. All toggleable via
  `CONFIG.atmosphere` in `src/config.js` (currently on: clouds, birds,
  morning fog, moon, shooting stars, rainbow; currently off: rain, mist,
  fireflies, leaves, smoke, butterflies)
- **Mobile** — touch controls auto-enable on coarse pointers (or `?touch=1`)
- **Sound** — procedural Web Audio (no audio files): wind & gusts, daytime
  birdsong, night crickets, engine note tied to speed, water lapping,
  campfire crackle, UI clicks and race countdown cues. Mute with `N` or the
  🔊 button (top-left on mobile); the setting is remembered

## Quick start (local)

No install required. Serve the repo root over HTTP (ES modules don't load
from `file://`):

```sh
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Any static file server works, e.g. `npx serve .`.

### Controls (desktop)

| Key | Action |
|---|---|
| `W` / `↑` | Gas |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `F` | Exit truck / get in / sit → lie → stand |
| `1` / `2` / `3` | Switch trucks |
| `T` (hold) | 25× time fast-forward |
| `L` | Headlights: auto → forced → auto |
| `E` | Rest at a cabin/camp at night (jump to early morning) |
| `M` | Session panel (multiplayer code) |
| `N` | Mute/unmute sound |

Mobile shows on-screen gas/steer/brake plus truck, enter/exit (`F`),
lights, fast, and menu buttons, and a 🔊 sound toggle (top-left).

### Multiplayer

1. Press `M` to open the session panel, host to get a 4-char code.
2. Friend opens the same build, enters the code, joins.
3. You now share the same world — positions sync at 15 Hz; races run on the
   host.

Requires internet for PeerJS's free public signaling (0.peerjs.com). All
gameplay itself is peer-to-peer.

## Deploy for free on GitHub Pages

The game is 100% static files with **relative paths only**, so GitHub Pages
can host it as-is — no build step, no Node, no CI required. The only
requirement is that everything in this repo (`index.html`, `src/`, `vendor/`,
`assets/`) is pushed to the repository, because the import map and asset
loader reference them relatively.

### 1. Push the repo to GitHub

```sh
cd over
git init
git add .
git commit -m "Golden Hour Offroad"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

(If the repo already exists remotely, just skip the `remote add` step and
push.)

### 2. Enable GitHub Pages

1. On GitHub, open your repository → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment**, set:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
3. Click **Save**.

### 3. Play it

After ~1 minute, the site goes live at:

```
https://<YOUR_USERNAME>.github.io/<REPO_NAME>/
```

Open it and you're driving. Every push to `main` redeploys automatically.

> **Project-site note:** on GitHub Pages your game lives at
> `/<REPO_NAME>/`, not the domain root. This works out of the box here
> because all URLs in `index.html` are relative (`./vendor/...`,
> `src/main.js`, `vendor/peerjs.min.js`). If you ever add an absolute path
> starting with `/`, it would break under the subpath — keep paths relative.

### Verify the deployment

- Page shows the loading screen, then renders the world.
- `M` opens the session panel and hosting generates a code.
- A friend on another machine can join with the code (both need internet
  for signaling).
- Append `?touch=1` to the URL to force mobile controls for a sanity check.

### Alternative: GitHub Actions deployment (optional)

If you prefer the modern "GitHub Actions" source instead of branch deploys,
create `.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then set **Settings → Pages → Source: GitHub Actions**. Same result — a
free static site — just with a workflow file instead of a branch deploy.

### Other free hosts

The same repo also deploys as-is to:

- **itch.io** — upload as an HTML5 project (embed, windowed)
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop the folder or
  connect the repo; zero config, no build command

## Sanity check (optional)

Catches syntax/import errors instantly without opening a browser:

```sh
npx esbuild src/main.js --bundle --alias:three=./vendor/three.module.js --outfile=/tmp/bundle.js
```

## Project structure

```
index.html          import map, HUD/session panel, touch controls, peerjs script
src/main.js         boot + game loop + wiring; debug hook window.__game
src/config.js       palette, world, time, camera, quality + atmosphere toggles
src/world/          terrain, water, sky, atmosphere, regions, forest, props,
                    animals, traffic, race zone, garage, structures
src/vehicle/        truck model, arcade physics, foot walker, chase cam, assets
src/net/            PeerJS session + interpolated remote cars
src/ui/             HUD/session panel, touch controls
vendor/             Three.js r0.180.0, GLTFLoader, BufferGeometryUtils, PeerJS
assets/kenney/      Kenney (CC0) car-kit / nature-kit / survival-kit GLBs
docs/intent/        game design source of truth
```

## Tech stack

- **Three.js** r0.180.0 (vendored, pinned via import map — no CDN)
- **PeerJS** 1.5.4 (vendored) — WebRTC P2P with free public signaling
- **Vanilla JS ES modules** — no npm, no bundler, no backend

## Credits

- Assets: [Kenney Game Assets](https://kenney.nl/assets) (CC0) —
  `assets/kenney/` (see each folder's `License.txt`)
- Libraries: [Three.js](https://threejs.org) (MIT),
  [PeerJS](https://peerjs.com) (MIT)

## License

Game code: see repository. Kenney assets are CC0.
