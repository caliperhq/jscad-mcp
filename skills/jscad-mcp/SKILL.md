---
name: jscad-mcp
description: Use when working with .jscad files, building or modifying OpenJSCAD geometry, or when the user describes a 3D model they want to design, inspect, or debug using the jscad MCP server. Also use when the user asks to open the viewer, show the model, or navigate the file browser.
---

# jscad-mcp

## Overview

Close the perception loop when building OpenJSCAD models. After any geometry change, render and describe what you see — do not declare a change complete without visual verification.

A **web viewer** runs alongside the MCP server at `http://localhost:<port>/`. It opens automatically the first time you render anything in a session. If the user asks to see the model and no render has happened yet, call `open_viewer` first.

## The Loop

After every change that could alter geometry:

1. Call `take_standard_views` (file or inline code) — returns iso, front, side, top
2. **Describe each view in one sentence** — this is not optional; naming what you see is what makes errors catchable
3. Compare against the user's stated intent
4. If something looks wrong: drill in with `highlight`, `take_image`, or `list_parts`
5. Propose a fix → repeat

**Do not say "done" without completing this loop.**

Every render automatically pushes to the web viewer via SSE — the browser updates live without a page reload.

## When to Render

Render after: new primitive, dimension change, boolean operation added or removed, transform applied, new part added.

Skip for: variable renames, comment edits, refactors that don't affect geometry output.

## One Angle Is One Hypothesis

A single render is **one hypothesis about whether the model is right** — never a guarantee. The cutaway engine in the demo gallery shipped to `main` *four* times with bugs that the previous round of inspection couldn't see, because each bug was hidden behind the one in front of it. Each round taught a discipline lesson worth carrying into every model.

**Round 1 — more than two angles.** The conrod shipped lying flat on the floor along +Y, disconnected from the engine. The iso and the y-axis slice both looked plausible; the front view immediately exposed it (`atan2(dy, dz)` had been swapped to `atan2(dz, dy)`). *Lesson:* `take_standard_views` returns four for a reason. If you only describe iso + one slice, you have surveyed half the model.

**Round 2 — re-inspect after every fix.** Once the conrod was vertical, a second mismatch became visible: the crankshaft journal was running along the wrong axis. Invisible while the conrod was the dominant bug; obvious once it wasn't. *Lesson:* when one part is moving, **all the parts that touch it can be wrong in ways the rendering can't display until the first part stops moving.** Take a fresh set of standard views after every fix, not just at the end of a session.

