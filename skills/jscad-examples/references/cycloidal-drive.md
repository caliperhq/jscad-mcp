# Cycloidal Drive Profile

The cycloidal disc profile (a hypocycloid that meshes with N pins on a circle) is bug-prone. Use the canonical Hugo-Elias form:

```javascript
// pinCount=N, pinCircleRadius=R, eccentricity=e, pinRadius=rp
const cycloidProfile = ({ pinCount, pinCircleRadius, eccentricity, pinRadius, samples = 360 }) => {
  const N = pinCount, R = pinCircleRadius, e = eccentricity, rp = pinRadius
  const ratio = R / (e * N)
  const pts = []
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * 2 * Math.PI
    const psi = -Math.atan2(Math.sin((1 - N) * t), ratio - Math.cos((1 - N) * t))
    const x =  R * Math.cos(t) - rp * Math.cos(t + psi) - e * Math.cos(N * t)
    const y = -R * Math.sin(t) + rp * Math.sin(t + psi) + e * Math.sin(N * t)
    pts.push([x, y])
  }
  return pts
}
```

## Lobe count = N − 1

A 12-pin housing produces an 11-lobe disc. If you get 22 lobes, you've used the wrong form (typically `cos(N·t/(N−1))` instead of `cos(N·t)`, or wrong sign on the `psi` term).

**Verify with a unit test** that counts radial peaks — a one-line check that catches the entire family of formula errors before you ever render.

## Self-intersection constraint

`e < R/N`. Eccentricity too large relative to the pin pitch and the profile crosses itself, producing a self-intersecting polygon that JSCAD will accept but render as a degenerate shape.

## Output-pin holes overlap into a "flower"

The N−1 output-pin holes need enough room on their pitch circle. If `2π·R_holes / (N−1) < 2·hole_radius`, adjacent holes merge into a continuous void around the disc — visually a "flower" of overlapping circles instead of N−1 distinct bores.

This is exactly the kind of bug that the render-verify loop catches in one cycle: the first render shows the flower, the fix is to widen `R_holes` (or use fewer/smaller holes), and the second render confirms.

## Reduction ratio

`(N − 1) : 1`. A 12-pin housing produces an 11:1 reducer — input rotates 11 times for one output rotation.

## What makes this a good MCP demo

- Four named parts (`eccentric_input`, `cycloid_disc`, `pin_housing`, `output_pins`) — showcases `list_parts`, `highlight`, `label_parts`.
- A tiny formula error (sign on `psi`, wrong divisor in `cos`) produces a curve that *looks* similar but doesn't mesh. The render catches this; reading the code does not.
- Per-part coloring (gray housing, bronze disc, gold input, steel-blue output plate) makes the assembly self-explanatory.
