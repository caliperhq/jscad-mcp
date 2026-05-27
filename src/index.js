#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const { renderToPng, WIDTH, HEIGHT } = require('./renderer.js')
const { cameraFromAngles, STANDARD_VIEWS } = require('./camera.js')
const { evaluate } = require('./evaluator.js')
const { createWebServer } = require('./webserver.js')
const log = require('./logger.js')

process.on('uncaughtException', (err) => {
  log.crit('Uncaught exception', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log.crit('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)))
  process.exit(1)
})

const server = new McpServer({
  name: 'jscad-mcp',
  version: '0.1.0'
})

// ---------------------------------------------------------------------------
// Web viewer startup
// ---------------------------------------------------------------------------
const cacheDir = path.join(process.cwd(), '.jscad-cache')
fs.mkdirSync(cacheDir, { recursive: true })

// Append .jscad-cache/ to .gitignore if not already present
const gitignorePath = path.join(process.cwd(), '.gitignore')
try {
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
  if (!existing.includes('.jscad-cache')) {
    fs.appendFileSync(gitignorePath, '\n.jscad-cache/\n')
  }
} catch { /* non-fatal */ }

let webServer = null
let viewerOpened = false

const openViewer = () => {
  if (viewerOpened || !webServer) return
  viewerOpened = true
  const url = `http://localhost:${webServer.port}/`
  try {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* non-fatal */ }
}

const broadcastRender = (pngBuffer, meta) => {
  if (!webServer) return
  openViewer()
  const hash = crypto.createHash('sha256').update(pngBuffer).digest('hex').slice(0, 12)
  const cacheFile = path.join(cacheDir, `${hash}.png`)
  fs.writeFileSync(cacheFile, pngBuffer)
  webServer.broadcast('render', { ...meta, url: `/api/renders/${hash}.png`, timestamp: Date.now() })
}

// ---------------------------------------------------------------------------
// Math helpers for 3D→2D projection (column-major mat4 × vec4)
// ---------------------------------------------------------------------------
const mat4MulVec4 = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
  m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
]

const projectToScreen = (worldPt, camera, width, height) => {
  const clip = mat4MulVec4(camera.projection, mat4MulVec4(camera.view, [...worldPt, 1]))
  if (Math.abs(clip[3]) < 1e-9) return null
  const x = Math.round((clip[0] / clip[3] + 1) * width / 2)
  const y = Math.round((1 - clip[1] / clip[3]) * height / 2)
  return [x, y]
}

// Shared Zod schema for the source descriptor (file path OR inline code)
const sourceSchema = {
  file: z.string().optional().describe('Absolute path to a .jscad file'),
  code: z.string().optional().describe('Inline JSCAD source (must export main() via module.exports)')
}

const resolveSource = ({ file, code }) => {
  if (!file && code === undefined) throw new Error('Provide either file or code')
  return file ? { file } : { code }
}

// ---------------------------------------------------------------------------
// echo — connection verification
// ---------------------------------------------------------------------------
server.tool(
  'echo',
  'Echo a message back (used to verify MCP connection)',
  { message: z.string().describe('The message to echo') },
  async ({ message }) => ({
    content: [{ type: 'text', text: `jscad-mcp: ${message}` }]
  })
)

// ---------------------------------------------------------------------------
// render_test — pipeline smoke test (no source needed)
// ---------------------------------------------------------------------------
server.tool(
  'render_test',
  'Render a static test geometry (cube minus sphere) to verify the render pipeline works',
  {},
  async () => {
    const { primitives: { cube, sphere }, booleans: { subtract }, colors: { colorize } } = require('@jscad/modeling')
    const solid = colorize([0.3, 0.6, 1.0], subtract(cube({ size: 100 }), sphere({ radius: 65 })))
    const bbox = { min: [-50, -50, -50], max: [50, 50, 50] }

    const content = []
    for (const { name, azimuth, elevation } of STANDARD_VIEWS) {
      const camera = cameraFromAngles(azimuth, elevation, bbox, WIDTH, HEIGHT)
      const png = renderToPng([solid], camera)
      broadcastRender(png, { file: null, view: name })
      content.push({ type: 'text', text: `**${name}**` })
      content.push({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' })
    }
    return { content }
  }
)

// ---------------------------------------------------------------------------
// take_image — render from a specific camera angle
// ---------------------------------------------------------------------------
server.tool(
  'take_image',
  'Render the JSCAD model from a specific camera angle and return a PNG image',
  {
    ...sourceSchema,
    azimuth: z.number().describe('Degrees around Z axis (0 = looking from +Y, 90 = from +X)'),
    elevation: z.number().describe('Degrees above horizon (0 = side view, 89 = top-down)'),
    zoom: z.number().optional().describe('Distance multiplier, default 1.0 (fits bounding box)'),
    target: z.array(z.number()).length(3).optional().describe('[x,y,z] look-at point, default = model center'),
    width: z.number().int().positive().optional().describe('Image width in pixels (default 800)'),
    height: z.number().int().positive().optional().describe('Image height in pixels (default 600)')
  },
  async ({ file, code, azimuth, elevation, zoom = 1.0, target = null, width = WIDTH, height = HEIGHT }) => {
    let result
    try {
      result = evaluate(resolveSource({ file, code }))
    } catch (err) {
      return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }] }
    }

    const { solids, bbox } = result
    const camera = cameraFromAngles(azimuth, elevation, bbox, width, height, zoom, target)
    const png = renderToPng(solids, camera, null, width, height)
    broadcastRender(png, { file: file || null, view: 'custom', az: azimuth, el: elevation, zoom })
    return {
      content: [
        { type: 'text', text: `az=${azimuth}° el=${elevation}° zoom=${zoom} size=${width}×${height}` },
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
      ]
    }
  }
)

