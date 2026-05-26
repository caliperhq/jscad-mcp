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
