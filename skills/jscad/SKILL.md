---
name: jscad
description: >
  Generates OpenJSCAD (.js) scripts that create 3D models from natural language descriptions. Use
  this skill whenever the user wants to: create a 3D model, write a JSCAD/OpenJSCAD script, design
  something for 3D printing, make a parametric CAD design, produce an STL/AMF/DXF file, or describe
  any physical object they want modeled. Even casual requests like "make me a phone stand", "I need
  a bracket", or "design a gear" should trigger this. If the user mentions shapes, dimensions, or
  physical objects they want to fabricate, use this skill.
---

# JSCAD 3D Modeler

You write OpenJSCAD JavaScript scripts that produce 3D geometry. JSCAD models solids using
primitives, transforms, and boolean operations — the same approach as OpenSCAD but in JavaScript.

## What to produce

Write a `.js` file with a descriptive name. At the end, tell the user:
- **Web viewer:** drag the file onto https://openjscad.xyz/
- **Export STL:** `jscad model.js -of stl -o model.stl`
- **Other formats:** AMF, DXF, JSON, SVG, X3D, OBJ are all supported

If the user hasn't specified dimensions, pick sensible defaults for the object's purpose and
mention what you chose so they can adjust easily. Real-world sizes in mm — a coffee mug is ~80mm
diameter × 100mm tall, a phone is ~75mm × 150mm × 8mm.

## File skeleton

```javascript
const jscad = require('@jscad/modeling')
const { cuboid, cube, cylinder, sphere, torus, polygon, circle, rectangle } = jscad.primitives
const { translate, translateZ, rotate, rotateX, rotateY, rotateZ, scale, mirror, center } = jscad.transforms
const { union, subtract, intersect } = jscad.booleans
const { extrudeLinear, extrudeRotate } = jscad.extrusions
const { colorize, colorNameToRgb, hexToRgb } = jscad.colors
const { hull, hullChain } = jscad.hulls
const { degToRad } = jscad.utils
const { TAU } = jscad.maths.constants   // TAU = 2*Math.PI; useful for full-circle spacing

const main = () => {
  return myShape  // single geometry, flat array, OR deeply nested array — JSCAD flattens automatically
}

module.exports = { main }
```

Import only what you use. Declare all key dimensions as named constants at the top — never scatter
magic numbers through the code.

**Units: 1 unit = 1 mm.**

## Coordinate system & base placement

Shapes are centered at the origin by default. For 3D printing the base must sit at Z = 0:

```javascript
// Option A — center param shifts the shape's center point
cuboid({ size: [20, 30, 10], center: [0, 0, 5] })   // base at Z=0, top at Z=10

// Option B — translateZ after construction
translateZ(5, cylinder({ radius: 10, height: 10 }))
```

X = left/right, Y = front/back, Z = up. Rotations always in **radians** — use `degToRad(n)`.

## 3D primitives

```javascript
cube({ size: 10 })                                              // uniform cube
cuboid({ size: [width, depth, height] })
cuboid({ size: [w, d, h], center: [cx, cy, cz] })
roundedCuboid({ size: [w, d, h], roundRadius: 0.5, segments: 32 })

cylinder({ radius: r, height: h })
cylinder({ radius: r, height: h, center: [x, y, z], segments: 64 })
roundedCylinder({ radius: r, height: h, roundRadius: 0.5 })
cylinderElliptic({ height: h, startRadius: [rx,ry], endRadius: [0,0] })  // cone when end=[0,0]
cylinder({ start: [0,0,0], end: [3,3,10], radius: 1 })                   // point-to-point

sphere({ radius: r, segments: 32 })
ellipsoid({ radius: [rx, ry, rz], segments: 32 })
geodesicSphere({ radius: r, frequency: 6 })   // frequency must be multiple of 6

torus({ innerRadius: 2, outerRadius: 8, innerSegments: 32, outerSegments: 64 })
// innerRadius = tube radius; outerRadius = distance from center of ring to center of tube
```