// ---------------------------------------------------------------------------
// take_standard_views — render iso + front + side + top in one call
// ---------------------------------------------------------------------------
server.tool(
  'take_standard_views',
  'Render the JSCAD model from four standard viewpoints (iso, front, side, top) and return all four PNG images',
  {
    ...sourceSchema,
    width: z.number().int().positive().optional().describe('Image width in pixels (default 800)'),
    height: z.number().int().positive().optional().describe('Image height in pixels (default 600)')
  },
  async ({ file, code, width = WIDTH, height = HEIGHT }) => {
    let result
    try {
      result = evaluate(resolveSource({ file, code }))
    } catch (err) {
      return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }] }
    }

    const { solids, bbox } = result
    const content = []
    for (const { name, azimuth, elevation } of STANDARD_VIEWS) {
      const camera = cameraFromAngles(azimuth, elevation, bbox, width, height)
      const png = renderToPng(solids, camera, null, width, height)
      broadcastRender(png, { file: file || null, view: name, az: azimuth, el: elevation })
      content.push({ type: 'text', text: `**${name}**` })
      content.push({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' })
    }
    return { content }
  }
)

// ---------------------------------------------------------------------------
// list_parts — enumerate named parts from the model
// ---------------------------------------------------------------------------
server.tool(
  'list_parts',
  'List all named parts exported by the JSCAD model (requires module.exports.parts = { name: geometry }). Returns names and bounding boxes.',
  sourceSchema,
  async ({ file, code }) => {
    let result
    try {
      result = evaluate(resolveSource({ file, code }))
    } catch (err) {
      return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }] }
    }

    const { parts, bbox } = result
    const partNames = Object.keys(parts)

    if (partNames.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No named parts found. To use list_parts, export a parts object:\n  module.exports = { main, parts: { lid: lidGeometry, body: bodyGeometry } }'
        }]
      }
    }

    const { measurements: { measureAggregateBoundingBox } } = require('@jscad/modeling')
    const lines = [`Model bbox: [${bbox.min.map(v => v.toFixed(1))}] → [${bbox.max.map(v => v.toFixed(1))}]`, '']
    for (const name of partNames) {
      const solids = parts[name]
      let partBbox
      try {
        const [[x0, y0, z0], [x1, y1, z1]] = measureAggregateBoundingBox(solids)
        const w = (x1 - x0).toFixed(1)
        const d = (y1 - y0).toFixed(1)
        const h = (z1 - z0).toFixed(1)
        partBbox = `${w} × ${d} × ${h}  at [${[x0, y0, z0].map(v => v.toFixed(1))}]`
      } catch {
        partBbox = '(could not measure)'
      }
      lines.push(`• ${name}: ${partBbox}`)
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
)

