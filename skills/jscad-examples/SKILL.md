---
name: jscad-examples
description: >
  Load this skill when answering questions about real-world JSCAD patterns,
  code idioms, or how to implement specific 3D modeling techniques. Covers
  patterns extracted from 46 working JSCAD examples: composition strategies,
  parametric design, tolerance/fit, threading, gears, shell construction,
  text embedding, rotational symmetry, organic extrusion, and mesh import.
  Also covers API version differences (legacy CSG vs modern @jscad/modeling).
---

# JSCAD Real-World Patterns (from 46 Examples)

## API Version Quick Reference

Two distinct API eras coexist in JSCAD files. **Never mix them.**

### Modern API (`@jscad/modeling`, v2+)
```js
const { cuboid, cylinder, sphere, circle, roundedRectangle } = require('@jscad/modeling').primitives
const { union, subtract, intersect } = require('@jscad/modeling').booleans
const { translate, rotate, scale, mirrorX } = require('@jscad/modeling').transforms
const { extrudeLinear, extrudeRotate } = require('@jscad/modeling').extrusions
const { degToRad } = require('@jscad/modeling').utils
module.exports = { main, getParameterDefinitions }
```
- `translate([x,y,z], geom)` — functional, geometry is last arg
- `rotate([rx,ry,rz], geom)` — **radians**
- `cuboid({ size: [w,h,d] })` — full size, not half-extents
- `cylinder({ height: h, radius: r, segments: n })`

### Legacy API (v1 / CSG global)
```js
// No require — CSG is global
CSG.cube({ center: [cx,cy,cz], radius: [hx,hy,hz] })  // radius = HALF-EXTENTS
CSG.cylinder({ start: [x,y,z], end: [x,y,z], radiusStart: r, radiusEnd: r, resolution: 32 })
geom.translate([dx,dy,dz])  // method chain
geom.rotateX(deg)           // DEGREES
geom.union(other)           // method chain; .union([a,b,c]) accepts arrays
difference(a, b, c)         // free function; subtracts b AND c from a
```
- `center: [bool, bool, bool]` — per-axis centering (extremely common)
- `cos(angle)` / `sin(angle)` — JSCAD globals taking **degrees** (not radians)
- `Math.cos()` / `Math.sin()` — standard JS, taking **radians**

### Old global-function style (between v1 and v2)
```js
// require('@jscad/csg/api') or no require at all
cube([x,y,z])          // positional array
cylinder({r, h, fn})   // fn not segments
rotate([rx,ry,rz], geom)  // degrees in this era
```

## Composition Patterns

### Additive-then-subtractive pipeline
Build the solid shape, then subtract features. Order matters: union structural pieces before subtracting holes.
```js
let obj = base
obj = union(obj, rail, boss)       // add features
obj = subtract(obj, slot, hole)    // remove features
```

### Sub-function architecture with enriched params
Pass one shared params object; add computed values in `main()` before calling sub-functions:
```js
const main = (p) => {
  p.flange_gap = p.bolt_travel + p.bolt_diameter   // derived, added to p
  p.base_length = p.screw_size * 3 + p.flange_gap
  return [base(p), bolt(p)]
}
```

### Factory returning [solid, cutout] pair
For parts that need both a body and a matching hole:
```js
const keystoneReceptor = () => {
  const outer = /* ... */
  const inner = /* ... */
  return [outer, inner]  // caller: const [ks, ksHole] = keystoneReceptor()
}
```

### Array accumulator pattern
When building geometry in loops:
```js
var result = new CSG()           // empty identity for .union()
for (let i = 0; i < n; i++) {
  result = result.union(thing.translate([i * step, 0, 0]))
}
```
Or with modern API — return the array from `main()`:
```js
const slices = []
for (let z = 0; z <= height; z += layerH) {
  slices.push(translate([0,0,z], extrudeLinear({height: layerH}, cross_section(z))))
}
return slices   // JSCAD renders arrays
```

### Conditional geometry (feature flags)
```js
const objs = []
if (p.show_base) objs.push(createBase(p))
if (p.show_cover) objs.push(createCover(p))
if (objs.length === 0) objs.push(primitives.cube())   // always return something
return objs
```
For display modes (retracted/extended), translate the same geometry different amounts based on a `choice` param.

## Rotational Symmetry

