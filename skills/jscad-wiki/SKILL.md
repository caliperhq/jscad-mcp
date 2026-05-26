---
name: jscad-wiki
description: >
  Load this skill when answering conceptual or architectural questions about
  OpenJSCAD / JSCAD: how geometry types work, what parameters a function
  accepts, coordinate system orientation, CSG theory, extrusion mechanics,
  path operations, measurement API, colors, text, file formats, parameter UI
  widgets, or multi-file project structure. Covers the full wiki + JSDoc API.
---

# JSCAD Wiki & API Reference

## Coordinate System

Right-hand coordinate system: **X=right, Y=back, Z=top** (Z is up).
Angles are always **radians**. Use `degToRad(deg)` / `radToDeg(rad)`.
`radiusToSegments(r, segments)` — returns segment count (minimum 4, scales with radius).

## Anatomy of a Design

```js
const { sphere } = require('@jscad/modeling').primitives

const main = () => sphere()   // return one shape or an array
module.exports = { main }
```

`getParameterDefinitions` is optional; when exported it drives the parameter UI:

```js
const getParameterDefinitions = () => [
  { name: 'size', type: 'int', initial: 10, caption: 'Size (mm)' }
]
module.exports = { main, getParameterDefinitions }
```

## Geometry Types

| Type | Data | Notes |
|------|------|-------|
| `geom2` | array of `[pointA, pointB]` sides | 2D closed polygon |
| `geom3` | array of `poly3` objects | 3D solid |
| `path2` | ordered point array | open or closed 2D path |
| `poly2` | point array | internal — used by geom2 |
| `poly3` | point array + plane | internal — used by geom3 |
| `slice` | geom2-like cross-section | used by extrudeFromSlices |

**Immutability**: all operations return new geometry objects; input is never modified.
**Lazy transforms**: each geometry carries a `transforms` mat4 applied on access, not stored in points.
**Shared-data warning**: do NOT mutate arrays returned by `toSides()`, `toPolygons()`, or `toPoints()` — they may be shared references.

## Parameters (UI Widgets)

| type | notes |
|------|-------|
| `group` | collapsible group; `initial: 'closed'` starts collapsed |
| `text` | free text |
| `int` | integer input |
| `number` | float input |
| `slider` | range slider; requires `min`/`max`; optional `step` |
| `checkbox` | boolean |
| `color` | color picker; returns `#rrggbb` string |
| `choice` | dropdown; use `captions: []` parallel array for display labels |
| `radio` | radio buttons; same `values`/`captions` pattern as choice |
| `date`, `email`, `url`, `password` | text variants with browser validation |

`default` and `initial` are interchangeable. `caption` sets the label shown in UI.

## 2D Primitives

```js
const { rectangle, square, roundedRectangle, ellipse, circle, polygon, star } = require('@jscad/modeling').primitives
```

| Function | Key params | Notes |
|----------|-----------|-------|
| `rectangle({size:[w,h]})` | `size`, `center` | default [2,2] |
| `square({size})` | `size` (number) | shorthand; default 2 |
| `roundedRectangle({size, roundRadius, segments})` | | default roundRadius=0.2 |
| `ellipse({radius:[rx,ry], segments})` | | default [1,1], seg=32 |
| `circle({radius, segments})` | | default 1, seg=32 |
| `polygon({points, paths})` | | `paths` for holes (index arrays); **must be CCW** |
| `star({outerRadius, innerRadius, vertices, startAngle})` | | default outer=1, inner=0.38, verts=5 |

## 3D Primitives

```js
const { cuboid, cube, roundedCuboid, cylinder, cylinderElliptic, roundedCylinder,
        ellipsoid, sphere, geodesicSphere, torus, polyhedron, triangle } = require('@jscad/modeling').primitives
```

| Function | Key params | Notes |
|----------|-----------|-------|
| `cuboid({size:[x,y,z]})` | `size`, `center` | default [2,2,2] |
| `cube({size})` | `size` (number) | default 2 |
| `roundedCuboid({size, roundRadius, segments})` | | default roundRadius=0.2 |
| `cylinder({radius, height, segments})` | | default r=1, h=2, seg=32 |
| `cylinderElliptic({startRadius, endRadius, height, segments})` | | makes cones/truncated cones |
| `roundedCylinder({radius, height, roundRadius, segments})` | | |
| `ellipsoid({radius:[rx,ry,rz], segments})` | | `segments` controls subdivisions on all axes |
| `sphere({radius, segments})` | | default r=1, seg=32 |
| `geodesicSphere({radius, frequency})` | | uses **`frequency`** not `segments`; icosahedron base |
| `torus({innerRadius, outerRadius, innerSegments, outerSegments})` | | |
| `polyhedron({points, faces, colors})` | | `colors` per face as [r,g,b,a] arrays |
| `triangle({type, vertices})` | | type codes: 'AAS','ASA','SAS','SSS','AAA'; vertices array |

## Transforms

