/*
* Coffee Dripper
*/
// settings for jslint:
/* global CSG hull circle cylinder cube linear_extrude difference union intersection */

var height = 128 // total height of the funnel part
var baseWidth = 54 // width of the bottom of the funnel
var baseDepth = 18 // thickness of the bottom of the funnel
var topWidth = 155 // width across the top of the funnel
var finalSeparation = 0 // set this to >0 to have an oblong top

// configs for base
var outerRadius = 65 // width of the plate that sits above the cup/pot
var innerRadius = 36 // inner ring sits inside cup
var innerHeight = 28 // height of inner ring

var useRafts = false // add raft 'disks' to help with ABS warping
var noSupport = false // add features to help print without supports
// set to false if you'd rather print with supports provided by your slicer
var showCone = true // set to true to make the cone rotated 180deg for printing
var showBase = false // set to true to make the base for printing
// setting both of the above will print the base and cone together (not good for printing but make a good visual)

var startRadius = baseDepth / 2
var startSeparation = baseWidth - baseDepth
var finalRadius = topWidth / 2

var steps = 10
var wall = 3
var holeSize = 2
var fn = 128

function funnel () {
  // make the funnel
  var s = hull(
    circle({r: startRadius, center: true, fn: fn})
      .translate([-1 * (startSeparation / 2), 0, 0]),
    circle({r: startRadius, center: true, fn: fn})
      .translate([startSeparation / 2, 0, 0])
  )

  var slice = CSG.Polygon.createFromPoints(s.getOutlinePaths()[0].points)

  var part = slice.solidFromSlices({
    numslices: steps,
    callback: function (x) {
      var sl = hull(
        circle({r: startRadius + (x * (finalRadius - startRadius)), center: true, fn: fn})
          .translate([-1 * ((startSeparation / 2) - (x * startSeparation - finalSeparation) / 2), 0]),
        circle({r: startRadius + (x * (finalRadius - startRadius)), center: true, fn: fn})
          .translate([(startSeparation / 2) - (x * startSeparation - finalSeparation) / 2, 0])
      )
      return CSG.Polygon.createFromPoints(sl.getOutlinePaths()[0].points).translate([0, 0, x * height])
    }
  })
  // add holes, posts and a base to the funnel
  var zOffset = noSupport ? -0.15 : 0.0 // a non-zero offset will leave a thin wall over the bottom holes so they can be printed w/0 supports
  var funnel = difference(
    union(part,
      cylinder({r1: startSeparation + wall, r2: 5, h: (startSeparation + wall) / 2}).translate([0, 0, 2]),
      cylinder({r: startSeparation + wall, h: 2})
    ),
    part.translate([0, 0, wall]),
    cylinder({r: holeSize, h: wall}).translate([0, 0, zOffset]),
    cylinder({r: holeSize, h: wall}).translate([startSeparation / 2, 0, zOffset]),
    cylinder({r: holeSize, h: wall}).translate([-1 * startSeparation / 2, 0, zOffset]),
    cylinder({r: holeSize + 0.3, h: wall * 3}).translate([0, startSeparation / 2 + 3, 0]),
    cylinder({r: holeSize + 0.3, h: wall * 3}).translate([0, -1 * startSeparation / 2 - 3, 0])
  )
  // TODO: these need to be made parametric
  var ribs = union(
    cylinder({start: [0, startRadius, 0], end: [finalRadius * Math.sin(toRadians(0)), finalRadius * Math.cos(toRadians(0)), height], r: 2, fn: 16}),
    cylinder({start: [8, startRadius, 0], end: [finalRadius * Math.sin(toRadians(8)), finalRadius * Math.cos(toRadians(8)), height], r: 2, fn: 16}),
    cylinder({start: [-8, startRadius, 0], end: [finalRadius * Math.sin(toRadians(-8)), finalRadius * Math.cos(toRadians(-8)), height], r: 2, fn: 16}),
    cylinder({start: [16, startRadius, 0], end: [finalRadius * Math.sin(toRadians(16)), finalRadius * Math.cos(toRadians(16)), height], r: 2, fn: 16}),
    cylinder({start: [-16, startRadius, 0], end: [finalRadius * Math.sin(toRadians(-16)), finalRadius * Math.cos(toRadians(-16)), height], r: 2, fn: 16}),
    cylinder({start: [24, startRadius - 2, 0], end: [finalRadius * Math.sin(toRadians(35)), finalRadius * Math.cos(toRadians(35)), height], r: 2, fn: 16}),
    cylinder({start: [-24, startRadius - 2, 0], end: [finalRadius * Math.sin(toRadians(-35)), finalRadius * Math.cos(toRadians(-35)), height], r: 2, fn: 16}),

    cylinder({start: [0, -1 * startRadius, 0], end: [finalRadius * Math.sin(toRadians(180)), finalRadius * Math.cos(toRadians(180)), height], r: 2, fn: 16}),
    cylinder({start: [8, -1 * startRadius, 0], end: [finalRadius * Math.sin(toRadians(172)), finalRadius * Math.cos(toRadians(172)), height], r: 2, fn: 16}),
    cylinder({start: [-8, -1 * startRadius, 0], end: [finalRadius * Math.sin(toRadians(-172)), finalRadius * Math.cos(toRadians(-172)), height], r: 2, fn: 16}),
    cylinder({start: [16, -1 * startRadius, 0], end: [finalRadius * Math.sin(toRadians(164)), finalRadius * Math.cos(toRadians(164)), height], r: 2, fn: 16}),
    cylinder({start: [-16, -1 * startRadius, 0], end: [finalRadius * Math.sin(toRadians(-164)), finalRadius * Math.cos(toRadians(-164)), height], r: 2, fn: 16}),
    cylinder({start: [24, -1 * startRadius + 2, 0], end: [finalRadius * Math.sin(toRadians(145)), finalRadius * Math.cos(toRadians(145)), height], r: 2, fn: 16}),
    cylinder({start: [-24, -1 * startRadius + 2, 0], end: [finalRadius * Math.sin(toRadians(-145)), finalRadius * Math.cos(toRadians(-145)), height], r: 2, fn: 16})
  )
  ribs = intersection(
    difference(
      part.translate([0, 0, wall]),
      cylinder({r: finalRadius, h: height * 8.25 + 5}).translate([0, 0, height * 0.75])
    ),
    ribs)
  if (noSupport) {
    var supports = difference(
      union(
        cube({size: [2, startRadius * 4.5, startRadius * 3], center: [true, true, false]}).translate([startSeparation / 4, 0, 0]),
        cube({size: [2, startRadius * 4.5, startRadius * 3], center: [true, true, false]}).translate([-1 * startSeparation / 4, 0, 0])
      ),
      cube({size: [startSeparation, startRadius * 4, startRadius * 4], center: [true, true, false]})
        .rotate([0, 0, (startRadius * 4) / 2], [1, 0, 0], 45)
        .translate([0, 0, startRadius])
    ).translate([0, 0, wall])

    funnel = union(funnel, supports)
  }
  return union(ribs, funnel)
}

