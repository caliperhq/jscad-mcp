'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { evaluate } = require('./evaluator.js')
const { serialize } = require('@jscad/stl-serializer')
const { measurements: { measureAggregateBoundingBox } } = require('@jscad/modeling')
const log = require('./logger.js')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
}

const WWW = path.join(__dirname, '..', 'www')
const WEB_PKG = path.dirname(require.resolve('@jscad/web/package.json'))
const REGL_DIST = path.join(path.dirname(require.resolve('@jscad/regl-renderer/package.json')), 'dist')
const VIEWER_ROOTS = ['dist', 'css', 'fonts', 'imgs', 'locales', 'examples']

// ---------------------------------------------------------------------------
// SSE client registry
// ---------------------------------------------------------------------------
const clients = []
let lastEvent = null

const broadcast = (type, data) => {
  lastEvent = { type, data }
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { /* client disconnected */ }
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
const handleSse = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  res.write('retry: 3000\n\n')
  if (lastEvent) res.write(`event: ${lastEvent.type}\ndata: ${JSON.stringify(lastEvent.data)}\n\n`)
  clients.push(res)
  log.debug(`SSE client connected (total: ${clients.length})`)
  req.on('close', () => {
    const i = clients.indexOf(res)
    if (i >= 0) clients.splice(i, 1)
    log.debug(`SSE client disconnected (total: ${clients.length})`)
  })
}

const handleInfo = (req, res, cwd, port) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ cwd, port }))
}

const handleFiles = (req, res, url) => {
  const dir = url.searchParams.get('dir') || process.cwd()
  fs.readdir(dir, { withFileTypes: true }, (err, entries) => {
    if (err) { res._logError = err; res.writeHead(500); res.end(err.message); return }
    const items = entries
      .filter(e => e.isDirectory() || /\.(jscad|js)$/.test(e.name))
      .map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', path: path.join(dir, e.name) }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ dir, items }))
  })
}

const handleGeometry = (req, res, url) => {
  const filePath = url.searchParams.get('file')
  const partName = url.searchParams.get('part')
  if (!filePath) { res.writeHead(400); res.end('file param required'); return }
  try {
    const { solids, parts } = evaluate({ file: filePath })
    const targets = partName ? (parts[partName] || []) : solids
    if (!targets.length) { res.writeHead(404); res.end('no geometry'); return }
    const chunks = serialize({ binary: true }, ...targets)
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
    res.writeHead(200, { 'Content-Type': 'model/stl', 'Content-Length': buf.length })
    res.end(buf)
  } catch (err) {
    res._logError = err
    res.writeHead(500); res.end(err.message)
  }
}

const handleGeometryJson = (req, res, url) => {
  const filePath = url.searchParams.get('file')
  const partName = url.searchParams.get('part')
  if (!filePath) { res.writeHead(400); res.end('file param required'); return }
  try {
    const { solids, parts } = evaluate({ file: filePath })
    const targets = partName ? (parts[partName] || []) : solids
    const json = targets.map(solid => ({
      color: solid.color ? Array.from(solid.color) : null,
      transforms: solid.transforms ? Array.from(solid.transforms) : null,
      polygons: solid.polygons.map(p => ({
        vertices: p.vertices.map(v => Array.from(v)),
        color: p.color ? Array.from(p.color) : null,
        plane: p.plane ? Array.from(p.plane) : null
      }))
    }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(json))
  } catch (err) {
    res._logError = err
    res.writeHead(500); res.end(err.message)
  }
}

const handleRegl = (req, res, pathname) => {
  const filename = path.basename(pathname)
  const filePath = path.join(REGL_DIST, filename)
  if (!filePath.startsWith(REGL_DIST)) { res.writeHead(403); res.end(); return }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

const handleParts = (req, res, url) => {
  const filePath = url.searchParams.get('file')
  if (!filePath) { res.writeHead(400); res.end('file param required'); return }
  try {
    const { parts } = evaluate({ file: filePath })
    const result = {}
    for (const [name, partSolids] of Object.entries(parts)) {
      try {
        const [[x0, y0, z0], [x1, y1, z1]] = measureAggregateBoundingBox(partSolids)
        result[name] = {
          bbox: { min: [x0, y0, z0], max: [x1, y1, z1] },
          centroid: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
        }
      } catch {
        result[name] = { bbox: null, centroid: null }
      }
    }
    let bbox = null
    try {
      const allSolids = Object.values(parts).flat()
      if (allSolids.length) {
        const [[x0, y0, z0], [x1, y1, z1]] = measureAggregateBoundingBox(allSolids)
        bbox = { min: [x0, y0, z0], max: [x1, y1, z1] }
      }
    } catch { /* non-fatal */ }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ parts: result, bbox }))
  } catch (err) {
    res._logError = err
    res.writeHead(500); res.end(err.message)
  }
}

