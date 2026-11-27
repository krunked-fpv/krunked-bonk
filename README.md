# KRUNKEDBONK

**KRUNKEDBONK** is a kinetic 3D roguelike arena survivor built with TypeScript, Three.js, and Web Audio. Carve down slopes, bunny-hop across low-poly realms, grind spline rails, trigger huge on-hit item chains, and survive escalating waves and multi-tier boss encounters directly in your browser.

## Highlights

- **Deterministic 50 Hz Simulation**: Fixed-timestep physics (`dt = 0.02s`) decoupled from rendering, supporting smooth 30/60/120/uncapped interpolation plus a **Classic 50Hz Snap** display mode.
- **Kinetic Movement**: Quake-style air strafing, downhill crouch-sliding (up to 2.4x boost), bunny-hopping, coyote time, jump buffering, wall-climbing, spline rail grinding, and jump pads.
- **Deep Roguelike Arsenal**: 21 playable characters, 30 auto-firing & skill weapons, 26 stat tomes, 87 trigger-hook items, 52 enemy archetypes, 3 multi-tier realms (Forest, Desert, Graveyard + Crypt) plus the Final Boss arena with 11 pylons, 12 world interactables, 8 meta-shop upgrades, challenges, cosmetics, and quests.
- **Stylized Visuals & Retro Pixel-Gothic HUD**: Gooch/cel-shaded toon rendering with inverted-hull black ink outlines, crisp pixel-palette atlases, and first/third-person camera toggle (`FOV 70°–120°`, default `110°`).
- **Zero-Dependency Runtime**: Plays 100% standalone using built-in procedural meshes, textures, and synthesized Web Audio, with optional support for local user-provided Custom Asset Packs.

## Controls

### Keyboard & Mouse

| Action | Default Binding |
| --- | --- |
| Move | `W` `A` `S` `D` / Arrow Keys |
| Look / Aim | Mouse (Pointer Lock in gameplay) |
| Jump / Bunny-Hop / Wall-Climb | `Space` |
| Crouch-Slide | `Left Shift` / `Left Ctrl` / `C` |
| Interact (Chests, Shrines, Portals) | `E` |
| Toggle 1st / 3rd Person Camera | `V` / `F5` |
| Toggle Full Map | `M` / `Tab` |
| Pause / Build Inspector | `Esc` / `P` |
| Draft Choice (Level-Up / Chest) | `1` `2` `3` / Click |
| Reroll / Banish / Skip | `R` / `B` / `X` |

### Gamepad (Xbox / PlayStation / Switch Pro / Steam Deck / Tesla)

KRUNKEDBONK features full plug-and-play controller support with a `0.15` radial stick deadzone, an in-game calibration wizard (profile preset, deadzone, sensitivity, invert-Y, vibration), and **100% gamepad UI navigation** across title, character select, map select, shop, level-up drafts, and pause menus.

| Action | Xbox / Steam Deck / Tesla | PlayStation | Nintendo Switch |
| --- | --- | --- | --- |
| Move | Left Stick | Left Stick | Left Stick |
| Look / Camera | Right Stick | Right Stick | Right Stick |
| Jump / Confirm UI | `A` / `LB` | `Cross` / `L1` | `B` / `L` |
| Crouch-Slide / Back UI | `B` / `LT` | `Circle` / `L2` | `A` / `ZL` |
| Interact | `X` / `RB` | `Square` / `R1` | `Y` / `R` |
| Toggle 1st / 3rd Camera | `Y` / `R3` | `Triangle` / `R3` | `X` / `R3` |
| Full Map | `View` / `Select` | `Share` / Touchpad | `Minus` |
| Pause | `Menu` / `Start` | `Options` | `Plus` |
| Navigate Menus | D-Pad / Left Stick | D-Pad / Left Stick | D-Pad / Left Stick |

### Touch Controls (Mobile / Tablet / Tesla Touchscreen)

The transparent on-screen Touch Overlay is **strictly touch-activated**:

- Completely hidden (`pointer-events: none`) on desktop mouse, keyboard, and gamepad sessions.
- Automatically activates on genuine touch input (`touchstart` / `pointerType === 'touch'`), providing left/right virtual sticks plus Jump, Slide, Interact, Camera, and Pause buttons.
- Automatically hides again when keyboard, mouse, or gamepad input resumes.

## Custom Pack Loader

KRUNKEDBONK ships with a complete procedural visual and audio suite so no external files are required. You can optionally load a local user-owned custom pack:

1. **Development Server**: If a local `.krunkedbonk-assets/` directory exists in the project root, `vite` serves it in dev mode only at `/__custom_pack__/*` (it is gitignored and never bundled into `dist/`).
2. **In-Browser Pack Loader**: Open **Settings → Custom Pack** to load a local pack folder or `manifest.json` bundle directly in the browser session.

## Development Scripts

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run play         # Start local server on http://127.0.0.1:5173 (strictPort)
npm run typecheck    # Run strict TypeScript checks (tsc --noEmit)
npm run test         # Run Vitest unit test suite
npm run verify:assets # Validate procedural assets & pack contracts
npm run verify:sim   # Run headless deterministic simulation checks
npm run verify       # Run test + verify:assets + verify:sim
npm run build        # Build static production bundle into dist/
npm run extract      # Optional local custom pack builder (local dev only)
npm run oracle       # Optional local data schema checker (local dev only)
```

## Static Deployment

`npm run build` produces a self-contained static bundle in `dist/` configured with `base: "./"` for direct hosting on GitHub Pages or any static file host.