// ---------------------------------------------------------------------------
// highlight — render with one part called out, rest faded
// ---------------------------------------------------------------------------
server.tool(
  'highlight',
  'Render the JSCAD model with a named part highlighted (colored) and all other parts faded. Requires module.exports.parts.',
  {
    ...sourceSchema,
    part: z.string().describe('Name of the part to highlight (must be in module.exports.parts)'),
    azimuth: z.number().optional().describe('Camera azimuth in degrees (default: 45 = iso)'),
    elevation: z.number().optional().describe('Camera elevation in degrees (default: 35 = iso)')
  },
  async ({ file, code, part, azimuth = 45, elevation = 35 }) => {
    let result
    try {
      result = evaluate(resolveSource({ file, code }))
    } catch (err) {
      return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }] }
    }

    const { solids, parts, bbox } = result

    if (!parts[part]) {
      const available = Object.keys(parts)
      const hint = available.length
        ? `Available parts: ${available.join(', ')}`
        : 'No named parts found — export module.exports.parts to use highlight'
      return { content: [{ type: 'text', text: `Part "${part}" not found. ${hint}` }] }
    }

    // Build render list from parts so object identity is consistent with highlightSolids
    const allSolids = Object.values(parts).flat()
    const highlightSolids = parts[part]
    const renderSolids = allSolids.length > 0 ? allSolids : solids
    const camera = cameraFromAngles(azimuth, elevation, bbox, WIDTH, HEIGHT)
    const png = renderToPng(renderSolids, camera, highlightSolids)
    broadcastRender(png, { file: file || null, view: 'highlight', part, az: azimuth, el: elevation })

    return {
      content: [
        { type: 'text', text: `Highlighting: **${part}**` },
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
      ]
    }
  }
)

// ---------------------------------------------------------------------------
// slice — cross-section view by cutting along a plane
// ---------------------------------------------------------------------------
server.tool(
  'slice',
  'Render a cross-section of the JSCAD model by cutting along a plane. Shows the portion of the model on the negative side of the cut. Camera is auto-oriented perpendicular to the cut face.',
  {
    ...sourceSchema,
    axis: z.enum(['x', 'y', 'z']).describe('Axis perpendicular to the cut plane'),
    offset: z.number().optional().describe('Position along the axis to cut at (default: model center on that axis)')
  },
  async ({ file, code, axis, offset }) => {
    let result
    try {
      result = evaluate(resolveSource({ file, code }))
    } catch (err) {
      return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }] }
    }

    const { solids, bbox } = result
    const axisIndex = { x: 0, y: 1, z: 2 }[axis]
    const cutOffset = offset !== undefined ? offset : (bbox.min[axisIndex] + bbox.max[axisIndex]) / 2

    const { primitives: { cuboid }, booleans: { intersect }, transforms: { translate } } = require('@jscad/modeling')
    const HALF = 50000
    const cx = (bbox.min[0] + bbox.max[0]) / 2
    const cy = (bbox.min[1] + bbox.max[1]) / 2
    const cz = (bbox.min[2] + bbox.max[2]) / 2

    // Keep box: huge cube whose positive face sits at cutOffset along the chosen axis
    let keepBox
    if (axis === 'z') {
      keepBox = translate([cx, cy, cutOffset - HALF], cuboid({ size: [HALF * 2, HALF * 2, HALF * 2] }))
    } else if (axis === 'y') {
      keepBox = translate([cx, cutOffset - HALF, cz], cuboid({ size: [HALF * 2, HALF * 2, HALF * 2] }))
    } else {
      keepBox = translate([cutOffset - HALF, cy, cz], cuboid({ size: [HALF * 2, HALF * 2, HALF * 2] }))
    }

    const slicedSolids = solids.flatMap(s => {
      try { return [intersect(s, keepBox)] } catch { return [] }
    })

    if (slicedSolids.length === 0) {
      return { content: [{ type: 'text', text: `No geometry remains after slice at ${axis}=${cutOffset.toFixed(2)}. Try a different offset.` }] }
    }

    // Camera perpendicular to the cut face
    const cameraAngles = { z: { azimuth: 0, elevation: 89 }, y: { azimuth: 0, elevation: 5 }, x: { azimuth: 90, elevation: 5 } }
    const { azimuth, elevation } = cameraAngles[axis]
    const camera = cameraFromAngles(azimuth, elevation, bbox, WIDTH, HEIGHT)
    const png = renderToPng(slicedSolids, camera)
    broadcastRender(png, { file: file || null, view: 'slice', axis, offset: cutOffset })

    return {
      content: [
        { type: 'text', text: `Slice at ${axis}=${cutOffset.toFixed(2)} (showing negative side)` },
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
      ]
    }
  }
)

