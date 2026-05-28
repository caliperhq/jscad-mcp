# Image → 3D Heightmap (Lithophane) Pattern

For demos whose *input* is a raster image (lithophane, embossed plaque, terrain panel), the data has to be embedded in the JS bundle because `.jscad` files run sandboxed at render time and can't `fs.readFile` the source image. Use a two-step pipeline.

## Step 1 — Preprocessor script (committed, run manually when input changes)

```js
// scripts/build-heightmap.js  — node-only, zero deps beyond ImageMagick
const fs = require('fs'), cp = require('child_process'), os = require('os')
const [,, inputImage, widthArg = '120'] = process.argv
const W = parseInt(widthArg, 10)
const tmp = `${os.tmpdir()}/_hm_${process.pid}.pgm`
cp.execFileSync('convert', [inputImage, '-colorspace', 'Gray', '-resize', `${W}x`, '-depth', '8', tmp])

// PGM P5 (binary): "P5\n[# comment\n]*W H\n255\n<binary bytes>"
const buf = fs.readFileSync(tmp)
let p = 0
const ws = (b) => b === 0x20 || b === 0x0a || b === 0x09 || b === 0x0d
const tok = () => {
  while (p < buf.length && ws(buf[p])) p++
  if (buf[p] === 0x23) { while (p < buf.length && buf[p] !== 0x0a) p++; return tok() }
  const s = p; while (p < buf.length && !ws(buf[p])) p++
  return buf.slice(s, p).toString('ascii')
}
if (tok() !== 'P5') throw new Error('expected binary PGM')
const ww = +tok(), hh = +tok(), maxv = +tok()
if (maxv !== 255) throw new Error('expected 8-bit PGM')
p++  // single whitespace after maxval
const values = Array.from(buf.slice(p, p + ww * hh))
fs.unlinkSync(tmp)

// Emit a bundler-safe lib module (see ../bundling.md)
const out = `'use strict'
const w = ${ww}
const h = ${hh}
const source = ${JSON.stringify(require('path').basename(inputImage))}
const values = [${values.join(',')}]
module.exports = { w, h, source, values }
`
fs.writeFileSync('examples/lib/heightmap.js', out)
```

ImageMagick's PGM P5 (binary grayscale) is the right intermediate: 8 bits per pixel, trivial header, no compression, parseable in ~15 lines without npm dependencies. (Modern `magick` CLI replaces `convert` — `convert` still works but prints a deprecation warning.)

## Step 2 — Build the polyhedron from the heightmap

In the `.jscad` file: walk a `(w-1) × (h-1)` grid of cells, emit two top triangles per cell with z-height from the heightmap value, plus a flat bottom and four side walls. Build a single `primitives.polyhedron({ points, faces })` directly.

**The performance constraint.** At ~18k+ grid samples, do NOT try `union` of one cuboid per cell. Boolean unions of thousands of primitives are pathologically slow (CSG is pairwise; the cost is O(N²) on the polygon count). A 120×150 heightmap = 18,000 cells; built as cuboids + union it takes minutes-to-never. Built as one polyhedron it takes well under a second.

```javascript
const { polyhedron } = require('@jscad/modeling').primitives
const { w, h, values } = require('./lib/heightmap')

const main = (params = {}) => {
  const p = { pixelSize: 1, minThickness: 0.6, maxThickness: 3, ...params }
  const thickness = (px) => p.minThickness + (1 - px / 255) * (p.maxThickness - p.minThickness)

  const points = []
  // Top grid: one vertex per pixel, z = thickness(brightness)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      points.push([x * p.pixelSize, y * p.pixelSize, thickness(values[y * w + x])])
    }
  }
  // Flat bottom: mirror grid at z=0
  const bottomBase = points.length
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      points.push([x * p.pixelSize, y * p.pixelSize, 0])
    }
  }

  const faces = []
  // Top faces (two triangles per cell)
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = y * w + x, b = a + 1, c = a + w, d = c + 1
      faces.push([a, b, d], [a, d, c])
    }
  }
  // ... + 4 side wall rings + bottom faces (winding flipped)

  return polyhedron({ points, faces, orientation: 'outward' })
}
```

## The render-vs-print mismatch

A real-thickness lithophane (0.6 – 3 mm range over a 120 mm panel) renders as a nearly featureless white card under diffuse lighting, because that's the whole point — the image is meant to be read by *transmitted* light, not surface shading. To make the encoded portrait actually *visible* in a renderer that can't backlight, the hero shot temporarily multiplies the relief ~5× (`maxThickness: 15` instead of `3`); the slice and grazing-angle profile show the real geometry.

**Don't bump the printable defaults to make the render look better.** Ship the realistic thickness and use exaggerated renders only for documentation. See the "Heightmap / Thin-Relief Surfaces Render as Blank" section in the `jscad-mcp` skill for the inspection technique.

## Cache invalidation after regenerating the heightmap

A single-file `.jscad` whose lib is regenerated (you re-ran the preprocessor with a new input image) hits two cache layers in the MCP server. See the "Same trap, different layer — lib data changes" section in the `jscad-mcp` skill for the inline `code:` cache-bust recipe.
