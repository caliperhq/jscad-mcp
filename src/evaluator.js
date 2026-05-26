'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const Module = require('module')
const { measurements } = require('@jscad/modeling')

// Redirect @jscad/* imports in user files to the MCP server's own copies.
// User project directories need no node_modules installation.
const _origResolve = Module._resolveFilename
const PROVIDED = ['@jscad/modeling', '@jscad/array-utils', '@jscad/img-utils', '@jscad/regl-renderer']
const PROVIDED_PATHS = {}
for (const pkg of PROVIDED) {
  try { PROVIDED_PATHS[pkg] = require.resolve(pkg) } catch {}
}
Module._resolveFilename = function (request, parent, isMain, options) {
  if (PROVIDED_PATHS[request]) return PROVIDED_PATHS[request]
  return _origResolve.call(this, request, parent, isMain, options)
}

const { measureAggregateBoundingBox } = measurements

/** @type {{ key: string, result: object } | null} */
let cache = null

/**
 * Compute a unified bounding box from an array of solids.
 * Falls back to a unit cube if no solids or measurement fails.
 *
 * @param {object[]} solids
 * @returns {{ min: number[], max: number[] }}
 */
const computeBbox = (solids) => {
  try {
    if (!solids.length) return { min: [-1, -1, -1], max: [1, 1, 1] }
    const [[x0, y0, z0], [x1, y1, z1]] = measureAggregateBoundingBox(solids)
    return { min: [x0, y0, z0], max: [x1, y1, z1] }
  } catch {
    return { min: [-50, -50, -50], max: [50, 50, 50] }
  }
}

/**
 * Load and evaluate a .jscad module from a file path.
 * Invalidates the require cache between calls so edits are picked up.
 *
 * @param {string} filePath - absolute path to .jscad file
 * @returns {{ solids: object[], parts: Record<string,object[]>, bbox: object }}
 */
const evalFile = (filePath) => {
  const resolved = path.resolve(filePath)
  const mtime = fs.statSync(resolved).mtimeMs.toString()
  const key = `file:${resolved}:${mtime}`

  if (cache && cache.key === key) return cache.result

  // Bust require cache so edits are picked up on re-eval
  delete require.cache[resolved]
  const mod = require(resolved)

  if (typeof mod.main !== 'function') {
    throw new Error(`${filePath}: module must export a main() function`)
  }

  const rawResult = mod.main({})
  const solids = Array.isArray(rawResult) ? rawResult.flat(Infinity) : [rawResult]

  const parts = {}
  if (mod.parts && typeof mod.parts === 'object') {
    for (const [name, val] of Object.entries(mod.parts)) {
      parts[name] = Array.isArray(val) ? val : [val]
    }
  }

  const result = { solids, parts, bbox: computeBbox(solids) }
  cache = { key, result }
  return result
}

/**
 * Evaluate inline JSCAD source code.
 * Writes to a temp file, requires it, then removes from cache.
 *
 * @param {string} code - JSCAD source using require('@jscad/modeling')
 * @returns {{ solids: object[], parts: Record<string,object[]>, bbox: object }}
 */
const evalCode = (code) => {
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16)
  const key = `code:${hash}`

  if (cache && cache.key === key) return cache.result

  // Write next to this file so Node resolves @jscad/modeling from the package's node_modules
  const tmpPath = path.join(__dirname, `_eval_${hash}.js`)
  fs.writeFileSync(tmpPath, code, 'utf8')

  let result
  try {
    delete require.cache[tmpPath]
    const mod = require(tmpPath)

    if (typeof mod.main !== 'function') {
      throw new Error('Inline code must export a main() function via module.exports = { main: () => [...] }')
    }

    const rawResult = mod.main({})
    const solids = Array.isArray(rawResult) ? rawResult.flat(Infinity) : [rawResult]

    const parts = {}
    if (mod.parts && typeof mod.parts === 'object') {
      for (const [name, val] of Object.entries(mod.parts)) {
        parts[name] = Array.isArray(val) ? val : [val]
      }
    }

    result = { solids, parts, bbox: computeBbox(solids) }
    cache = { key, result }
  } finally {
    delete require.cache[tmpPath]
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  }

  return result
}

/**
 * Evaluate from a source descriptor: either { file } or { code }.
 *
 * @param {{ file?: string, code?: string }} source
 * @returns {{ solids: object[], parts: Record<string,object[]>, bbox: object }}
 */
const evaluate = (source) => {
  if (source.file) return evalFile(source.file)
  if (source.code !== undefined) return evalCode(source.code)
  throw new Error('evaluate() requires either { file } or { code }')
}

module.exports = { evaluate }
