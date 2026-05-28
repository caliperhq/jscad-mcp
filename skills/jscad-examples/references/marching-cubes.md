# Implicit Surfaces via Marching Cubes (Gyroids, TPMS)

JSCAD has no built-in implicit-surface support, but `primitives.polyhedron({points, faces})` accepts arbitrary triangle meshes. Combined with a marching-cubes implementation, this unlocks gyroids, Schwarz P/D surfaces, and other triply-periodic minimal surfaces (TPMS).

Use Paul Bourke's public-domain marching-cubes tables (`http://paulbourke.net/geometry/polygonise/`). Verify your implementation by marching a sphere (`f = √(x²+y²+z²) - 1`) and checking all vertices land near radius 1.

## The `|f|` kink trap

To turn a signed implicit function `f(x,y,z)` (e.g., the gyroid `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)`) into a thickened solid (the region where `|f| < t`), the naive choice is to march `|f| - t` and pick iso-level 0. **This breaks marching cubes.** The `|.|` operator has a kink (non-differentiable point) along `f=0`. MC's linear edge interpolation assumes a smooth function; at the kink it picks wrong crossing points and produces non-manifold triangles. Visual symptom: the polyhedron renders as a solid cube or a chaotic triangle cloud rather than a coherent lattice.

**Fix:** use `f(x,y,z)² - t²` instead. Same iso-surface (`|f| = t` ⇔ `f² = t²`), but smooth. MC produces a watertight mesh:

```javascript
const t = 0.6
const field = (x, y, z) => {
  const g = gyroidField(x, y, z, cellSize)
  return g * g - t * t   // smooth replacement for |g| - t
}
```

## Pattern: gyroid lattice cube

```javascript
const { primitives, booleans } = require('@jscad/modeling')
const { polyhedron, cuboid } = primitives
const { intersect } = booleans
const { marchingCubes } = require('./lib/marching-cubes')   // standard MC with Paul Bourke tables

const gyroidField = (x, y, z, cellSize) => {
  const k = (2 * Math.PI) / cellSize
  const X = x * k, Y = y * k, Z = z * k
  return Math.sin(X) * Math.cos(Y) + Math.sin(Y) * Math.cos(Z) + Math.sin(Z) * Math.cos(X)
}

const main = (params = {}) => {
  const p = { cellSize: 10, wallThreshold: 0.6, cubeSize: 40, resolution: 48, ...params }
  const half = p.cubeSize / 2
  const t = p.wallThreshold
  const field = (x, y, z) => {
    const g = gyroidField(x, y, z, p.cellSize)
    return g * g - t * t
  }

  // March a slightly oversized box so we can clip cleanly with intersect
  const pad = 2
  const { positions, indices } = marchingCubes({
    sampler: field,
    bbox: [[-half - pad, -half - pad, -half - pad], [half + pad, half + pad, half + pad]],
    resolution: p.resolution,
    isoLevel: 0
  })

  if (positions.length === 0) return []
  const lattice = polyhedron({ points: positions, faces: indices, orientation: 'outward' })
  return intersect(lattice, cuboid({ size: [p.cubeSize, p.cubeSize, p.cubeSize] }))
}
```

## Performance and parameters

- `resolution` (samples per axis) drives mesh fidelity *and* cost. The work scales as O(N³). 32 is draft-quality, 48 is a reasonable production default, 64+ for hero renders.
- `wallThreshold` (the `t` in `f² - t²`) controls wall thickness. Higher t = thicker walls; too high and adjacent surfaces merge into a solid block.
- The `intersect(lattice, cuboid)` clip at the end is what makes a cube-shaped piece of an infinite-periodic surface. Marching the box flush to the clip edges produces a ragged boundary; pad the MC bbox by ~2 mm and let `intersect` make the clean cut.

## Other TPMS

The same machinery works for any signed scalar field. Swap `gyroidField` for:

- **Schwarz P:** `cos(X) + cos(Y) + cos(Z)`
- **Schwarz D:** `sin(X)sin(Y)sin(Z) + sin(X)cos(Y)cos(Z) + cos(X)sin(Y)cos(Z) + cos(X)cos(Y)sin(Z)`
- **Neovius:** `3(cos(X) + cos(Y) + cos(Z)) + 4 cos(X)cos(Y)cos(Z)`

All three need the same `f² - t²` smoothing for MC to handle the thickened shell correctly.