```js
const { translate, translateX, translateY, translateZ,
        rotate, rotateX, rotateY, rotateZ,
        scale, scaleX, scaleY, scaleZ,
        mirror, mirrorX, mirrorY, mirrorZ,
        center, centerX, centerY, centerZ,
        align, transform } = require('@jscad/modeling').transforms
```

All transforms are non-destructive (return new geometry). All accept a single geometry or array.

- `translate([x,y,z], geom)` — move
- `rotate([rx,ry,rz], geom)` — **radians**
- `scale([sx,sy,sz], geom)` — uniform or non-uniform
- `mirror({normal:[x,y,z]}, geom)` — reflect across plane through origin with given normal
- `mirrorX/Y/Z(geom)` — shortcuts for mirror across YZ/XZ/XY planes
- `center({axes:[true,true,true]}, geom)` — centers on specified axes at origin
- `align({modes:['min','center','max']}, ...geoms)` — aligns multiple geoms; default modes `['center','center','min']`; modes per axis from `['min','center','max','none']`
- `transform(mat4, geom)` — apply arbitrary 4x4 matrix

## Booleans

```js
const { union, intersect, subtract, scission } = require('@jscad/modeling').booleans
```

All accept two or more geometries (or arrays). 3D uses BSP tree; always validate() after new operations.

- `union(...geoms)` — combine
- `intersect(...geoms)` — intersection
- `subtract(a, b)` — a minus b
- `scission(geom)` — **returns array** of disconnected solids from one geometry

**SCG_OVERLAP**: use a tiny offset (e.g. `0.01`) when subtracting to prevent coplanar Boolean artifacts:
```js
const SCG_OVERLAP = 0.01
subtract(base, translate([0,0,-SCG_OVERLAP], cutter))
```

## Extrusions

```js
const { extrudeLinear, extrudeRectangular, extrudeRotate,
        extrudeFromSlices, extrudeHelical, project } = require('@jscad/modeling').extrusions
```

| Function | Key params | Notes |
|----------|-----------|-------|
| `extrudeLinear({height, twist, scale, center})` | geom2 | `center:true` centers on Z |
| `extrudeRectangular({size, height})` | path2 | rectangular profile along path |
| `extrudeRotate({segments, startAngle, angle})` | geom2 | default seg=12, full revolution |
| `extrudeHelical({pitch, height, angle, segmentsPerRotation})` | geom2 | helical sweep |
| `extrudeFromSlices({numberOfSlices, callback})` | | callback: `(progress, index) => slice` |
| `project({axis, origin})` | geom3 | project 3D onto 2D plane; returns geom2 |

**extrudeFromSlices callback pattern:**
```js
extrudeFromSlices(
  { numberOfSlices: 10 },
  (progress, index) => {
    const z = progress * height
    return slice.fromSides(geom2.toSides(circle({ radius: 1 + progress })))
  }
)
```

## Path2 Operations

```js
const { appendPoints, appendArc, appendBezier, close, concat } = require('@jscad/modeling').geometries.path2
```

- `appendPoints(points, path)` — add raw points
- `appendArc({endpoint, radius, xaxisrotation, clockwise, large, segments}, path)` — SVG arc spec
- `appendBezier({controlPoints, segments}, path)` — first controlPoint null = smooth continuation from previous
- `close(path)` — mark path closed
- `concat(...paths)` — join paths

## Hulls & Expansions

```js
const { hull, hullChain } = require('@jscad/modeling').hulls
const { expand, offset } = require('@jscad/modeling').expansions
```

- `hull(...geoms)` — convex hull of all geometries
- `hullChain(...geoms)` — chain of hulls between consecutive pairs
- `hullPoints2(points)` / `hullPoints3(points)` — hull from raw point arrays
- `expand({delta, corners, segments}, geom)` — outward expansion (works on 2D and 3D)
- `offset({delta, corners, segments}, geom)` — 2D only; **no 3D offset**

## Measurements

```js
const meas = require('@jscad/modeling').measurements
```

| Function | Returns |
|----------|---------|
| `area(geom)` | number |
| `volume(geom)` | number |
| `boundingBox(geom)` | `[[minX,minY,minZ],[maxX,maxY,maxZ]]` |
| `boundingSphere(geom)` | `[[cx,cy,cz], radius]` |
| `center(geom)` | `[cx,cy,cz]` |
| `centerOfMass(geom)` | `[cx,cy,cz]` |
| `dimensions(geom)` | `[dx,dy,dz]` |
| `epsilon()` | current epsilon value |

Aggregate variants: `measureAreas`, `measureVolumes`, `measureBoundingBoxes`, etc. accept arrays.

## Colors

```js
const { colorize, colorNameToRgb, hexToRgb, rgbToHex, hslToRgb, rgbToHsl, hsvToRgb, rgbToHsv } = require('@jscad/modeling').colors
```

- `colorize([r,g,b,a], geom)` — values 0–1; alpha optional (default 1)
- `colorNameToRgb('red')` — 100+ CSS color names supported (full cssColors list)
- Converters: `hexToRgb('#ff0000')` → `[1,0,0]`, `hslToRgb([h,s,l])`, `hsvToRgb([h,s,v])`