### Self-union doubling (elegant for N-fold symmetry)
```js
let shp = seedShape.translate([r*.75, r*.75, 0])
shp = shp.union(shp.rotateZ(180))   // 2-fold
shp = shp.union(shp.rotateZ(90))    // 4-fold
shp = shp.union(shp.rotateZ(45))    // 8-fold
shp = shp.union(center_cylinder)
```

### Radial loop
```js
for (let i = 0; i < count; i++) {
  parts.push(rotate([0, 0, (TAU / count) * i], onePart))  // modern, radians
  // or legacy:
  parts.push(onePart.rotateZ((360 / count) * i))           // degrees
}
```

### Mirror for bilateral symmetry
```js
let r1 = buildOneSide(p)
let r2 = mirrorX(r1)
r2 = translate([p.separation, 0, 0], r2)
return union(r1, r2)
```

## Shell Construction

### Double-difference shell (open-top box)
```js
const outer = roundedCuboid({ size: [W+wall*2, D+wall*2, H+wall], ... })
const inner = roundedCuboid({ size: [W, D, H*2], ... }).translate([0,0,wall])
return subtract(outer, inner)
```

### Flat-bottom rounded box (intersection trick)
A roundedCube is centered; intersect with a half-space cube to flatten the bottom:
```js
const box = CSG.roundedCube({ radius: [w/2, h/2, d], roundradius: rr })
  .intersect(CSG.cube({ radius: [w/2, h/2, d/2] }).translate([0,0,d/2]))
```

### Hollow tube (pipe)
```js
subtract(
  cylinder({ radius: outerR, height: h }),
  cylinder({ radius: innerR, height: h + 0.01 }).translate([0,0,-0.005])  // anti-z-fight
)
```

## Tolerance and Fit

```js
const tol = 0.005                    // dimensional tolerance
const bL = L * (1 + tol)            // slightly larger for clearance

const SCG_OVERLAP = 0.01             // boolean anti-artifact gap
subtract(base, translate([0,0,-SCG_OVERLAP], cutter))

const eps = 0.001                    // OpenSCAD/scale anti-coplanar
scale([1+eps, 1+eps, 1], subtractedShape)  // ensures clean cut

// Uniform mm-expansion for sliding fit:
const scaleBy = (obj, byMM) => {
  const bb = measureBoundingBox(obj)
  const [dx, dy, dz] = [bb[1][0]-bb[0][0], bb[1][1]-bb[0][1], bb[1][2]-bb[0][2]]
  return scale([(dx/2+byMM)/(dx/2), (dy/2+byMM)/(dy/2), (dz/2+byMM)/(dz/2)], obj)
}
```

## Special Shapes

### Hex prism (nut/bolt head)
```js
cylinder({ height: h, radius: r, segments: 6 })   // modern
cylinder({ r: r, h: h, fn: 6 })                   // legacy
```

### Cone
```js
cylinder({ height: h, startRadius: [r1,r1], endRadius: [r2,r2] })   // modern (cylinderElliptic)
cylinder({ r1: rBottom, r2: rTop, h: h })                           // legacy; r2:0 = sharp tip
```

### Stadium / oblong (hull of two circles)
```js
hull(
  circle({ radius: r, segments: 32 }).translate([-offset, 0]),
  circle({ radius: r, segments: 32 }).translate([offset, 0])
)
```

### Rounded square (four corners + two bars)
```js
const rounded_square = (size, r) => {
  const d = size/2 - r
  const corner = circle({ radius: r, segments: 32 })
  return union(
    translate([ d,  d], corner), translate([-d,  d], corner),
    translate([ d, -d], corner), translate([-d, -d], corner),
    rectangle({ size: [size, size - r*2] }),
    rectangle({ size: [size - r*2, size] })
  )
}
```

### Diagonal/angled cut (rotate oversized cube)
```js
subtract(
  shape,
  translate([0, 0, height],
    rotate([0, angle, 0],
      cuboid({ size: [bigNum, bigNum, bigNum], center: [0,0,0] })
    )
  )
)
```

### VERYLARGE sentinel for through-cuts
```js
const VERYLARGE = 100000
// Use as extrusion depth to guarantee full penetration:
subtract(body, cylinder({ radius: r, height: VERYLARGE }).translate([x, y, -VERYLARGE/2]))
```

## Parametric Design