// ---------------------------------------------------------------------------
// label_parts — render with part names and their screen-space positions
// ---------------------------------------------------------------------------
server.tool(
  'label_parts',
  'Render the model and return a legend mapping each named part to its approximate pixel position in the image. Use this to identify parts by name in complex assemblies.',
  {
    ...sourceSchema,
    azimuth: z.number().optional().describe('Camera azimuth in degrees (default: 45 = iso)'),
    elevation: z.number().optional().describe('Camera elevation in degrees (default: 35 = iso)')
  },
  async ({ file, code, azimuth = 45, elevation = 35 }) => {
    let result
    try {
      result = evaluate(resolveSource({ file, code }))
    } catch (err) {
      return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }] }
    }

    const { solids, parts, bbox } = result
    const partNames = Object.keys(parts)

    if (partNames.length === 0) {
      const camera = cameraFromAngles(azimuth, elevation, bbox, WIDTH, HEIGHT)
      const png = renderToPng(solids, camera)
      broadcastRender(png, { file: file || null, view: 'labels', az: azimuth, el: elevation })
      return {
        content: [
          { type: 'text', text: 'No named parts found. Export module.exports.parts = { name: geometry } to use label_parts.' },
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
        ]
      }
    }

    const { measurements: { measureAggregateBoundingBox } } = require('@jscad/modeling')
    const camera = cameraFromAngles(azimuth, elevation, bbox, WIDTH, HEIGHT)
    const allSolids = Object.values(parts).flat()
    const png = renderToPng(allSolids, camera)
    broadcastRender(png, { file: file || null, view: 'labels', az: azimuth, el: elevation })

    const lines = [`Image is ${WIDTH}×${HEIGHT}px (origin top-left). Part centroids:`]
    for (const name of partNames) {
      const partSolids = parts[name]
      let centroid
      try {
        const [[x0, y0, z0], [x1, y1, z1]] = measureAggregateBoundingBox(partSolids)
        centroid = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
      } catch {
        centroid = [(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2]
      }
      const pos = projectToScreen(centroid, camera, WIDTH, HEIGHT)
      const posStr = pos ? `~(${pos[0]}, ${pos[1]})` : '(behind camera)'
      lines.push(`  ${name}: ${posStr}`)
    }

    return {
      content: [
        { type: 'text', text: lines.join('\n') },
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
      ]
    }
  }
)

// ---------------------------------------------------------------------------

server.tool(
  'open_viewer',
  'Open the jscad web viewer in the default browser. Call this when the user asks to open or show the viewer.',
  {},
  async () => {
    viewerOpened = false
    openViewer()
    const url = `http://localhost:${webServer.port}/`
    return { content: [{ type: 'text', text: `Viewer opened: ${url}` }] }
  }
)

// ---------------------------------------------------------------------------

async function main () {
  webServer = await createWebServer(cacheDir)
  const viewerUrl = `http://localhost:${webServer.port}/`
  log.info(`jscad-mcp viewer: ${viewerUrl}`)
  log.info(`Logging to ${log.logFile}`)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  log.crit('jscad-mcp fatal startup error', err instanceof Error ? err : new Error(String(err)))
  process.exit(1)
})
