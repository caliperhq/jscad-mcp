# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the MCP server (starts web viewer on a random port, logs URL to stderr)
node src/index.js

# Or via npm
npm start

# Install globally
npm install -g .

# Install skills (one-time setup for the local Claude Code instance)
SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"
cp -r skills/jscad-mcp skills/jscad skills/jscad-wiki skills/jscad-examples "$SKILLS_DIR/"
```

No test suite or lint config is present. Verify changes by running `node src/index.js` and exercising the MCP tools.

## Architecture

Four source modules, a plain HTTP web server, and a static frontend (`www/`):

```
src/
  index.js      — MCP tool definitions and server entry point
  evaluator.js  — loads and runs .jscad files; caches last result by mtime/hash
  renderer.js   — headless WebGL (gl npm package) → PNG via regl-renderer
  camera.js     — spherical → perspective camera matrix; STANDARD_VIEWS constant
  webserver.js  — HTTP server: SSE broadcast, REST API, static files
www/
  index.html / app.js / style.css  — live viewer UI (file browser, 3D canvas, thumbnail strip)
  viewer.html   — embeds @jscad/web full editor
```

**Data flow for a render call:**

1. MCP tool receives `file` or `code` parameter
2. `evaluate()` in `evaluator.js` runs the module, calls `main()`, normalises geometry into `{ solids, parts, bbox }`
3. `cameraFromAngles()` computes the view/projection matrices for the requested angle
4. `renderToPng()` draws via headless-gl + @jscad/regl-renderer, flips the framebuffer (GL is bottom-up), returns a PNG `Buffer`
5. `broadcastRender()` writes the PNG to `.jscad-cache/<sha256prefix>.png` and SSE-pushes metadata to any open browser tabs
6. The MCP tool returns the PNG as a base64-encoded `image` content block

## Key design details

**Module resolver intercept** (`evaluator.js:11–19`): `Module._resolveFilename` is patched so that `@jscad/*` imports in user `.jscad` files resolve to the MCP server's own `node_modules`, not the user's project directory. This is intentional — user files need no `npm install`.

**Inline code evaluation** (`evaluator.js:88–125`): `code` strings are written to a temp file next to `evaluator.js` (so Node resolves `@jscad/modeling` correctly), required, then deleted. The temp file path is `src/_eval_<hash>.js`.

**Single GL context** (`renderer.js:14–18`): headless-gl is a singleton (`gl` module). The `STACKGL_resize_drawingbuffer` extension is used to handle non-default image sizes without recreating the context.

**Result cache** (`evaluator.js:26`): a single `{ key, result }` slot. File key includes mtime so edits are picked up; code key is a hash of the source. Only one entry is kept — calling with a different file evicts the previous.

**Web server port**: `server.listen(0, '127.0.0.1')` binds to a random port. The port is written to `stderr` on startup and returned via `/api/info`.

**SSE replay** (`webserver.js:52`): new SSE clients immediately receive the last broadcast event so a freshly-opened tab shows the most recent render.

**`parts` convention**: files may export `module.exports.parts = { name: geom }` alongside `main`. This unlocks `list_parts`, `highlight`, `label_parts`, and the parts panel in the web viewer.

## .jscad file requirements

- CommonJS only (`require` / `module.exports`) — no ES modules
- Must export `main()` which returns a geometry object or array
- May export `parts` (object mapping names to geometries)
- May export `getParameterDefinitions()` for the @jscad/web UI
- `@jscad/modeling` is provided by the MCP server; no `npm install` needed in user project

## Skills

`skills/` contains four Claude Code skills that teach the render-verify loop and full JSCAD API. They are installed by copying to `~/.claude/skills/` — they are not loaded automatically. See `skills/README.md` for details.
