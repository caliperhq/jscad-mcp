// title: Fractioncircle
// author: Dan Risacher
// license: Creative Commons CC BY
// URL: http://openjscad.org/#examples/logo.jscad
// revision: 0.1
// tags: 

//2,4,8,5,10,3,6
function main() {

    var thickness = 2;
    var radius = 30;
    var res = 64;
    var slices = 120;

    var result; 

    var path = new CSG.Path2D([0,0], false);
    var arc = CSG.Path2D.arc({
        center: [0,0,0],
        radius: radius,
        startangle: 0,
        endangle: 360/slices,
        resolution: res
    });
    path = path.concat(arc);
    path = path.close();
    
    //    arc = arc.close();
    var arc_solid = linear_extrude({ height: thickness }, path.innerToCAG());
    arc_solid = arc_solid.translate([3,3,0]);
    
    var l = vector_text(0,0,"1/"+slices);   
    // l contains a list of polylines to be drawn
    var o = [];
    l.forEach(function(pl) {                   // pl = polyline (not closed)
        
        o.push(rectangular_extrude(pl, {w: thickness*2, h: thickness}));   // extrude it to 3D
    });
    var text = union(o);
    text = text.scale([.25,.20,1]);
    text = text.translate([radius/3,0,thickness/2]);
    text = text.rotateZ(180/slices);
    
    arc_solid = arc_solid.subtract(text);
    //arc_solid = arc_solid.union(text);
    
    for (var i = 0; i< slices; i++) {
        var slice_instance = arc_solid.rotateZ(360/slices*i);
        result = (i===0 ? slice_instance : result.union(slice_instance));
    }
        
        // var whole = CSG.cylinder({
        //     start: [0, 0, 0],
        //     end: [0, 0, thickness],
        //     radiusStart: radius,  // start- and end radius defined, partial cones
        //     radiusEnd: radius,
        //     resolution: 64
        // });
    
    return result;
}
