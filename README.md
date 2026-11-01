# Inkscroll

*A painting that never ends.*

An endless pixel-art Chinese landscape in the blue-green style (青绿山水):
azurite peaks over malachite slopes over ochre feet, rising out of a lake.
You can pan through it forever. While you watch, the afternoon turns
golden, the sun sets, and night comes with stars, a moon on the water, lit
windows, fireflies and sky lanterns. There are waterfalls, sailing boats,
crane flocks, chimney smoke, drifting mist and clouds, and the occasional
rain shower.

Landscape generator after [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf)
by Lingdong Huang (MIT; see `THIRD_PARTY_LICENSES.md`).

- Live: https://ink-scroll.vercel.app
- Five seeds at afternoon, sunset and night: `/seeds.html`
- The port's geometry beside the original: `/compare.html?seed=123456`
- Tuning panel with a time-of-day scrubber: `/?debug=1`

The first version drew the same world in ASCII; it's tagged `ascii-v1`.

## Controls

| Input | Action |
| --- | --- |
| Wheel / trackpad | Scroll horizontally (vertical wheel maps to horizontal) |
| Drag | Pan, with light inertia |
| Tap the sky | Release a lantern |
| Tap or hover the lake | Ripples |
| ← / → | Step; hold to glide |
| Space | Toggle auto-drift |
| T | Skip to the next part of the day |
| N | New painting |
| S | Save the view as a `.png` |

`/?seed=123456&x=4800` restores an exact painting and position, and the URL
follows you as you scroll. `&time=0.76` pins the time of day (0 is
midnight, 0.5 noon, 0.76 sunset). `?whimsy=1` brings back the original's
"Pizza Hut" sign and transmission towers.

## How it works

```
worker:  planner -> generators -> rasterizer -> colouriser -> sprites   (palette indices)
main:    sky + sun/moon/stars + clouds + far silhouettes
         + background chunks + foreground chunks (graded palette)
         + boats, birds, smoke, lanterns, fireflies, ripples, mist, rain, glow
         -> one small image, scaled up with crisp pixels
```

- **World (`src/world`).** A function-by-function TypeScript port of
  shan-shui-inf, keeping its names. The generators emit typed primitives
  instead of SVG. Every plan chunk and every placement has its own seeded
  stream, so the world doesn't depend on scroll history. Two additions to
  the original: waterfalls on some mountains, and chimney points on houses.
  Both are drawn after the original's random calls, so they don't shift its
  shapes.
- **Rasterizer.** A pure-TS scanline filler at 2×2 samples per pixel. It
  writes ink, opacity, top material, depth, mist, and a **line map** of the
  outlines the generators mark (ridges, banks, trunks, eaves), which become
  1-px ink outlines.
- **Colouriser (`src/render/build.ts`).**
  - Mountains take their hue from height above their own base (ochre →
    green → teal → azurite), their shade from the hatching ink, and haze
    from distance and mist.
  - Empty space below the waterline is lake, with reflections mirrored
    under every shore.
  - Ordered dithering is used only on the seams between colour steps.
    Dithering everything looked like a screen door.
- **Palette (`src/pixel/palette.ts`).** Chunks store indices into about 170
  colours. Each frame the scene grades the palette for the time of day
  (`src/pixel/timeofday.ts`) and colour-cycles the water and waterfalls.
  That's why the whole world can go from noon to night without rebuilding a
  chunk.
- **Scene (`src/render/scene.ts`).** Composites everything into a 480×300
  image (at 1440×900) and scales it up 3× with `image-rendering: pixelated`.
- **Sprites (`src/pixel/sprites.ts`).** Hand-drawn figures and boats.
  Pagodas and pavilions are built from tiers, so each one is a little
  different.

## Measured

| Check | Target | Measured |
| --- | --- | --- |
| Chunk build in worker (mean) | < 60 ms | ~30–45 ms (foreground ~52 ms, background ~10 ms) |
| Frame time, every effect on, p95 | < 16 ms | ~5 ms (headless Chrome, 1440×900) |
| Blank columns during 60 s fast scroll each way | 0 | 0 |
| JS gzipped, main page incl. worker | < 80 KB | ~35 KB |
| Lighthouse accessibility | ≥ 95 | 100 (performance 100, best practices 100) |

`node scripts/e2e.mjs <url>` runs these checks and the input, URL, export
and reduced-motion checks in headless Chrome.

## Develop

```sh
npm install
npm run dev
npm test                                   # Vitest: determinism, whimsy
node scripts/e2e.mjs http://localhost:5173 [--quick]
```

## Decisions

- **Pixel art instead of ASCII,** at Brandon's request. The world, the
  determinism, the controls, the URL state and the seal carried over; the
  renderer was replaced. The PRD's ASCII-specific rules (character sets,
  under 3% of cells changing a second, `.txt` export) no longer apply. The
  goal now is that the scene is always visibly alive.
- **Blue-green landscape style** rather than ink grays. It's a real
  tradition of Chinese landscape painting, and it gives a limited, coherent
  palette, which is what makes pixel art read.
- **A day lasts 4 minutes and a visit starts in the golden afternoon,** so
  sunset arrives within a minute and night within two. `T` skips ahead.
- **Integer pixel scale,** chosen so about 300 rows fill the height. Short
  screens crop mostly sky; tall screens get more sky.
- **Reduced motion:** the light holds at afternoon and animation time
  stands still (mist, water, clouds, particles). There's no drift, reveal,
  birds or rain. Scrolling and `T` still work.
- **Name: Inkscroll,** at `ink-scroll.vercel.app` (`inkscroll.vercel.app`
  belongs to an unrelated site).

## Open questions from the PRD, answered for this version

- **Standalone or a section of another site?** Standalone, so the bar and
  shortcuts exist.
- **Dark mode?** The day–night cycle is the dark mode.
- **Hovering a figure, boat or pavilion?** Tapping the sky releases a
  lantern and the lake ripples under the cursor. Figures don't do anything
  yet.
- **Seal?** The seed number, which reproduces the painting.
- **Vertical hanging scroll?** Still a v2 idea; it needs a new planner.

## Not verified here

- Safari, Firefox and a real iPhone. Checked at real CSS widths in headless
  Chrome only.
- A Performance-panel trace on a MacBook Air.
- Taste. Brandon's call, starting at `/seeds.html`.
