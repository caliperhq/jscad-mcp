// This is remixed from https://www.thingiverse.com/thing:1078617/files
// I simply took joostn's jscad and made it parametric
// The code is otherwise his.

// Turn this into an STL via a website like http://joostn.github.io/OpenJsCad/processfile.html
function main() {
    var VERYLARGE = 100000;

    var num = 5; //CHANGE THIS VALUE TO CHANGE THE NUMBER OF OUTLETS
    // CHANGE THESE TO CHANGE WALL THICKNESS
    var t = 2; // wall thickness
    var tabthickness = 3;



    var d1 = 12; // half the keystone spacing. Related to "w" variable
    var d2 = 3; // lip for keystone hole

    var h = 50; //height if vertically mounted
    var w = (2 * d1 + 2) * num; //width
    var d = 30; // depth if wall mounted
    var rr = 2;



    var boxouter = CSG.roundedCube({
        radius: [w / 2, h / 2, d],
        roundradius: rr
    }).intersect(CSG.cube({
        radius: [w / 2, h / 2, d / 2]
    }).translate([0, 0, d / 2]));

    var boxinner = CSG.roundedCube({
        radius: [w / 2 - t, h / 2 - t, d - t],
        roundradius: rr
    });


    // Side tabs with screw holes
    var t1 = 7;
    var t2 = 14;
    var t3 = 0;
    var tab1 = CAG.circle({ center: [w / 2 + t1, t3], radius: t2 / 2 })
        .union(CAG.rectangle({ corner1: [w / 2, t3 - t2 / 2], corner2: [w / 2 + t1, t3 + t2 / 2] }))
        .extrudeInPlane("X", "Y", tabthickness);

    var s1 = 8.2 / 2;
    var s2 = 3.5 / 2;
    var s3 = -3.2;
    var screwcutout = CSG.cylinder({ start: [0, 0, 0], end: [0, 0, s3], radiusStart: s1, radiusEnd: s2 })
        .union(CSG.cylinder({ start: [0, 0, 0], end: [0, 0, -VERYLARGE], radius: s2 }))
        .union(CSG.cylinder({ start: [0, 0, 0], end: [0, 0, VERYLARGE], radius: s1 }))
        .translate([w / 2 + t1, t3, tabthickness]);
    tab1 = tab1.subtract(screwcutout);
    var tab2 = tab1.mirroredX();
    // side tabs end


    var box = boxouter.union([tab1, tab2]).subtract(boxinner);


    //Add the keystones
    var cableradius = 7 / 2;
    var cablehole = CSG.cylinder({
        start: [0, h / 2, cableradius],
        end: [0, 0, cableradius],
        radius: cableradius
    }).union(CSG.cube({
        corner1: [-cableradius, h / 2, 0],
        corner2: [cableradius, 0, cableradius]
    }));

    let ks = keystonereceptor();

    for (let i = 0; i < num; i++) {
        var xtrans = d1 * 2 * i - (num - 1) * d1;
        box = box.subtract(cablehole.translate([xtrans, 0, 0]));
        box = box.union(ks[0].translate([xtrans, -h / 2, d2])).subtract(ks[1].translate([xtrans, -h / 2, d2]));
    }
    return box;


}

function keystonereceptor() {
    var VERYLARGE = 100000;

    var tolerance = 0.6; // adjust for your machine by trial and error

    var w1 = 14.70;
    var w1m = w1 + tolerance;
    var w2 = 16.6;
    var w2m = w2 + tolerance;
    var h1 = 16.40;
    var h1m = h1 + tolerance;
    var h2 = 19.2;
    var h2m = h2 + tolerance;
    var d2 = 8.20;
    var d1 = d2 + 0.5 + 1.1;
    var d3 = d2 - 2.3;
    var d4 = d2 + 0.8;
    var d5 = d2 + 3;
    var t1 = 2.5;
    var t2 = 2.5;
    var d6 = 2;
    var d7 = 40;

    var sidecutout2d = CAG.fromPoints([
        [0, 0],
        [0, h1m],
        [0.2, h1m],
        [d6, h1m + 1.5],
        [d6, h2m],
        [d3, h2m],
        [d3, h2m + t2],
        [d2, h2m + t2],
        [d2, h2m],
        [d2 + 0.2, h2m],
        [d2 + 2, h2m + 1],
        [d2 + 2, h2m + t1],
        [d7, h2m + t1],
        [d7, 0 - t2],
        [d2 + 2, 0 - t2],
        [d2 + 2, 0 - 1],
        [d2, 0],
        [d2, 0 - t2],
        [d3, 0 - t2],
        [d3, 0],
    ]);
    var sideprofile2d = CAG.fromPoints([
        [0, 0 - t2],
        [0, h2m + t2],
        [d5, h2m + t2],
        [d5, 0 - t2]
    ]);

    var topcutout2d = CAG.fromPoints([
        [-w1m / 2, 0],
        [-w1m / 2, d1],
        [-w2m / 2, d1],
        [-w2m / 2, d7],
        [w2m / 2, d7],
        [w2m / 2, d1],
        [w1m / 2, d1],
        [w1m / 2, 0],
    ]);

    var topprofile2d = CAG.fromPoints([
        [-w2m / 2 - t2, 0],
        [-w2m / 2 - t2, d7],
        [w2m / 2 + t2, d7],
        [w2m / 2 + t2, 0],
    ]);

    var sideprofile = sideprofile2d.extrudeInPlane("Y", "Z", VERYLARGE, { symmetrical: true });
    var topprofile = topprofile2d.extrudeInPlane("X", "Y", VERYLARGE, { symmetrical: true });

    var sidecutout = sidecutout2d.extrudeInPlane("Y", "Z", VERYLARGE, { symmetrical: true });
    var topcutout = topcutout2d.extrudeInPlane("X", "Y", VERYLARGE, { symmetrical: true });

    var outer = sideprofile.intersect(topprofile);
    var inner = sidecutout.intersect(topcutout);

    return [outer, inner];
}