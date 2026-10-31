# Inkscroll

*A painting that never ends, written in text.*

An endless Chinese landscape scroll (mountains, mist, water, pines,
pavilions, boats and small travellers), drawn entirely in monospace
characters. You can pan through it forever, and it breathes quietly while
you watch.

Landscape generator after [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf)
by Lingdong Huang (MIT; see `THIRD_PARTY_LICENSES.md`).

- Live: https://inkscroll.vercel.app
- Five seeds side by side: `/seeds.html`
- The port's geometry beside the original: `/compare.html?seed=123456`
- Tuning panel and overlays: `/?debug=1`

## Controls

| Input | Action |
| --- | --- |
| Wheel / trackpad | Scroll horizontally (vertical wheel maps to horizontal) |
| Drag | Pan, with light inertia |
| ← / → | Step; hold to glide |
| Space | Toggle auto-drift |
| N | New painting |
| S | Save the view as `.txt` and `.png` |

`/?seed=123456&x=4800` restores an exact painting and position, and the URL
follows you as you scroll. `?whimsy=1` brings back the original's "Pizza
Hut" roof sign and transmission towers.

## How it works

```
worker:  planner -> generators -> rasterizer -> glyph mapper -> sprites
main:    chunk cache -> compositor (+ motion overlays) -> two canvases
```

- **World (`src/world`).** A function-by-function TypeScript port of
  shan-shui-inf's `index.html`, keeping the original names. The generators
  emit typed primitives instead of SVG strings. Every plan chunk and every
  placement gets its own seeded stream, `hash(seed, …)`, so a chunk's
  contents never depend on scroll history. The original shared one global
  `Math.random` and a global `planmtx`.
- **Rasterizer (`src/render/rasterize.ts`).** A pure-TS scanline filler, not
  an OffscreenCanvas: Canvas 2D anti-aliases edges, which corrupts
  colour-coded material ids. This one also runs under Vitest. It samples
  4×8 per cell; 4×4 dropped the original's 1–2 unit hairlines into dashes
  because cells are 7×13. It writes ink, opacity, top material, occlusion
  depth, and a **line map**.
- **Line map.** The generators mark structural strokes (mountain and bank
  outlines, trunks, eaves, far crests). Their centrelines are rasterized
  separately and hidden by whatever is painted over them. This is what
  makes ridges read as continuous `/ \ _ - ‾ |` runs. Edge detection on
  ink alone can't tell a ridge from the hatching beside it; the first
  renders were doubled, broken outlines in a gray field.
- **Glyph mapper.** Ridges come from the line map, one glyph thick
  (non-maximum suppression). Other edges must continue into a neighbour to
  become contour glyphs. Everything else uses the tone ramp
  `.',:;~-=+*x%#@` with error diffusion. Water, foliage and mist use their
  own sets. Ink gets lighter with distance, and the three darkest tone
  steps use the bold cut, like a brush pressed harder.
- **Compositor.** A background canvas (far mountains and mist, at 0.6×
  parallax) under a foreground canvas. Whole-cell scrolls shift the canvas
  onto itself and paint only the new strip; the sub-cell remainder is a
  CSS transform. Only cells whose glyph or tone changed are redrawn.
- **Motion** (`src/motion`) runs on its own noise, independent of the
  world seed: water shimmer, mist drift, foliage sway, breathing, boats,
  birds, hover ripple, reveal. Rates live in `src/config.ts`.

## Measured