`segments` controls smoothness: 16 for drafts, 32–64 for final output. Low segment counts
deliberately produce regular polygonal prisms: `cylinder({ segments: 6 })` is a hex prism (use this
for hex nuts/holes — don't construct them from rotated cuboids). `segments: 3` is a triangle,
`segments: 8` is octagonal, etc.

## 2D primitives (used for extrusion)

```javascript
circle({ radius: r, segments: 32 })
ellipse({ radius: [rx, ry] })
square({ size: s })
rectangle({ size: [w, h] })
roundedRectangle({ size: [w, h], roundRadius: r })
polygon({ points: [[x1,y1], [x2,y2], ...] })   // counter-clockwise winding
star({ vertices: 5, outerRadius: 10, innerRadius: 4 })
```

## Transforms

All transforms accept a **single geometry or an array of geometries** as the second argument.
This lets you transform an entire collection in one call — essential for recursive builders.

```javascript
translate([x, y, z], shape)           // shape can be a geometry OR an array
translateX(d, shape) / translateY(d, shape) / translateZ(d, shape)

rotate([rx, ry, rz], shape)          // radians on each axis
rotateX(degToRad(90), shape)
rotateY(angle, shape) / rotateZ(angle, shape)

scale([sx, sy, sz], shape)

center({ axes: [true, true, false] }, shape)   // center on X+Y, leave Z unchanged
mirror({ normal: [1, 0, 0] }, shape)           // reflect across YZ plane
mirrorX(shape) / mirrorY(shape) / mirrorZ(shape)

align({ modes: ['min','center','max'], relativeTo: [0,0,0] }, shapes)
// modes per axis: 'min' (align to low side), 'center', 'max' (align to high side), 'none'
```

## Boolean operations

```javascript
union(shape1, shape2, ...)          // merge — also accepts a single array argument
subtract(base, cut1, cut2, ...)     // first arg is the solid; rest are removed from it
intersect(shape1, shape2, ...)      // only the overlapping region survives
```

Make cutters slightly oversized to guarantee clean cuts — a hole-punch cylinder should be 1–2 mm
taller than the block it punches through.

**Boolean edge artifacts** — when two surfaces are coplanar, JSCAD can produce z-fighting or
missed cuts. Fix by adding a tiny overlap (convention: name it `SCG_OVERLAP`):
```javascript
const SCG_OVERLAP = 0.01   // prevents coplanar Boolean artifacts
// Use it when a cutter must break through a surface cleanly:
cylinder({ radius: r, height: wallThickness + 2 * SCG_OVERLAP })
```

## Extrusions (2D → 3D)

```javascript
// Pull a 2D shape straight up along Z
extrudeLinear({ height: h }, shape2D)
extrudeLinear({ height: h, twistAngle: Math.PI/4, twistSteps: 20 }, shape2D)
extrudeLinear({ height: h, center: true }, shape2D)  // Z-centers the result around origin

// Revolve a 2D cross-section around the Z axis (bottles, bowls, rings, wheels)
// Draw the profile in XY where X = radius and Y = height; X must be >= 0
extrudeRotate({ segments: 64 }, profile2D)
extrudeRotate({ segments: 32, angle: Math.PI }, profile2D)  // half revolution

// Sweep a rectangle along a 2D path
extrudeRectangular({ size: 2, height: 1 }, path2D)
```

## Colors

Apply color **after** all booleans — colorizing before subtraction can produce artifacts:

```javascript
colorize([r, g, b], shape)                    // RGB values 0–1
colorize([r, g, b, alpha], shape)             // alpha: 0=transparent, 1=opaque
colorize(colorNameToRgb('tomato'), shape)     // any CSS color name as string
colorize(hexToRgb('#2a9d8f'), shape)

// cssColors gives named colors as RGBA arrays directly — no string needed:
const { cssColors } = jscad.colors
colorize(cssColors.aqua, shape)     // cssColors.blue, .red, .maroon, .pink, etc.
```

**Per-part palette pattern** — for assemblies where parts are easy to confuse (engines, gearboxes, machines with similar-shaped pieces), define a `PART_COLORS` map and colorize each part. Distinctive colors make assemblies self-explanatory without labels, and the jscad-mcp renderer honors per-solid colors:

```javascript
const { colors } = require('@jscad/modeling')
const { colorize } = colors

const PART_COLORS = {
  block:        [0.55, 0.58, 0.62, 1],   // gray housing
  piston:       [0.85, 0.55, 0.20, 1],   // copper
  intake_valve: [0.30, 0.55, 0.85, 1],   // blue (cool intake)
  exhaust_valve:[0.85, 0.30, 0.20, 1],   // red (hot exhaust)
  intake_port:  [0.50, 0.75, 1.00, 0.55],// translucent (flow path)
}

const colorPart = (name, geom) => geom ? colorize(PART_COLORS[name], geom) : null

// Then in buildAll:
return {
  block:  [colorPart('block',  buildBlock(p))].filter(Boolean),
  piston: [colorPart('piston', buildPiston(p))].filter(Boolean),
  // ...
}
```

Translucent alpha (< 1) is useful for "void" parts like ports or cavities that should be visible but not opaque.

## Hulls and organic shapes

```javascript
hull(shape1, shape2, ...)        // convex hull wrapping all shapes
hullChain(s1, s2, s3, s4)       // hull between each consecutive pair

// hullChain shines for organic sweeps: place cross-sections at control points,
// hullChain blends them into a smooth continuous solid
const tube = hullChain(
  translate([0, 0, 0],  circle({ radius: 5 })),
  translate([10, 5, 0], circle({ radius: 4 })),
  translate([20, 0, 0], circle({ radius: 5 }))
)
// then extrudeLinear({ height: 1 }, tube) to give it thickness
```

## Expansions / offsets

```javascript
const { expand, offset } = require('@jscad/modeling').expansions

expand({ delta: 1, corners: 'round', segments: 32 }, shape3D)  // grow outward
offset({ delta: -1, corners: 'round' }, shape2D)               // shrink 2D inward
// corners options: 'round', 'chamfer', 'edge'
```

## Measurements (for programmatic positioning)

```javascript
const { measureBoundingBox, measureDimensions } = require('@jscad/modeling').measurements

const [[minX,minY,minZ],[maxX,maxY,maxZ]] = measureBoundingBox(shape)
const [width, depth, height] = measureDimensions(shape)
```

Use this when you need to stack or align parts without hardcoding their sizes.

## 3D text

`vectorText` returns raw line segments; you hull them into strokes, then extrude:

```javascript
const { vectorText } = require('@jscad/modeling').text

const make3DText = (str, lineWidth = 1.5, extrudeHeight = 3) => {
  const dot = circle({ radius: lineWidth / 2, segments: 16 })
  const strokes = vectorText({ input: str }).map(pts =>
    hullChain(pts.map(pt => translate(pt, dot)))
  )
  return extrudeLinear({ height: extrudeHeight }, union(strokes))
}
```

## Interactive parameters (web UI sliders/inputs)

```javascript
const getParameterDefinitions = () => [
  { name: 'width',  type: 'float',    initial: 50,        caption: 'Width (mm):' },
  { name: 'height', type: 'float',    initial: 30,        caption: 'Height (mm):' },
  { name: 'hollow', type: 'checkbox', checked: false,     caption: 'Hollow interior?' },
  { name: 'style',  type: 'choice',   values: ['round','square'],
                                       initial: 'round',  caption: 'Corner style:' },
  { name: 'count',  type: 'slider',   initial: 3, min: 1, max: 10, step: 1, caption: 'Count:' },
  { name: 'color',  type: 'color',    initial: '#2a9d8f', caption: 'Color:' },
]

const main = (params) => {
  // params.width, params.height, params.hollow (bool), params.style (string), etc.
}

module.exports = { main, getParameterDefinitions }
```

Parameter types: `float`, `int`, `number`, `text`, `checkbox`, `color`, `slider`, `choice`,
`radio`, `group` (group is just a visual divider with a caption).

**`choice` with separate display labels** — use `captions` when the stored values differ from what the user should see:
```javascript
{ name: 'head_type', type: 'choice', caption: 'Head type?',
  values: [0, 1], captions: ['Counterbored', 'Countersunk'], initial: 0 }
```

**Collapse a group by default** — add `initial: 'closed'` to a group entry:
```javascript
{ name: 'advanced', type: 'group', caption: 'Advanced Options', initial: 'closed' }
```

**`default` and `initial` are interchangeable** as the default-value key — both work across JSCAD versions.

**Standalone + interactive pattern** — define a `defaults` object and merge with `params` in `main` so the
script produces output even when loaded without the web UI (e.g. from the CLI):
```javascript
const defaults = {
  width: 50,
  height: 30,
  segments: 64,
}

const main = (params) => {
  params = Object.assign({}, defaults, params)
  // now params.width etc. always have a value
}
```

## Common patterns

**Hollow enclosure:**
```javascript
const enclosure = (w, d, h, wall) =>
  subtract(
    cuboid({ size: [w, d, h], center: [0, 0, h/2] }),
    cuboid({ size: [w-2*wall, d-2*wall, h], center: [0, 0, h/2+wall] })
  )
```

**Clean hole through a solid:**
```javascript
subtract(
  cuboid({ size: [30, 30, 10], center: [0, 0, 5] }),
  cylinder({ radius: 4, height: 12, center: [0, 0, 5] })   // 12mm > 10mm block height
)
```

**Horizontal hole through a wall** (cylinders point along Z by default, so rotate them):
```javascript
const wall = cuboid({ size: [100, 10, 50], center: [0, 0, 25] })
const hole = translate([0, 0, 25],
  rotateX(degToRad(90), cylinder({ radius: 4, height: 12, segments: 64 }))
)
subtract(wall, hole)   // hole now runs along the Y axis
```

**Compose by naming sub-parts**, then union/subtract at the end — this keeps complex models readable:
```javascript
const base    = cuboid({ size: [100, 100, 10], center: [0, 0, 5] })
const wallN   = cuboid({ size: [100, 10, 50], center: [0,  50, 25] })
const wallS   = cuboid({ size: [100, 10, 50], center: [0, -50, 25] })
const cutouts = union(translateZ(35, rotateX(degToRad(90),
                   cylinder({ radius: 4, height: 120, segments: 64 }))))
const main = () => subtract(union(base, wallN, wallS), cutouts)
```

**Revolve profile (vase, cup, bowl):**
```javascript
// X = radius at each height, Y = height level, starting at [0,0] for a closed base
const profile = polygon({
  points: [[0,0],[30,0],[28,2],[22,60],[12,70],[0,70]]
})
const vase = extrudeRotate({ segments: 64 }, profile)
```

**Grid of copies:**
```javascript
const grid = (shape, cols, rows, spacing) =>
  Array.from({ length: cols * rows }, (_, i) =>
    translate([(i % cols) * spacing, Math.floor(i / cols) * spacing, 0], shape)
  )
```

**Recursive fractal tree** (nested arrays flatten automatically, transforms work on arrays):
```javascript
// Distributes `count` scaled copies of `geometry` radially around the parent,
// then recurses. Returns a nested array — JSCAD flattens it.
const createLevel = (geometry, radius, level, maxLevels, childScale, childCount, offsetFactor) => {
  if (level > maxLevels) return []
  const childRadius = radius * childScale
  const childGeom  = scale([childScale, childScale, childScale], geometry)
  const nextLevel  = createLevel(childGeom, childRadius, level + 1, maxLevels,
                                 childScale, childCount, offsetFactor)
  const offset     = radius + radius * offsetFactor
  const step       = TAU / childCount
  return Array.from({ length: childCount }, (_, i) =>
    rotate([0, 0, step * i], translate([offset, 0, 0], [childGeom, nextLevel]))
  )
}
// In main: return [rootGeom, createLevel(rootGeom, rootRadius, 1, params.levels, ...)]
```

**Evenly space N items around a circle** (use `TAU`):
```javascript
const step = TAU / count
Array.from({ length: count }, (_, i) =>
  rotate([0, 0, step * i], translate([radius, 0, 0], shape))
)
```

**Rounded pill / capsule:**
```javascript
const capsule = (radius, length) =>
  hull(
    translate([-length/2, 0, 0], sphere({ radius })),
    translate([ length/2, 0, 0], sphere({ radius }))
  )
```

**Polyhedron from a heightmap grid** (lithophane, terrain, embossed panel): build one `polyhedron({ points, faces })` directly — *don't* `union` per-cell cuboids (a 100×120 grid is 12 000 cuboids, and CSG union pairs them sequentially → minutes, not seconds).

```javascript
const { primitives } = require('@jscad/modeling')
const { polyhedron } = primitives

// hm = { w, h, values: [0..255 grayscale, row-major, length w*h] }
const buildPanel = (hm, { pixelSize = 1, minThickness = 0.6, maxThickness = 3 } = {}) => {
  const { w: W, h: H, values } = hm
  const px = pixelSize
  const x0 = -(W * px) / 2, y0 = (H * px) / 2

  // Average the up-to-four pixel cells touching corner (i, j) so the top
  // surface is continuous across cell boundaries instead of stepped.
  const cornerZ = (i, j) => {
    let s = 0, n = 0
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
      const pi = i + di, pj = j + dj
      if (pi >= 0 && pi < W && pj >= 0 && pj < H) { s += values[pj*W + pi]; n++ }
    }
    const b = n > 0 ? s / n : 128
    return minThickness + (maxThickness - minThickness) * (1 - b / 255)
  }

  const points = []
  // Top surface: (W+1) × (H+1) vertices, z varies
  for (let j = 0; j <= H; j++)
    for (let i = 0; i <= W; i++)
      points.push([x0 + i*px, y0 - j*px, cornerZ(i, j)])
  // Bottom surface: flat at z=0
  const Vt = (W + 1) * (H + 1)
  for (let j = 0; j <= H; j++)
    for (let i = 0; i <= W; i++)
      points.push([x0 + i*px, y0 - j*px, 0])

  const Ti = (i, j) => j * (W + 1) + i           // top vertex index
  const Bi = (i, j) => Vt + j * (W + 1) + i       // bottom vertex index
  const faces = []

  // Top (normal = +Z): CCW from +Z. Note y = y0 - j*px, so increasing j is -Y.
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    faces.push([Ti(i, j),   Ti(i+1, j), Ti(i+1, j+1)])
    faces.push([Ti(i, j),   Ti(i+1, j+1), Ti(i, j+1)])
  }
  // Bottom (normal = -Z): reverse winding from top
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    faces.push([Bi(i, j),   Bi(i+1, j+1), Bi(i+1, j)])
    faces.push([Bi(i, j),   Bi(i, j+1),   Bi(i+1, j+1)])
  }
  // Side walls: four edge strips closing the volume
  for (let i = 0; i < W; i++) {                                   // +Y edge (j=0)
    faces.push([Ti(i, 0), Bi(i, 0), Bi(i+1, 0)])
    faces.push([Ti(i, 0), Bi(i+1, 0), Ti(i+1, 0)])
  }
  for (let i = 0; i < W; i++) {                                   // -Y edge (j=H)
    faces.push([Ti(i+1, H), Bi(i+1, H), Bi(i, H)])
    faces.push([Ti(i+1, H), Bi(i, H), Ti(i, H)])
  }
  for (let j = 0; j < H; j++) {                                   // -X edge (i=0)
    faces.push([Ti(0, j+1), Bi(0, j+1), Bi(0, j)])
    faces.push([Ti(0, j+1), Bi(0, j), Ti(0, j)])
  }
  for (let j = 0; j < H; j++) {                                   // +X edge (i=W)
    faces.push([Ti(W, j), Bi(W, j), Bi(W, j+1)])
    faces.push([Ti(W, j), Bi(W, j+1), Ti(W, j+1)])
  }

  return polyhedron({ points, faces, orientation: 'outward' })
}
```

A 120 × 150 grid produces ~36k vertices and ~70k triangles in one polyhedron — JSCAD handles it in well under a second. Winding direction: top faces CCW viewed from +Z, bottom faces reversed, side walls outward-facing. Get it wrong and the renderer shows inverted normals (the panel looks "inside-out"); flip the offending strip's winding.

For the matching image → heightmap preprocessor (ImageMagick → PGM → JS data module), see the `jscad-examples` skill's "Image → 3D Heightmap (Lithophane) Pattern".

## Reference

If the jscad MCP server is active (tools like `mcp__jscad__take_standard_views` appear in the deferred tools list), use **`jscad-mcp`** for visual feedback: render after every geometry change, describe what you see, iterate.

For any real modeling task, also invoke these companion skills:
- **`jscad-wiki`** — full API reference, coordinate system, all primitives with parameters, extrusion mechanics, path operations, measurements, colors, text, geometry types, file formats, parameter UI widgets
- **`jscad-examples`** — real-world patterns from 46 working designs: composition strategies, tolerance/fit, threading, gears, shell construction, text embedding, rotational symmetry, organic extrusion, mesh import, API version differences

Working examples covering booleans, extrusions, hulls, parameters, and more are installed at
`/usr/share/jscad/examples/` — consult them for patterns not covered here.
