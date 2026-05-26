'use strict'

const { cameras } = require('@jscad/regl-renderer')

const { perspective: perspectiveCamera } = cameras

const DEG = Math.PI / 180

/**
 * Compute a camera state from spherical angles, a bounding box, zoom, and target.
 * Coordinate system: Z-up. Azimuth=0 looks from +Y direction.
 *
 * @param {number} azimuth - degrees around Z axis, 0 = from +Y
 * @param {number} elevation - degrees above horizon, 0 = side, 90 = top-down
 * @param {object} bbox - {min:[x,y,z], max:[x,y,z]}
 * @param {number} width - viewport width
 * @param {number} height - viewport height
 * @param {number} [zoom=1.0] - distance multiplier
 * @param {number[]|null} [target=null] - look-at point, defaults to bbox center
 * @returns {object} camera state for use with regl-renderer
 */
const cameraFromAngles = (azimuth, elevation, bbox, width, height, zoom = 1.0, target = null) => {
  const az = azimuth * DEG
  const el = elevation * DEG

  const cx = (bbox.min[0] + bbox.max[0]) / 2
  const cy = (bbox.min[1] + bbox.max[1]) / 2
  const cz = (bbox.min[2] + bbox.max[2]) / 2
  const lookAt = target || [cx, cy, cz]

  const dx = bbox.max[0] - bbox.min[0]
  const dy = bbox.max[1] - bbox.min[1]
  const dz = bbox.max[2] - bbox.min[2]
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz)
  // Ensure a minimum distance so tiny models still render from a reasonable distance
  const R = Math.max(diagonal * 1.5 * zoom, 10)

  const cosEl = Math.cos(el)
  const sinEl = Math.sin(el)
  const sinAz = Math.sin(az)
  const cosAz = Math.cos(az)

  const position = [
    lookAt[0] + R * cosEl * sinAz,
    lookAt[1] + R * cosEl * cosAz,
    lookAt[2] + R * sinEl
  ]

  const camera = Object.assign({}, perspectiveCamera.defaults, {
    position,
    target: lookAt,
    up: [0, 0, 1]
  })

  perspectiveCamera.setProjection(camera, camera, { width, height })
  perspectiveCamera.update(camera, camera)

  return camera
}

const STANDARD_VIEWS = [
  { name: 'iso', azimuth: 45, elevation: 35 },
  { name: 'front', azimuth: 0, elevation: 5 },
  { name: 'side', azimuth: 90, elevation: 5 },
  { name: 'top', azimuth: 0, elevation: 89 }
]

module.exports = { cameraFromAngles, STANDARD_VIEWS }
