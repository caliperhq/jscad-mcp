// jscadReglRenderer is injected as a global by /regl/jscad-regl-renderer.min.js
/* global jscadReglRenderer */
const { prepareRender, drawCommands, cameras, controls: reglControls, entitiesFromSolids } = jscadReglRenderer
const perspectiveCamera = cameras.perspective
const orbitControls = reglControls.orbit

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PART_COLORS = ['#4d9de0', '#e15554', '#3bb273', '#7768ae', '#e1bc29', '#ef8354', '#58a6ff', '#f5a623']
const CANVAS_BG = {
  dark: [0.047, 0.071, 0.125, 1],  // #0c1220
  light: [0.910, 0.929, 0.953, 1]  // #e8edf3
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function initTheme () {
  const stored = localStorage.getItem('jscad-viewer:theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = stored || (prefersDark ? 'dark' : 'light')
  applyTheme(theme)
}

function applyTheme (theme) {
  document.documentElement.dataset.theme = theme
  const btn = document.getElementById('theme-toggle')
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾'
  localStorage.setItem('jscad-viewer:theme', theme)
  if (viewerOptions) viewerOptions.rendering = { background: CANVAS_BG[theme] }
}

function toggleTheme () {
  const current = document.documentElement.dataset.theme || 'light'
  applyTheme(current === 'dark' ? 'light' : 'dark')
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let reglRender, viewerOptions
let camera = Object.assign({}, perspectiveCamera.defaults)
let orbitState = Object.assign({}, orbitControls.defaults)
let entities = []
let showGrid = localStorage.getItem('jscad-viewer:showGrid') !== 'false'
let showAxis = localStorage.getItem('jscad-viewer:showAxis') !== 'false'
let rotateDelta = [0, 0]
let panDelta = [0, 0]
let zoomDelta = 0
let needFit = false
let isDragging = false
let lastPointer = { x: 0, y: 0 }
let currentFile = null
let userSelectedFile = false
let cwd = ''
let showHidden = localStorage.getItem('jscad-viewer:showHidden') === 'true'
let partData = {}
let labelDivs = {}
let isolatedParts = new Set()

// ---------------------------------------------------------------------------
// regl-renderer init
// ---------------------------------------------------------------------------
function initRegl () {
  const canvas = document.getElementById('viewer-canvas')
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

  camera.position = [150, -180, 233]

  const theme = document.documentElement.dataset.theme || 'light'
  viewerOptions = {
    glOptions: { gl },
    camera,
    drawCommands: {
      drawAxis: drawCommands.drawAxis,
      drawGrid: drawCommands.drawGrid,
      drawLines: drawCommands.drawLines,
      drawMesh: drawCommands.drawMesh
    },
    rendering: { background: CANVAS_BG[theme] },
    entities: []
  }

  reglRender = prepareRender(viewerOptions)

  const wrap = document.getElementById('canvas-wrap')

  wrap.addEventListener('mousedown', (e) => {
    isDragging = true
    lastPointer = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  })
  window.addEventListener('mouseup', () => { isDragging = false })
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    const dx = e.clientX - lastPointer.x
    const dy = e.clientY - lastPointer.y
    lastPointer = { x: e.clientX, y: e.clientY }
    if (e.shiftKey || e.buttons === 4) {
      panDelta[0] += dx
      panDelta[1] += dy
    } else {
      rotateDelta[0] -= dx
      rotateDelta[1] -= dy
    }
  })
  wrap.addEventListener('wheel', (e) => {
    zoomDelta -= e.deltaY * 0.01
    e.preventDefault()
  }, { passive: false })
  wrap.addEventListener('contextmenu', (e) => e.preventDefault())

  window.addEventListener('resize', () => { /* canvas resize handled each frame */ })

  updateAndRender()
}

function updateAndRender () {
  if (rotateDelta[0] || rotateDelta[1]) {
    const updated = orbitControls.rotate({ controls: orbitState, camera, speed: 0.002 }, rotateDelta)
    orbitState = { ...orbitState, ...updated.controls }
    rotateDelta = [0, 0]
  }
  if (panDelta[0] || panDelta[1]) {
    const updated = orbitControls.pan({ controls: orbitState, camera, speed: 1 }, panDelta)
    camera.position = updated.camera.position
    camera.target = updated.camera.target
    panDelta = [0, 0]
  }
  if (zoomDelta) {
    const updated = orbitControls.zoom({ controls: orbitState, camera, speed: 0.08 }, zoomDelta)
    orbitState = { ...orbitState, ...updated.controls }
    zoomDelta = 0
  }
  if (needFit) {
    const updated = orbitControls.zoomToFit({ controls: orbitState, camera, entities })
    orbitState = { ...orbitState, ...updated.controls }
    needFit = false
  }

  const updated = orbitControls.update({ controls: orbitState, camera })
  orbitState = { ...orbitState, ...updated.controls }
  camera.position = updated.camera.position

  const wrap = document.getElementById('canvas-wrap')
  const canvas = document.getElementById('viewer-canvas')
  const pixelRatio = window.devicePixelRatio || 1
  const w = wrap.clientWidth * pixelRatio
  const h = wrap.clientHeight * pixelRatio
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    perspectiveCamera.setProjection(camera, camera, { width: w, height: h })
  }
  perspectiveCamera.update(camera)

  const gridEntity = showGrid ? {
    visuals: { drawCmd: 'drawGrid', show: true, color: [1, 1, 1, 0.1], subColor: [1, 1, 1, 0.05], fadeOut: false, transparent: true },
    size: [1000, 1000],
    ticks: [100, 10]
  } : null
  const axisEntity = showAxis ? {
    visuals: { drawCmd: 'drawAxis', show: true },
    size: 200,
    alwaysVisible: false
  } : null
  viewerOptions.entities = [gridEntity, axisEntity, ...entities].filter(Boolean)
  reglRender(viewerOptions)

  updateLabels()
  requestAnimationFrame(updateAndRender)
}