### Parameter definition patterns
```js
const getParameterDefinitions = () => [
  // Section header (no value, just visual separator)
  { name: 'section1', type: 'group', caption: 'Bolt', initial: 'closed' },  // starts collapsed

  // Numbers
  { name: 'width',    type: 'float', initial: 32.5, min: 6.0, max: 200, step: 0.5, caption: 'Width:' },
  { name: 'count',    type: 'int',   initial: 7,    min: 3,   max: 15,  step: 2,   caption: 'Count:' },  // step:2 = odd only
  { name: 'quality',  type: 'slider', initial: 32,  min: 8,   max: 128, step: 8,   caption: 'Segments:' },

  // Boolean
  { name: 'hollow',   type: 'checkbox', checked: true, caption: 'Hollow?' },

  // Dropdown — values are actual values, captions are display strings
  { name: 'style',    type: 'choice', values: ['left','right','both'], captions: ['Left','Right','Both'], initial: 'Left' },
  //  NOTE: initial for choice is the CAPTION string, not the value

  // Boolean choice (0/1 pattern)
  { name: 'enable',   type: 'choice', values: [0,1], captions: ['No','Yes'], initial: 1 },

  // Text for structured data (comma-separated list)
  { name: 'sizes',    type: 'text', initial: '10,10,20', caption: 'Slot sizes (comma list):' },
]
```

### Defaults + merge pattern (prevents out-of-range UI values)
```js
const CLIP = (v, min, max) => Math.max(min, Math.min(max, v))
const defaults = {
  width: 32.5,
  count: CLIP(7, 3, 15),
}
const main = (params) => {
  params = Object.assign({}, defaults, params)
  // add derived values
  params.inner_width = params.width - params.wall_thickness * 2
  // ...
}
```

### Text param for variable-length arrays
```js
// In getParameterDefinitions: { name: 'sizes', type: 'text', initial: '10,10,20' }
const sizeList = params.sizes.split(',').map(parseFloat)  // always use parseFloat
```

### Quality toggle pattern
```js
const fn = params.output === 'print' ? 144 : 36   // resolution switch
```

## Text in 3D

### Modern API (v2)
```js
const { vectorText } = require('@jscad/modeling').text
const { extrudeLinear } = require('@jscad/modeling').extrusions
const { path2 } = require('@jscad/modeling').geometries

const segs = vectorText({ height: 8 }, 'Hello')   // returns array of segment arrays
const paths = segs.map(seg => path2.fromPoints({ closed: false }, seg))
const letters = paths.map(p => extrudeLinear({ height: 2 }, p))
```

### Legacy API
```js
const lines = vector_text(0, 0, 'Hello')    // global function
const strokes = []
lines.forEach(pl => strokes.push(rectangular_extrude(pl, { w: 2, h: 4 })))
const text3d = union(strokes)
// Subtract from solid for engraving:
subtract(body, text3d.translate([...]))
```

`rectangular_extrude(polyline, {w, h})`: `w` = stroke width, `h` = extrude depth. Length comes from the polyline itself.

## Organic / Non-Linear Extrusion

### `extrudeFromSlices` with morphing cross-section (legacy)
```js
// Starting slice: extract outline from a 2D shape
const startSlice = CSG.Polygon.createFromPoints(
  hullShape.getOutlinePaths()[0].points   // [0] = outer boundary
)

startSlice.solidFromSlices({
  numslices: steps,
  callback: function(t, sliceIndex) {   // t is normalized 0..1
    const r = startR + t * (endR - startR)
    const currentSlice = CSG.Polygon.createFromPoints(
      circle({ radius: r, fn: 64 }).getOutlinePaths()[0].points
    )
    return currentSlice.translate([0, 0, t * height])   // MUST self-position on Z
  }
})
```

### Slice-per-layer vase pattern (modern)
```js
const layers = []
for (let z = 0; z <= height; z += layerH) {
  const t = z / height             // normalized 0..1
  const r = baseR + t * (topR - baseR)
  layers.push(
    translate([0, 0, z],
      extrudeLinear({ height: layerH },
        difference(circle({ radius: r }), circle({ radius: r - wall }))
      )
    )
  )
}
return layers
```