| Check | Target | Measured |
| --- | --- | --- |
| Chunk build in worker (mean, browser) | < 60 ms | 43–53 ms (max ~220 ms: a worker's first chunk) |
| Main-thread frame work while fast-scrolling, p95 | < 16 ms | ~2 ms (headless Chrome) |
| Blank columns during 60 s fast scroll each way (~1,400 units/s) | 0 | 0 |
| Cells changing per second at rest | < 3% | ~0.3% mean, ~0.5% worst |
| JS gzipped, main page incl. worker | < 80 KB | ~32 KB |
| Chunk cache | < 30 MB | ~1.3 MB |
| Lighthouse accessibility | ≥ 95 | 100 (performance 100, best practices 100) |

Frame timings come from headless Chrome on an M-series Mac. Headless Chrome
paced rAF at 30 Hz during the long runs, so the figure is the work done per
frame, not a measured 60 fps. The PRD asks for the Performance panel on a
MacBook Air; that's a manual check.

## Develop

```sh
npm install
npm run dev                         # http://localhost:5173
npm test                            # Vitest: determinism, whimsy, rasterizer, mapper
node scripts/e2e.mjs http://localhost:5173 [--quick]   # browser acceptance checks over CDP
npm run ascii -- 123456 0 2         # print chunks as text in the terminal
```

## Decisions

**Name: Inkscroll** (`inkscroll.vercel.app`). "Ink and Characters" was the
working title. The product is an endless scroll in ink, and one short word
makes a clean repo, domain and seal.

**Font: JetBrains Mono**, subset to the glyphs in use (8.8 KB regular,
8.9 KB bold). IBM Plex Mono was the PRD's starting point, but it has no `‾`,
which the contour set needs to make a shallow ridge read as `_-‾`. Neither
font has `♣`, so foliage is `' ^ * ¥ % &`. Berkeley Mono is commercial and
wasn't considered.

**Interface extensions.** `Primitive` gains `alpha`: the original's colours
are a gray and an alpha, and one `ink` number can't hold an opaque light
gray. It also gains a third kind, `'line'`, for the line map. `ChunkGrid`
also carries `ink`, `depth` (so moving boats hide behind nearer hills) and
`flags`.

**Sprites.** Figures, boats, pagodas (`arch03`) and the small pavilion
(`arch04`) are hand-drawn, at least three variants each. Houses (`arch02`)
and terrace pavilions (`arch01`) are wider than six cells and keep their
geometry. Pagoda sprites run seven to ten rows, more than the PRD's two to
five, because a pagoda is a tall element, not a small one. Matching the
generator's footprint served the picture better.

**Mist** bands sit at four foreground depths and one background depth.
They're semi-opaque paper, so a farther mountain's foot dissolves before a
nearer one starts.

**Reduced motion** turns off what the PRD lists (shimmer, sway, breathing,
birds, ripple, scramble reveal). It also turns off boat bobbing and mist
drift, because those are motion too. Drift starts off; scrolling still
works.

**Short screens** (a phone on its side) can't show all 70 world rows, so
40% of the crop comes from the sky and 60% from the open water at the
bottom. The peaks stay in view.

## Open questions, answered

- **Name and domain.** Inkscroll, at inkscroll.vercel.app (above). A custom
  domain is Brandon's call.
- **Standalone or a section/background of another site?** Standalone, so
  the bar and keyboard shortcuts exist. To use it as a background later:
  hide `.bar` and `.seal`, and skip the key handlers in `main.ts`.
- **Dark mode?** No: paper only, for a single strong identity. Pale ink on
  black reads as a terminal, which is what this tries hardest not to look
  like. The colours are CSS tokens, so adding it later is cheap.
- **Should hovering a figure, boat or pavilion do more than ripple?** Not in
  v1. A poem line in the bar is a second UI surface, and the PRD's rule is
  that the painting is the page. Revisit after the taste review.
- **Seal: seed number, generated name, or fixed signature?** The seed
  number. It's the one fact worth carrying away: it reproduces the
  painting, and it matches the URL and the export filenames.
- **Vertical-scroll variant (hanging scroll)?** Worth a v2. The generators
  are horizontal-planner-shaped, so it's a new planner, not a flag. Out of
  scope here.

## Not verified here

- **Phase 2 taste gate.** "Five seeds reviewed side by side by Brandon" is
  his to do: `/seeds.html`.
- **Real devices.** Checked at real CSS widths in headless Chrome (390×844,
  844×390, 1440×900). Not run in Safari, Firefox or on an actual iPhone.
  The code avoids OffscreenCanvas and uses module workers, which current
  Safari (15+) and Firefox (114+) support.
- **Performance-panel trace on a MacBook Air.** Not run; the figures above
  come from page-side frame timing in headless Chrome.