// ---------------------------------------------------------------------------
// Geometry loading
// ---------------------------------------------------------------------------
function hexToRgb (hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

async function loadFile (filePath) {
  currentFile = filePath
  const relPath = cwd && filePath.startsWith(cwd + '/') ? filePath.slice(cwd.length + 1) : filePath
  document.getElementById('active-file').textContent = relPath
  const editorUri = encodeURIComponent(location.origin + '/api/source' + filePath)
  document.getElementById('open-editor').href = `/viewer/?uri=${editorUri}&label=${encodeURIComponent(relPath)}`

  entities = []
  partData = {}
  clearLabels()
  isolatedParts.clear()

  const partsRes = await fetch(`/api/parts?file=${encodeURIComponent(filePath)}`)
  const partsJson = await partsRes.json()
  partData = partsJson.parts || {}
  const partNames = Object.keys(partData)

  if (partNames.length > 0) {
    await Promise.all(partNames.map((name, i) => loadPartGeometry(filePath, name, PART_COLORS[i % PART_COLORS.length])))
    renderPartsPanel(partNames)
    createLabels(partNames)
    document.getElementById('part-count').textContent = `${partNames.length} parts`
    document.getElementById('part-count').style.display = ''
  } else {
    await loadPartGeometry(filePath, null, PART_COLORS[0])
    document.getElementById('parts-panel').style.display = 'none'
    document.getElementById('part-count').style.display = 'none'
  }

  document.getElementById('solid-count').style.display = ''
  needFit = true
}

async function loadPartGeometry (filePath, partName, fallbackColor) {
  const url = partName
    ? `/api/geometry-json?file=${encodeURIComponent(filePath)}&part=${encodeURIComponent(partName)}`
    : `/api/geometry-json?file=${encodeURIComponent(filePath)}`
  const res = await fetch(url)
  if (!res.ok) return
  const solids = await res.json()

  const [r, g, b] = hexToRgb(fallbackColor)
  solids.forEach(s => { if (!s.color) s.color = [r, g, b, 1.0] })

  const newEntities = entitiesFromSolids({}, ...solids)
  newEntities.forEach(e => { e._partName = partName || '__root__' })
  entities.push(...newEntities)
}

// ---------------------------------------------------------------------------
// Label overlay
// ---------------------------------------------------------------------------
function createLabels (partNames) {
  const layer = document.getElementById('labels-layer')
  layer.innerHTML = ''
  labelDivs = {}
  partNames.forEach((name, i) => {
    const div = document.createElement('div')
    div.className = 'label-tag'
    div.textContent = name
    div.style.background = PART_COLORS[i % PART_COLORS.length]
    layer.appendChild(div)
    labelDivs[name] = div
  })
}

function clearLabels () {
  document.getElementById('labels-layer').innerHTML = ''
  labelDivs = {}
}

function updateLabels () {
  if (!camera.projection || !camera.view) return
  const wrap = document.getElementById('canvas-wrap')
  const W = wrap.clientWidth
  const H = wrap.clientHeight
  const v = camera.view
  const p = camera.projection
  for (const [name, div] of Object.entries(labelDivs)) {
    const d = partData[name]
    if (!d || !d.centroid) { div.style.display = 'none'; continue }
    const [cx, cy, cz] = d.centroid
    // Column-major mat4: view transform then projection
    const vx = v[0]*cx + v[4]*cy + v[8]*cz + v[12]
    const vy = v[1]*cx + v[5]*cy + v[9]*cz + v[13]
    const vz = v[2]*cx + v[6]*cy + v[10]*cz + v[14]
    const rx = p[0]*vx + p[4]*vy + p[8]*vz + p[12]
    const ry = p[1]*vx + p[5]*vy + p[9]*vz + p[13]
    const rw = p[3]*vx + p[7]*vy + p[11]*vz + p[15]
    if (rw <= 0) { div.style.display = 'none'; continue }
    const sx = (rx / rw + 1) / 2 * W
    const sy = (-ry / rw + 1) / 2 * H
    div.style.display = ''
    div.style.left = sx + 'px'
    div.style.top = sy + 'px'
  }
}

// ---------------------------------------------------------------------------
// Parts panel
// ---------------------------------------------------------------------------
function renderPartsPanel (partNames) {
  const panel = document.getElementById('parts-panel')
  const list = document.getElementById('parts-list')
  panel.style.display = ''
  list.innerHTML = ''
  partNames.forEach((name, i) => {
    const item = document.createElement('div')
    item.className = 'part-item'
    item.dataset.part = name
    const dot = document.createElement('div')
    dot.className = 'part-dot'
    dot.style.background = PART_COLORS[i % PART_COLORS.length]
    item.appendChild(dot)
    item.appendChild(document.createTextNode(name))
    item.addEventListener('click', () => toggleIsolation(name, item))
    list.appendChild(item)
  })
}

function toggleIsolation (name, item) {
  if (isolatedParts.has(name)) {
    isolatedParts.delete(name)
    item.classList.remove('isolated')
  } else {
    isolatedParts.add(name)
    item.classList.add('isolated')
  }
  entities.forEach(e => {
    if (!e._partName) return
    const faded = isolatedParts.size > 0 && !isolatedParts.has(e._partName)
    e.visuals.show = !faded
  })
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme()
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme)
  initRegl()
  initFileBrowser()
  initSse()
  initThumbs()
  document.getElementById('port-badge').textContent = `localhost:${location.port}`
  const toggleEl = document.getElementById('toggle-hidden')
  toggleEl.checked = showHidden
  toggleEl.addEventListener('change', async () => {
    showHidden = toggleEl.checked
    localStorage.setItem('jscad-viewer:showHidden', showHidden)
    await refreshFileTree()
  })

  const gridToggle = document.getElementById('toggle-grid')
  gridToggle.checked = showGrid
  gridToggle.addEventListener('change', () => {
    showGrid = gridToggle.checked
    localStorage.setItem('jscad-viewer:showGrid', showGrid)
  })

  const axisToggle = document.getElementById('toggle-axis')
  axisToggle.checked = showAxis
  axisToggle.addEventListener('change', () => {
    showAxis = axisToggle.checked
    localStorage.setItem('jscad-viewer:showAxis', showAxis)
  })
})

