# Bundling Multi-File Models for Single-File Hosts

`openjscad.xyz/?uri=<raw-github-url>` expects a single file. To ship a multi-file project as a browser demo, bundle the per-part modules into one file. Naive concatenation fails because each part file declares the same top-level `const { primitives, ... } = require('@jscad/modeling')` — duplicates cause `SyntaxError: Identifier 'primitives' has already been declared`.

## IIFE wrap per part

Wrap each per-part file body in an IIFE that re-requires `@jscad/modeling` locally and returns the module's exports object:

```javascript
const block = (() => {
  const { primitives, booleans, transforms } = require('@jscad/modeling')
  const { cuboid, cylinder } = primitives
  // ... original block.js body ...
  return { buildBlock }
})()
const { buildBlock } = block
```

Node caches `@jscad/modeling` after the first call, so the per-call requires are fast. The bundler script (`scripts/bundle-engine.js` in `jscad-mcp-example`) reads each part file, strips its `'use strict'`/`module.exports`/internal `require('./...')` lines, and wraps the rest in this IIFE.

## Regex-based bundler limitations

The lighter-weight bundler in `jscad-mcp-example` (the `bundle-examples.js` flavor that destructures lib exports into top-level consts) matches:

- lib exports with a regex roughly equivalent to `module\.exports\s*=\s*\{([^}]*)\}`
- consumer requires with `const\s+\{([^}]*)\}\s*=\s*require\('\.\/[^']+'\)`

This produces two non-obvious constraints when adding a new lib-using example:

### Constraint 1 — single-line identifier-only export

**Lib exports must be `module.exports = { name1, name2, name3 }` on a single line of identifiers only.** Any of the following will silently break the bundle (the regex captures content with internal commas as if it were a destructure pattern):

- Multi-line `module.exports = {\n  w: 120,\n  values: [...]\n}`
- Inline complex values (`values: [1, 2, 3, ...]` — every array element becomes a phantom "exported name")
- Renamed exports (`module.exports = { width: w, height: h }`)

Pattern: declare values as `const` above, then export with shorthand identifiers:

```js
const w = 120
const h = 150
const values = [/* ...18000 numbers... */]
module.exports = { w, h, values }
```

### Constraint 2 — consumer must use bare destructure names

**The consumer file must use bare destructure names matching the lib's exports.** The bundler strips your `const { ... } = require('./lib/x')` line entirely and emits its own destructure with the lib's raw export names. So this **breaks**:

```js
const { w: WIDTH, values: DATA } = require('./lib/heightmap')
// BUNDLER WILL EMIT { w, values } -- WIDTH/DATA undefined
```

Use bare names and rebuild the object locally if you want a namespace:

```js
const { w, h, values } = require('./lib/heightmap')
const heightmap = { w, h, values }
```

## Symptoms of a broken bundle

- Bundled `.jscad` is *much smaller than expected*.
- Evaluating the bundle throws `ReferenceError: X is not defined`.
- The bundle evaluates but `main()` returns garbage geometry (a phantom-named lib export shadowed a real identifier).

Inspect the first few lines of the bundled output to see what destructure the bundler actually emitted — that's the fastest way to spot which constraint you violated.