```js
const { cssColors } = require('@jscad/modeling').colors
// cssColors is an object: { 'aliceblue': [0.94,0.97,1], 'red': [1,0,0], ... }
```

## Text

```js
const { vectorChar, vectorText } = require('@jscad/modeling').text
```

- Only **ASCII** characters supported
- `vectorChar(options, char)` — returns `{ width, segments }` where `segments` is array of point-pairs
- `vectorText(options, string)` — returns **array of segments** directly (not an object)
- Custom fonts: pass `{ font: myFontObject }` in options
- `options`: `{ xOffset, yOffset, height, lineSpacing, letterSpacing, align, extrudeOffset, font }`

```js
const segs = vectorText({ height: 10 }, 'Hello')
const paths = segs.map(seg => path2.fromPoints({ closed: false }, seg))
const shapes = paths.map(p => extrudeLinear({ height: 2 }, p))
```

## Advanced: Slice API

```js
const slice = require('@jscad/modeling').geometries.slice
```

12 functions: `create`, `fromSides`, `fromPoints`, `toPoints`, `toSides`, `toVertices`,
`isA`, `transform`, `clone`, `equals`, `validate`, `reverse`.

Used as cross-sections in `extrudeFromSlices`. Convert: `slice.fromSides(geom2.toSides(myGeom2))`.

## Advanced: Bezier

```js
const { create, valueAt, tangentAt, length, arcLengthToT } = require('@jscad/modeling').curves.bezier
```

- `create(controlPoints)` — N control points = degree N-1 curve
- `valueAt(t, bezier)` — point at parameter 0–1
- `tangentAt(t, bezier)` — tangent vector
- `length(segments, bezier)` — approximate arc length
- `arcLengthToT({target, segments}, bezier)` — map arc length to t for uniform spacing

## Advanced: Minkowski Sum

```js
const { minkowskiSum } = require('@jscad/modeling').booleans
```

- `minkowskiSum(geomA, geomB)` — 3D only
- Performance: both geometries should be **convex** for reasonable speed
- Result is the Minkowski sum (sweeps B around every point of A)

## Advanced: Modifiers

```js
const { generalize, snap } = require('@jscad/modeling').modifiers
```

- `generalize({snap, simplify, triangulate}, geom)` — cleanup pass
- `snap({epsilon}, geom)` — snap vertices to grid

## Geometry Construction (Low-level)

```js
const geom2 = require('@jscad/modeling').geometries.geom2
const geom3 = require('@jscad/modeling').geometries.geom3
const path2 = require('@jscad/modeling').geometries.path2
```

- `geom2.fromPoints(points)` — construct 2D polygon from point array (auto-closes)
- `geom2.toSides(geom)` — returns array of `[pointA, pointB]` pairs
- `geom3.fromPolygons(polygons)` — construct 3D solid from poly3 array
- `geom3.toPolygons(geom)` — returns poly3 array
- `geom3.isConvex(geom)` — boolean
- `path2.fromPoints({closed}, points)` — construct path2
- `path2.toPoints(path)` — returns point array

## Project Structure (Multi-file)

```js
// main.js
const partA = require('./partA')
const { cube } = require('@jscad/modeling').primitives

const main = (params) => [partA(params), cube()]
module.exports = { main, getParameterDefinitions }
```

JSCAD supports multi-file projects via zip upload or folder drag-drop. Entry point must export `main`.

## Supported File Formats

| Format | Read | Write | Notes |
|--------|------|-------|-------|
| JSCAD / JS | ✓ | ✓ | native |
| STL | ✓ | ✓ | ASCII and binary |
| OBJ | ✓ | ✓ | |
| AMF | ✓ | ✓ | |
| DXF | ✓ | ✓ | 2D and some 3D |
| SVG | ✓ | ✓ | 2D |
| X3D | ✓ | ✓ | |
| JSON | ✓ | ✓ | internal geometry format |
| 3MF | — | ✓ | write only |
| GCODE | — | ✓ | write only |

## Key Gotchas

- `polygon` points must be **CCW** (counter-clockwise) winding
- `geodesicSphere` uses `frequency` not `segments`
- `cylinderElliptic` makes cones: set `startRadius ≠ endRadius`
- `extrudeRotate` default is **12 segments** (low poly — increase for smooth)
- `offset` is **2D only**; use `expand` for 3D outward growth
- `scission` **returns array**, not a single geometry
- `vectorChar` returns `{ width, segments }`; `vectorText` returns array of segments directly
- `path2.appendBezier` first controlPoint = null means smooth continuation
- Do NOT mutate geometry arrays from `toSides()`/`toPolygons()` — they may be shared references
- Lazy transforms: geometry point coordinates do NOT reflect transforms until accessed through the API
- `align` default modes are `['center','center','min']` (centers XY, sits on Z=0)
- `roundRadius` is the correct param name (not `roundedRadius`)