// ---------------------------------------------------------------------------
// File browser
// ---------------------------------------------------------------------------
async function initFileBrowser () {
  const infoRes = await fetch('/api/info')
  const info = await infoRes.json()
  cwd = info.cwd
  await renderDir(cwd, document.getElementById('file-tree'), 0)
}

async function renderDir (dir, container, depth) {
  const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`)
  const { items } = await res.json()

  for (const item of items) {
    if (!showHidden && item.name.startsWith('.')) continue
    const el = document.createElement('div')
    el.className = 'tree-item' + (depth > 0 ? ' indent' : '')
    el.textContent = (item.type === 'dir' ? '📁 ' : '') + item.name
    el.title = item.path

    if (item.type === 'dir') {
      let expanded = false
      let subContainer = null
      el.addEventListener('click', async (e) => {
        e.stopPropagation()
        expanded = !expanded
        el.textContent = (expanded ? '📂 ' : '📁 ') + item.name
        if (expanded) {
          subContainer = document.createElement('div')
          container.insertBefore(subContainer, el.nextSibling)
          await renderDir(item.path, subContainer, depth + 1)
        } else if (subContainer) {
          subContainer.remove()
          subContainer = null
        }
      })
    } else {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        document.querySelectorAll('.tree-item.active').forEach(n => n.classList.remove('active'))
        el.classList.add('active')
        userSelectedFile = true
        loadFile(item.path)
      })
    }

    container.appendChild(el)
  }
}

async function refreshFileTree () {
  const container = document.getElementById('file-tree')
  container.innerHTML = ''
  await renderDir(cwd, container, 0)
}

// ---------------------------------------------------------------------------
// SSE — auto-push renders from MCP
// ---------------------------------------------------------------------------
function initSse () {
  const indicator = document.getElementById('live-indicator')
  const connect = () => {
    const es = new EventSource('/sse')
    es.addEventListener('render', (e) => {
      const data = JSON.parse(e.data)
      addThumbnail(data)
      if (data.file && data.file !== currentFile && !userSelectedFile) loadFile(data.file)
    })
    es.onopen = () => indicator.classList.remove('disconnected')
    es.onerror = () => {
      indicator.classList.add('disconnected')
      es.close()
      setTimeout(connect, 3000)
    }
  }
  connect()
}

// ---------------------------------------------------------------------------
// Thumbnail strip
// ---------------------------------------------------------------------------
function initThumbs () {
  document.getElementById('overlay-close').addEventListener('click', () => {
    document.getElementById('thumb-overlay').style.display = 'none'
  })
}

function addThumbnail (data) {
  const strip = document.getElementById('thumb-strip')
  const thumb = document.createElement('div')
  thumb.className = 'thumb'

  const img = document.createElement('img')
  img.src = data.url
  img.alt = data.view || 'render'
  thumb.appendChild(img)

  const label = document.createElement('div')
  label.className = 'thumb-label'
  label.textContent = formatView(data)
  thumb.appendChild(label)

  const dot = document.createElement('div')
  dot.className = 'thumb-new'
  thumb.appendChild(dot)
  setTimeout(() => dot.remove(), 3000)

  thumb.addEventListener('click', () => openOverlay(data.url))
  strip.appendChild(thumb)
  strip.scrollLeft = strip.scrollWidth
}

function formatView (data) {
  if (data.view === 'highlight') return `hl: ${data.part}`
  if (data.view === 'slice') return `slice ${data.axis}=${data.offset?.toFixed(1)}`
  if (data.view === 'labels') return 'labels'
  if (data.view === 'test') return 'test'
  return data.view || 'render'
}

function openOverlay (url) {
  document.getElementById('overlay-img').src = url
  document.getElementById('thumb-overlay').style.display = 'flex'
}
