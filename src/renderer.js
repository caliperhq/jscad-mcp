'use strict'

const { PNG } = require('pngjs')
const { prepareRender, drawCommands, entitiesFromSolids } = require('@jscad/regl-renderer')
const { colors: { colorize } } = require('@jscad/modeling')

const WIDTH = 800
const HEIGHT = 600

let gl = null
let resizeExt = null
let renderFn = null

const getGl = () => {
  if (!gl) {
    gl = require('gl')(WIDTH, HEIGHT)
    resizeExt = gl.getExtension('STACKGL_resize_drawingbuffer')
  }
  return gl
}

/**
 * Read GL framebuffer and encode as PNG buffer (in-memory, no file I/O).
 */
const glToPng = (glCtx, width, height) => {
  const raw = new Uint8Array(width * height * 4)
  glCtx.readPixels(0, 0, width, height, glCtx.RGBA, glCtx.UNSIGNED_BYTE, raw)

  const img = new PNG({ width, height })
  // WebGL origin is bottom-left; PNG origin is top-left — flip vertically
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const src = (j * width + i) * 4
      const dst = ((height - 1 - j) * width + i) * 4
      img.data[dst] = raw[src]
      img.data[dst + 1] = raw[src + 1]
      img.data[dst + 2] = raw[src + 2]
      img.data[dst + 3] = raw[src + 3]
    }
  }
  return PNG.sync.write(img)
}

/**
 * Render solids to a PNG buffer.
 *
 * @param {object[]} solids - geom3/geom2/path2 objects
 * @param {object} camera - camera state from cameraFromAngles()
 * @param {object[]} [highlightSolids] - if set, these render normally; all others render faded
 * @param {number} [width] - image width in pixels (default 800)
 * @param {number} [height] - image height in pixels (default 600)
 * @returns {Buffer} PNG bytes
 */
const renderToPng = (solids, camera, highlightSolids = null, width = WIDTH, height = HEIGHT) => {
  const glCtx = getGl()
  if (resizeExt) resizeExt.resize(width, height)

  let entities
  if (highlightSolids && highlightSolids.length > 0) {
    const highlightSet = new Set(highlightSolids)
    const featured = solids.filter(s => highlightSet.has(s))
    const faded = solids
      .filter(s => !highlightSet.has(s))
      .map(s => colorize([0.5, 0.5, 0.5, 0.12], s))
    entities = entitiesFromSolids({}, ...featured, ...faded)
  } else {
    entities = entitiesFromSolids({}, ...solids)
  }

  const options = {
    glOptions: { gl: glCtx },
    camera,
    drawCommands: {
      drawAxis: drawCommands.drawAxis,
      drawGrid: drawCommands.drawGrid,
      drawLines: drawCommands.drawLines,
      drawMesh: drawCommands.drawMesh
    },
    rendering: {
      background: [1, 1, 1, 1],
      meshColor: [0.4, 0.6, 0.8, 1],
      lightColor: [1, 1, 1, 1],
      lightDirection: [0.2, 0.2, 1],
      lightPosition: [100, 200, 100],
      ambientLightAmount: 0.3,
      diffuseLightAmount: 0.89,
      specularLightAmount: 0.16,
      materialShininess: 8.0
    },
    smoothNormals: true,
    overrideOriginalColors: false,
    entities: [
      { visuals: { drawCmd: 'drawGrid', show: true }, size: [500, 500], ticks: [25, 5] },
      { visuals: { drawCmd: 'drawAxis', show: true }, size: 300 },
      ...entities
    ]
  }

  // prepareRender re-uses the gl context if we pass the same gl each time
  renderFn = prepareRender(options)
  renderFn(options)

  return glToPng(glCtx, width, height)
}

module.exports = { renderToPng, WIDTH, HEIGHT }
