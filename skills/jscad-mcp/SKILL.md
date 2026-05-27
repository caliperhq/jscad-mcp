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

`take_image` and `take_standard_views` accept optional `width`/`height` (pixels, default 800×600). Use larger sizes for detail work.

`slice` takes `axis` (x/y/z) and optional `offset` (default: model center on that axis). Shows the negative side of the cut; camera auto-orients perpendicular to the cut face.

`label_parts` renders the model and returns a legend with each part name and its approximate pixel position — use this before `highlight` when you need to orient yourself in a complex assembly.

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
| Trying to render a parameter sweep without per-frame `code:` | MCP tools don't accept geometry params. Wrap each frame in an inline code block that calls `mod.main({ <param>: value })` (see "Parameter Sweeps and Animation Frames"). |
| Forgetting that `main` is called with `{}` | Bake defaults into `main` via `(params = {}) => { const p = { ...DEFAULTS, ...params }; ... }`. `getParameterDefinitions` only feeds the `@jscad/web` editor's UI. |
| Assemblies look like a single blob | Apply per-part `colorize()` with distinctive RGBA. The renderer keeps per-solid colors when `overrideOriginalColors:false`. |