function basePlate () {
  // create a clip on base
  var basePlate = difference(
    union(
      // base ring with inset for funnel base
      difference(
        cylinder({r: outerRadius, h: wall * 2, fn: fn}),
        cylinder({r: startSeparation + wall + 0.4, h: 4, fn: fn}).translate([0, 0, (wall * 2) - 4])
      ).translate([0, 0, -1 * wall * 2]),
      // cup collar
      difference(
        cylinder({r: innerRadius, h: innerHeight, fn: fn}),
        cylinder({r: innerRadius - wall / 2, h: innerHeight, fn: fn})
      ).translate([0, 0, -1 * (innerHeight + (wall * 2))]),
      // pegs
      cylinder({r: holeSize + 0.1, h: wall * 2, fn: fn}).translate([0, startSeparation / 2 + 3, -1 * wall * 2]),
      cylinder({r: holeSize + 0.1, h: wall * 2, fn: fn}).translate([0, -1 * startSeparation / 2 - 3, -1 * wall * 2])
    ),

    // oblong cutout for coffee drain
    linear_extrude(
      {height: wall * 3},
      hull(
        circle({r: holeSize * 4, center: true, fn: fn}).translate([startSeparation / 2, 0]),
        circle({r: holeSize * 4, center: true, fn: fn}).translate([-1 * (startSeparation / 2), 0])
      )
    ).translate([0, 0, -1 * wall * 3])
  ).translate([0, 0, 2])

  return basePlate
}

function toRadians (angle) {
  return angle * (Math.PI / 180)
}

function rafts () {
  return union(
    cylinder({r: 20, h: 0.2, center: true}).translate([finalRadius * Math.sin(toRadians(45)), finalRadius * Math.cos(toRadians(45)), height - 0.2]),
    cylinder({r: 20, h: 0.2, center: true}).translate([finalRadius * Math.sin(toRadians(135)), finalRadius * Math.cos(toRadians(135)), height - 0.2]),
    cylinder({r: 20, h: 0.2, center: true}).translate([finalRadius * Math.sin(toRadians(-45)), finalRadius * Math.cos(toRadians(-45)), height - 0.2]),
    cylinder({r: 20, h: 0.2, center: true}).translate([finalRadius * Math.sin(toRadians(-135)), finalRadius * Math.cos(toRadians(-135)), height - 0.2])
  )
}

function main () {
// add rafts for printing ABS
  if (showCone) {
    var cone = funnel()
    if (useRafts) {
      cone = union(cone, rafts())
    }
  }

  if (showBase) {
    var base = basePlate()
  }
  if (showBase && showCone) {
    return union(cone.translate([0, 0, -2]), base)
  } else if (showCone) {
    return cone // rotateX(180).translate([0, 0, height])
    // return cone
  } else if (showBase) {
    return base.rotateX(180).translate([0, 0, wall])
  } else {
    return circle({r: 3, center: true})
  }
}