**Round 3 — real-world references catch geometry that "looks plausible."** With the journal pointing right, three more bugs surfaced: the piston crown was computed *below* the wrist pin (sign error in the offset), the conrod bearings crossed the pins at a single line instead of being concentric (default cylinder axis was wrong), and the crank had no webs — the pin floated next to the journal with no physical connection. Each one read as "could be a styling choice" in isolation. *Lesson:* when the user has a real reference image (a measured part, a similar real-world assembly, a manufacturer's drawing), render against it. "Looks plausible" is a much weaker test than "matches this photo."

**Round 4 — ask 'could this physically work?'** Even with proper webs, the crank still had a single continuous main journal cylinder passing *through* the offset webs — geometrically impossible to rotate. Static views all looked correct; the failure was kinematic. *Lesson:* "looks right from every angle" is necessary but not sufficient. Ask **could this part physically rotate / slide / engage / fit through its mating hole?** before declaring an assembly done.

The same principle, four times: each iteration teaches you what you were unable to see in the previous one. Multi-angle inspection catches round 1. Re-inspection-after-every-fix catches round 2. A real-world reference catches round 3. Asking "would this work in the real world?" catches round 4. **Plan to iterate; don't plan to be right.**

## Tool Quick Reference

| Situation | Tool |
|-----------|------|
| First look / after any change | `take_standard_views` |
| Custom angle, close-up, or zoom | `take_image` |
| See inside a model / cross-section | `slice` |
| "What named parts does this have?" | `list_parts` |
| "Which blob in the image is the lid?" | `label_parts` |
| "Show me just the lid" | `highlight` |
| Open the web viewer in a browser | `open_viewer` |
| Verify MCP connection | `echo` |
| Confirm renderer is working | `render_test` |

All render tools accept either `file` (absolute path to a `.jscad`) or `code` (inline JSCAD source string).

**Render options** — every render tool accepts these optional parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `resolution` | `normal` | Named preset: `thumbnail` (320×240), `small` (480×360), `normal` (800×600), `large` (1280×960), `high-quality` (1920×1440) |
| `width` / `height` | — | Explicit pixel size — overrides `resolution` if both are given |
| `showGrid` | `true` | Show the reference grid |
| `showAxis` | `true` | Show the X/Y/Z axis lines |

Use `thumbnail` for quick checks during iteration; `large` or `high-quality` for detail inspection or final review. Set `showGrid: false` for clean export-style renders.

`slice` takes `axis` (x/y/z) and optional `offset` (default: model center on that axis). Shows the negative side of the cut; camera auto-orients perpendicular to the cut face.

`label_parts` renders the model with part names drawn directly on the image at each part's centroid, and also returns a text legend with pixel coordinates. Use this before `highlight` when you need to orient yourself in a complex assembly.

## Web Viewer

The viewer at `http://localhost:<port>/` provides an interactive 3D view alongside the MCP tools.

**What the user sees:**

- **File browser** (left sidebar) — lists `.jscad`/`.js` files rooted at the project cwd. Dotfiles are hidden by default; a `.hidden` toggle shows them. Clicking a file loads it into the 3D view.
- **3D canvas** — uses `@jscad/regl-renderer` with correct per-solid and per-face colors from the model. Orbit with drag, zoom with scroll, pan with shift-drag or middle-drag. Grid and axis can be toggled (bottom-left checkboxes).
- **Parts panel** — if the model exports a `parts` map, each part is listed with a color dot. Click to isolate (others fade out); click again to show all.
- **Thumbnail strip** (bottom) — every MCP render appears here in order. Click to enlarge.
- **editor ↗** (title bar) — opens the @jscad/web full editor in a new tab, pre-loaded with the current file and showing the cwd-relative filepath.
- **Live indicator** — green dot means the SSE connection is live; renders push automatically.

**When to call `open_viewer`:**
- User asks to "open the viewer", "show me the model", "open the browser" and no render has happened yet
- The viewer was closed and they want it back
- Starting a work session on an existing file before making changes

Don't call `open_viewer` redundantly — every render already broadcasts to an already-open viewer.

## Named Parts Convention

To unlock `list_parts`, `highlight`, and the parts panel in the viewer, the file must export a `parts` map alongside `main`:

```js
const body = () => subtract(cuboid({ size: [40, 30, 20] }), cylinder({ radius: 8, height: 22 }))
const lid  = () => translate([0, 0, 15], cuboid({ size: [40, 30, 10] }))

module.exports = {
  main: () => [body(), lid()],
  parts: { body: body(), lid: lid() }
}
```

Introduce this convention early when a user starts a new multi-part model. Without `parts`, only rendering tools work and the parts panel doesn't appear in the viewer.

## File Format

Files must use CommonJS (not ES modules) and export `main()`:

```js
'use strict'
const { primitives, booleans, transforms } = require('@jscad/modeling')
const { cuboid } = primitives

const main = () => cuboid({ size: [20, 20, 20] })

module.exports = { main }
```

The MCP calls `main({})` with no parameters — bake defaults into `main` so it works without a `getParameterDefinitions` UI:

```js
const DEFAULTS = { width: 20, height: 30 }
const main = (params = {}) => {
  const p = { ...DEFAULTS, ...params }
  return cuboid({ size: [p.width, p.width, p.height] })
}
```

`parts` is read as a static property at module load — precompute it with defaults:

```js
const buildAll = (params) => { /* returns { name: geom, ... } */ }
const _defaultParts = buildAll({})
module.exports = { main, parts: _defaultParts, getParameterDefinitions }
```

## Multi-file Projects and the Require-Cache Trap

Multi-file models (entry file `require`s `./block`, `./head`, etc.) hit a Node.js gotcha when iterating with the MCP. The evaluator busts the require cache for the *entry* file only — its sub-modules stay cached across MCP calls. Editing `head.js` and re-rendering the entry won't pick up the change; the old cached `head.js` keeps running.

**Symptom:** after a sub-module is updated, `main()` still returns the pre-update geometry (commonly: just the first/oldest module loads cleanly while later ones return `null` or stale shapes).

**Fix:** when iterating on multi-file designs, render via the `code:` parameter with an inline cache-bust:

```js
'use strict'
const path = require('path')
const DIR = '/abs/path/to/your/demo'
for (const f of ['block','head','piston','assembly']) {
  delete require.cache[path.join(DIR, f + '.js')]
}
const mod = require(DIR + '/assembly.js')
module.exports = { main: mod.main, parts: mod.parts }
```

This forces a fresh evaluation chain. Without it, multi-file iteration appears to silently ignore the user's edits.

Single-file `.jscad` files are not affected — the evaluator handles those correctly.

**Same trap, different layer — lib data changes.** A single-file `.jscad` that `require`s a generated data module (e.g. `./lib/litho_heightmap.js`, a marching-cubes table, a pre-baked grid) hits *two* layers of caching when its lib changes:

1. **The MCP's content-addressed PNG cache** is keyed on the input string (file content or inline-code text) + render params. If the entry file's text didn't change, it cache-hits and returns the previous render — even though the lib data on disk is new.
2. **The require cache** is keyed on file path. Even on a PNG-cache miss, the JSCAD evaluator's `require('./lib/...')` returns the lib module loaded on the *previous* call.

Defeat both by rendering via inline `code:` that (a) embeds a marker that differs from any previous render and (b) busts the require cache for the entry and its libs:

```js
'use strict'
const path = require('path')
const DIR = '/abs/path/to/examples'
// HARNESS-LEVEL marker: change this string each call after regenerating
// the lib (e.g. paste the lib's mtime or a counter). The MCP hashes this
// source verbatim, so a literal change here forces a PNG-cache miss.
// MARKER: 2026-05-27T14:48Z
delete require.cache[path.join(DIR, 'lithophane.jscad')]
delete require.cache[path.join(DIR, 'lib', 'litho_heightmap.js')]
const mod = require(path.join(DIR, 'lithophane.jscad'))
module.exports = { main: mod.main, parts: mod.parts }
```

Embedding the marker as a *runtime* value (`const m = fs.statSync(...).mtimeMs`) does NOT defeat the PNG cache — the cache hashes the source string, not what the source evaluates to. The marker must be a literal in the source the harness emits.

The clue you've hit this: "I regenerated the heightmap / table / mesh, re-rendered the file or ran the same inline code again, and got the *exact same image*."

## Parameter Sweeps and Animation Frames

The MCP tools don't accept user-defined parameters directly. To render a parameter sweep (e.g., 12 frames of a rotating crankshaft for a GIF), use inline `code:` that imports the model and calls `main` with the per-frame param:

```js
'use strict'
const mod = require('/abs/path/to/assembly.js')
const main = () => mod.main({ crankAngle: 120 })   // <-- the swept value
module.exports = { main }
```

Run one MCP call per frame (parallel is safe — each call hashes by content). Cache files at `.jscad-cache/*.png` are content-addressed; copy the most-recent N out by mtime after the sweep completes:

```bash
ls -t .jscad-cache/*.png | head -N
```

For a smooth GIF, stitch with ffmpeg:

```bash
ffmpeg -y -framerate 8 -pattern_type glob -i 'frames/*.png' \
       -vf 'scale=720:-1:flags=lanczos,palettegen=stats_mode=diff' /tmp/_p.png
ffmpeg -y -framerate 8 -pattern_type glob -i 'frames/*.png' \
       -i /tmp/_p.png -lavfi 'scale=720:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer' \
       out.gif
```

## Per-Part Coloring for Cutaways and Assemblies

For multi-part assemblies, especially ones that look monochromatic from the outside (engines, gearboxes, pumps), apply `colors.colorize()` to each part. The renderer respects per-solid colors (`overrideOriginalColors: false`). Distinctive colors make assemblies self-explanatory without labels:

```js
const { colors } = require('@jscad/modeling')
const { colorize } = colors

const PART_COLORS = {
  block: [0.55, 0.58, 0.62, 1],         // gray
  piston: [0.85, 0.55, 0.20, 1],        // copper
  intake_valve: [0.30, 0.55, 0.85, 1],  // blue
  exhaust_valve: [0.85, 0.30, 0.20, 1], // red
  intake_port: [0.50, 0.75, 1.00, 0.55],// translucent
}

const colorPart = (name, geom) => geom ? colorize(PART_COLORS[name], geom) : null
```

Translucent colors (alpha < 1) work for things like ports/voids that you want visible but not opaque.

## Heightmap / Thin-Relief Surfaces Render as Blank

A panel whose z variation is small relative to its xy extent — lithophanes, embossed plaques, terrain ribbons, anything that encodes information as surface relief — renders as a nearly featureless rectangle under the JSCAD renderer's diffuse lighting. From above, all surface normals point ≈ +Z and shading is uniform; from the side, only the silhouette of the edge profile is visible.

This is **not a bug in your geometry** — verify via `list_parts` that the bbox z range is what you intended (e.g. 0.6 → 3.0 mm for a real lithophane). The geometry is correct; it's that the renderer can't show what backlighting reveals.

To visualize relief in the render itself, use one of:

- **Grazing-angle camera** (`elevation: 2–5°`): the top profile silhouette becomes the brightness scan across that row.
- **Exaggerated relief** for the hero shot only: render with a much larger max thickness (`mod.main({ maxThickness: 15 })` instead of the printable `3`) so the diffuse shading reveals the encoded image. Be explicit in the doc caption that this view is amplified for visualization; the printable file ships at real thickness.
- **A `slice`** perpendicular to the panel: shows the variable wall thickness directly. May be too thin to read at default zoom — zoom in or use a high `resolution`.

Don't bump the printable defaults to make the render look better; ship the realistic thickness and use exaggerated renders only for documentation.

For the full image-input pipeline (raster → grayscale PGM → JS heightmap module → polyhedron), see the `jscad-examples` skill's `references/lithophane.md`. The cache-bust gotcha for "I regenerated the heightmap and got the same render back" is covered above in "Same trap, different layer — lib data changes".

## Related Skills

- **`jscad`** — code authoring reference: primitives, transforms, booleans, extrusions, parameters
- **`jscad-wiki`** — full API docs
- **`jscad-examples`** — real-world patterns from working designs

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Declaring geometry correct without rendering | Always run `take_standard_views` after changes |
| Skipping the description step | One sentence per view, every time |
| Using `take_image` for every check | `take_standard_views` covers the common case in one call |
| Not teaching `parts` convention upfront | Mention it when user starts a multi-part model |
| Trying to describe a complex assembly by position | Use `label_parts` to get part names at screen positions first |
| Reporting a render error as "done" | Evaluation errors return as text — check content type |
| Calling `open_viewer` when viewer is already open | Renders auto-push via SSE; `open_viewer` is for the first open only |
| Sub-module edits "have no effect" on a multi-file model | The MCP only busts the entry file's require cache. Use inline `code:` with `delete require.cache[...]` for each sub-module before re-rendering (see "Multi-file Projects and the Require-Cache Trap"). |
| Regenerated a lib data module (heightmap, table, mesh) and got the *same* render back | Two cache layers at play. Inline `code:` with `delete require.cache[...]` AND a literal marker that varies between calls (a timestamped comment). See "Same trap, different layer — lib data changes". |
| Heightmap / lithophane / embossed panel renders as a blank rectangle | Not a geometry bug — diffuse top-down rendering can't reveal small-z relief. Verify bbox z range with `list_parts`, then render at `elevation: 2–5°` (grazing) or with exaggerated thickness. See "Heightmap / Thin-Relief Surfaces Render as Blank". |
| Trying to render a parameter sweep without per-frame `code:` | MCP tools don't accept geometry params. Wrap each frame in an inline code block that calls `mod.main({ <param>: value })` (see "Parameter Sweeps and Animation Frames"). |
| Forgetting that `main` is called with `{}` | Bake defaults into `main` via `(params = {}) => { const p = { ...DEFAULTS, ...params }; ... }`. `getParameterDefinitions` only feeds the `@jscad/web` editor's UI. |
| Assemblies look like a single blob | Apply per-part `colorize()` with distinctive RGBA. The renderer keeps per-solid colors when `overrideOriginalColors:false`. |
