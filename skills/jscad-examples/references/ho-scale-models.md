# HO-Scale Models, Trusses, and Periodic Frames

Patterns from the HO-scale water tower and Pratt truss bridge demos. The common thread: scale-model architecture where a generative rule tiles a parameterizable count of members, and the visual verification is *orientation-sensitive* — iso views happily hide sign-convention errors that the front view exposes immediately.

## HO scale baseline

HO = 1:87. A 50-foot prototype is `50 × 12 × 25.4 / 87 ≈ 175 mm`. Build the model in mm at 1:87; the parts drop into existing layouts without further conversion.

When sizing a new HO model:

- Trackside structures: bigger than you think (water towers are ~30 ft tall = ~105 mm).
- Member thickness: 4×4 timber = `4 × 25.4 / 87 ≈ 1.17 mm`. Bridge chords are usually 8×8 to 12×12.
- 3D printer minimum wall: 0.4 mm nozzle wants ≥ 0.6 mm walls. Below that, members come out as a single bead and warp.

## The `segments:` stave trick

`primitives.cylinder` accepts a `segments:` count that controls facet smoothness. Use a *low* count deliberately when you want the facets to *be* the geometry: an 8-segment cylinder for a wooden tank reads as 8 wooden staves, no extra geometry needed.

```javascript
// Water tower tank — 8 staves at 0.6 m on a 1.5 m tank
const tank = cylinder({ radius: tankDiameter / 2, height: tankHeight, segments: staveCount })
```

Bumping `staveCount` from 8 to 48 smoothly trades stave look for smooth cylinder. Hoops (tori) around the tank should re-segment to match — use the same `segments:` count so hoop facets land on stave boundaries.

This generalizes to any model where polygonal facets are a feature, not a defect: silo walls, paneled fenders, faceted columns.

## Pratt truss diagonal rule

A through-truss railroad bridge — train on a deck at the bottom chord, between two truss walls. The Pratt diagonal pattern is **top corner of each diagonal closer to bridge center, bottom corner closer to the bridge end.** Counting left-to-right across the truss face: `\\\` on the left half, `///` on the right half, meeting at the bottom-center post in a characteristic V.

Get the topX/botX swap wrong and you've built a Howe truss instead, with the V replaced by an inverted Λ — visually similar from a distance, structurally a different load path. (Howe diagonals were used historically for timber bridges; Pratt is the canonical iron/steel pattern.)

```javascript
// For each panel i in [0, panels), the diagonal goes between bottom and top chords:
const isLeftHalf = i < panels / 2
const botX = panelLeftX + (isLeftHalf ? panelWidth : 0)   // bottom near end
const topX = panelLeftX + (isLeftHalf ? 0 : panelWidth)   // top near center
// Wrap with a thin member: hull or rectangular_extrude between (botX, botZ) and (topX, topZ)
```

### Visual verification — front view, not iso

The iso view shows the diagonals at an angle that makes `\\\` and `///` look almost identical — both diagonals project onto the screen, and your brain reads "trusses, fine." **Render the front view (`azimuth: 0, elevation: 2`) and literally count diagonals.** Left half = `\\\`, right half = `///`, meeting in a V at bottom-center. If you see an inverted Λ, you built a Howe truss.

Also worth checking on front view: portal X-bracing at both bridge ends. If the portal is closed (X-brace fills the doorway), trains can't pass through. Open the bottom of the portal by using two diagonals that meet above the deck height, not a full X.

## Brace-rotation sign convention (parallel-slash failure mode)

In a parametric frame with X-bracing per panel (water-tower frame, bridge portals), each panel has two crossed diagonals. The geometry is usually one diagonal expression with a sign flip for the other:

```javascript
const brace1 = makeBrace(+angle)    // forward slash
const brace2 = makeBrace(-angle)    // back slash
```

**Flip the wrong sign and the X becomes two parallel slashes** — the model still "looks like a water tower" from iso, because both diagonals project onto the bracing plane and you read a wall of slashes. The front view of one panel exposes it immediately: parallel `///` instead of `X`.

The lesson generalizes: any time a "mirror this geometry across an axis" operation reduces to a single sign flip, the failure mode is *both copies pointing the same way*. The iso render is unreliable for this class of bug; the orthographic view perpendicular to the symmetry axis is the catch.

## Tessellation that re-tiles

Both demos are genuinely parametric: change `panels` from 4 to 12 and the bridge re-diagonals cleanly each time; change `legCount` from 4 to 6 or `braceLevels` from 2 to 3 and the water-tower frame re-tiles.

Pattern: generate per-panel geometry inside a loop indexed by panel count, and use the panel index to pick chord positions, brace endpoints, and orientation flags. **Don't** hardcode panel positions or rotation angles — derive everything from the count + total span + per-member thickness.

```javascript
const panels = p.panels
const panelWidth = p.span / panels
const members = []
for (let i = 0; i < panels; i++) {
  const x0 = -p.span / 2 + i * panelWidth
  members.push(makeChordSegment(x0, x0 + panelWidth))
  members.push(makePost(x0))
  members.push(makeDiagonal(i, x0, panelWidth, panels))   // uses i to pick \ vs /
}
```

This is what makes the geometry "feel solved" to the user: bumping `panels` from 4 to 12 produces twelve correctly-tiled panels, not a broken model that needs hand-tweaking.

## When in doubt — orthographic, not iso

The recurring lesson across both demos: **iso views hide orientation bugs that orthographic views expose.** Pratt vs Howe (front view), X-brace vs parallel slashes (front view of one frame panel), facet count visible-vs-smooth (top-down), portal open-vs-closed (front view). Pair every iso with an orthographic that points along the symmetry axis you're verifying.
