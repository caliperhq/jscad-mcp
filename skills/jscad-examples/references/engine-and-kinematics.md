# Cutaway Assemblies + Slider-Crank Kinematics

Two patterns from the cutaway 4-stroke engine demo. The first applies to any cutaway assembly meant to expose internals (engines, gearboxes, pumps). The second is the kinematic chain that drives an animated piston/conrod sweep.

## Cutaway pattern: subtract from the housing, not the assembly

Cutting the assembled CSG of every part by a big slab is slow and can fail with intersecting geometry. Instead, do the cutaway subtraction **on the housing alone** — the interior parts sit inside the already-cutaway housing naturally.

```javascript
// block.js — cutaway happens HERE, cheaply, on the housing alone
const buildBlock = (p) => {
  const body = cuboid({ size: [side, side, height] })
  const bore = cylinder({ radius: bore/2, height: height + 2 })
  const cutaway = translate([side/2 + 0.001, 0, 0],
    cuboid({ size: [side/2 + 1, side + 2, height + 2] }))   // +X face removed
  return subtract(body, union(bore, cutaway))
}

// piston.js, head.js, conrod.js, etc. — built whole; sit inside the cutaway naturally
// assembly.js just unions everything via the parts map
```

From any +X-side angle the camera sees right into the bore. The internals are intact full solids; only the housing is split.

## Slider-crank piston Z position

Engine demos animate by sweeping `crankAngle`. The piston Z-position from crank angle:

```javascript
const r = stroke / 2
const L = conrodLength
const theta = (crankAngle * Math.PI) / 180
const yp = r * Math.cos(theta) + Math.sqrt(L * L - (r * Math.sin(theta)) ** 2)
// yp is the crown height above the crank center; subtract from TDC to get current z
const crownZ = tdcCrownZ - ((r + L) - yp)
```

**The frame trap.** Piston position must be re-framed against TDC, not raw `r·cos(θ) + √(L²−(r·sin θ)²)`. The raw expression is a height above the crank center; what you actually want is displacement from top-dead-center. Subtract `((r+L) − yp)` from the desired TDC crown Z.

Symptom of getting this wrong: the piston floats above the block at θ=0 instead of being flush with the deck, or it disappears below the crank at θ=180°.

## Crank pin position

For placing the conrod's big end:

```javascript
const pinY = r * Math.sin(theta)
const pinZ = crankCenterZ + r * Math.cos(theta)
```

## Crankshaft anatomy (what real cranks have)

When you build the crankshaft as a single straight cylinder with a pin offset, geometry passes through itself — no real crank can rotate. Real crankshafts have:

1. **A gap in the main journal at every throw.** The main journal does *not* run continuously through the offset; instead it's split into `leftJournal` + `rightJournal` stubs with a gap.
2. **Webs** filling the gap between the journal stubs and the offset pin. Stadium-shape (`hull(journalDisk, pinDisk)`) reads correctly.
3. **Counterweights** on the back of the webs to balance the throw mass.

Without webs, the crank pin floats next to the journal with no visible physical connection. Without the journal gap, the webs intersect the continuous journal cylinder — geometrically impossible.

## Sweep cadence

Sweep `crankAngle` 0° → 330° in 30° steps for a smooth 12-frame GIF; 0° → 350° in 10° steps for a 36-frame high-fidelity sweep at 12 fps. The slider-crank's non-linear motion (faster near mid-stroke, slower at TDC/BDC) is visible at the higher frame density and reads as "engine motion," not "uniform rotation."

See also: [Parameter Sweeps and Animation Frames](../../jscad-mcp/SKILL.md) in the `jscad-mcp` skill for how to render per-frame via inline `code:`.