const handleRender = (req, res, pathname, cacheDir) => {
  const filename = path.basename(pathname)
  if (!/^[a-f0-9]{12}\.png$/.test(filename)) { res.writeHead(400); res.end('bad filename'); return }
  const filePath = path.join(cacheDir, filename)
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length })
    res.end(data)
  })
}

const handleSource = (req, res, url, pathname) => {
  // Support ?file= query param OR path-based /api/source/<absolute-path>
  let filePath = url.searchParams.get('file')
  if (!filePath && pathname && pathname.startsWith('/api/source/')) {
    filePath = pathname.slice('/api/source'.length)
  }
  if (!filePath) { res.writeHead(400); res.end('file param required'); return }
  if (!/\.(jscad|js)$/.test(filePath)) { res.writeHead(403); res.end('only .jscad and .js files'); return }
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
    res.end(data)
  })
}

const handleRemotePl = (req, res, url, port) => {
  const targetStr = url.searchParams.get('url')
  if (!targetStr) { res.writeHead(400); res.end(); return }
  let target
  try { target = new URL(targetStr) } catch { res.writeHead(400); res.end(); return }
  const isLocal = (target.hostname === 'localhost' || target.hostname === '127.0.0.1')
    && target.port === String(port)
  if (!isLocal) { res.writeHead(403); res.end('only local urls allowed'); return }
  // @jscad/web readProxy() expects JSON with a {file} path, then fetches that path directly
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ file: target.pathname }))
}

const handleViewer = (req, res, pathname) => {
  if (pathname === '/viewer' || pathname === '/viewer/') {
    return handleStatic(req, res, '/viewer.html')
  }
  const sub = pathname.replace(/^\/viewer\//, '')
  const safe = path.normalize(sub).replace(/^[/\\]+/, '')
  const root = safe.split(path.sep)[0] || safe.split('/')[0]
  if (!VIEWER_ROOTS.includes(root)) { res.writeHead(403); res.end('forbidden'); return }
  const filePath = path.join(WEB_PKG, safe)
  if (!filePath.startsWith(WEB_PKG)) { res.writeHead(403); res.end(); return }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

const handleStatic = (req, res, pathname) => {
  const safe = pathname === '/' ? 'index.html' : path.normalize(pathname).replace(/^[/\\]+/, '')
  const filePath = path.join(WWW, safe)
  if (!filePath.startsWith(WWW)) { res.writeHead(403); res.end(); return }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
    res.end(data)
  })
}

// ---------------------------------------------------------------------------
// createWebServer
// ---------------------------------------------------------------------------
const createWebServer = (cacheDir) => {
  return new Promise((resolve) => {
    const cwd = process.cwd()

    const server = http.createServer((req, res) => {
      const port = server.address().port
      const url = new URL(req.url, `http://127.0.0.1:${port}`)
      const { pathname } = url
      const origWriteHead = res.writeHead.bind(res)
      res.writeHead = (status, ...args) => {
        if (status >= 500) log.crit(`${req.method} ${pathname} → ${status}`, res._logError)
        else if (status >= 400) log.warn(`${req.method} ${pathname} → ${status}`)
        else log.info(`${req.method} ${pathname} → ${status}`)
        return origWriteHead(status, ...args)
      }

      if (pathname === '/sse') return handleSse(req, res)
      if (pathname === '/api/info') return handleInfo(req, res, cwd, port)
      if (pathname === '/api/files') return handleFiles(req, res, url)
      if (pathname === '/api/geometry') return handleGeometry(req, res, url)
      if (pathname === '/api/geometry-json') return handleGeometryJson(req, res, url)
      if (pathname === '/api/parts') return handleParts(req, res, url)
      if (pathname.startsWith('/regl/')) return handleRegl(req, res, pathname)
      if (pathname === '/api/source' || pathname.startsWith('/api/source/')) return handleSource(req, res, url, pathname)
      if (pathname.startsWith('/api/renders/')) return handleRender(req, res, pathname, cacheDir)
      if (pathname === '/viewer/remote.pl') return handleRemotePl(req, res, url, port)
      if (pathname.startsWith('/viewer')) return handleViewer(req, res, pathname)
      return handleStatic(req, res, pathname)
    })

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ port, broadcast })
    })
  })
}

module.exports = { createWebServer }