## Wings 3D / Mesh Import Pattern
When importing a pre-authored mesh (exported from Wings 3D, Blender, etc.):
```js
function main() {
  const Points = [ [x,y,z], ... ]          // vertex array
  const Polygons = [ [i,j,k], ... ]        // triangle/quad face indices
  const Colors = [ [r,g,b,a], ... ]        // per-face RGBA (0..1)

  const CsgPolys = Polygons.map((face, idx) =>
    CSG.Polygon.createFromPoints(face.map(n => Points[n]))
      .setColor(Colors[idx])
  )
  return [CSG.fromPolygons(CsgPolys)]      // always return array
}
```

## Multi-File Projects

### `include()` (legacy JSCAD preprocessor)
```js
include("gears.jscad")        // relative path; not standard JS
include("../libs/utils.jscad")
// All functions from included file become global
```

### `require()` (modern, Node.js compatible)
```js
const partA = require('./partA')
const main = (p) => [partA(p), createBase(p)]
module.exports = { main, getParameterDefinitions }
```

## Gear Train Spacing
```js
// pitch_radius(mm_per_tooth, n) = mm_per_tooth * n / Math.PI / 2
const d12 = pitch_radius(mpt, n1) + pitch_radius(mpt, n2)   // center-to-center
// Phase correction for meshing:
gear(mpt, n2, thickness, hole).rotateZ(-(1 + n2/2) * 360/n2).translate([0, d12, 0])
```

## ISO Thread Pattern
Threads are helical polyhedrons. Each segment is a 6-vertex twisted prism:
```js
polyhedron({
  points: [/* 3 at angle_start, 3 at angle_end */],
  triangles: [[0,1,2],[3,5,4],[0,3,4],[0,4,1],[0,5,3],[0,2,5],[1,4,5],[1,5,2]]
})
```
Key: `fn: 6` for hex heads/nuts. Thread pitch formula: `thread_depth = pitch * 0.866 / 2`.

## Section-Cut Debugging
```js
if (params.cut === 'x') {
  result = result.cutByPlane(CSG.Plane.fromPoints([0,0,0],[1,0,0],[0,0,1]))
}
```
Expose as a `choice` param: `values: ['','x','-x','y','-y']`.

## OpenSCAD Files in the JSCAD Ecosystem
Files with `//!OpenSCAD` header are OpenSCAD syntax, not JavaScript. The `scad-deserializer` in JSCAD is intentionally disabled (`deserializers.js`) pending upstream fixes. These files cannot run in JSCAD as-is.

OpenSCAD `difference()` = first child is positive, rest are subtracted. `scale([-1,1,1])` mirrors (negative factor). `eps = 0.001` scale trick prevents coplanar boolean artifacts.

## Key Gotchas

- **Legacy `CSG.cube` radius = HALF-EXTENTS**: `radius: [w/2, h/2, d/2]` → cube of size `w×h×d`
- **`center: [bool, bool, bool]`**: per-axis centering. `[false,true,false]` = center on Y only. Very common pattern for floor-anchored objects.
- **`cos()`/`sin()` as globals = degrees**; `Math.cos()`/`Math.sin()` = radians. Don't mix.
- **Legacy `.rotateX/Y/Z()` = degrees**; modern `rotate([rx,ry,rz])` = radians
- **`choice` param `initial` = the caption string**, not the value: `initial: 'Yes'` matches `captions: ['No','Yes']`
- **`initial` and `default` are synonyms** in param definitions; prefer `initial` in new code
- **`vector_text` returns array of polylines**; `rectangular_extrude` each one separately, then union
- **`new CSG()` = empty geometry** (identity for `.union()` accumulator); not available in modern API
- **`.union([a,b,c])`** — legacy `.union()` accepts arrays; modern `union(a,b,c)` takes spread args
- **`solidFromSlices` callback**: `t` is 0..1; returned polygon must `translate([0,0,t*height])` itself
- **`getOutlinePaths()[0].points`** extracts outer boundary from 2D geometry (for solidFromSlices)
- **Float params from text fields**: `split(',').map(parseFloat)` — string arithmetic causes bugs
- **`include()` is JSCAD-only preprocessor**, not standard JS; breaks in Node without JSCAD runtime
- **`module.exports = { main, getParameterDefinitions }`** — must export both or UI has no param panel
- **`scale(scalar, geom)`** = uniform scale; `scale([sx,sy,sz], geom)` = non-uniform
- **`roundRadius` on roundedCylinder** consumes from height — actual straight section = `height - 2*roundRadius`
