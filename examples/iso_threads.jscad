//
// iso_threads - port of OpenSCAD ISO Threads library at http://www.thingiverse.com/thing:311031
// this is a line for line conversion - future version should made object oriented

// For thread dimensions see
//   http://en.wikipedia.org/wiki/File:ISO_and_UTS_Thread_Dimensions.svg

var fn=90;  //ckj - set CSG.defaultResolution2D and CSG.defaultResolution3D?
var WrenchSizes=0;	// =0= Rolson sizes, =1=Fairbury sizes


//--demo functions--------------------------------------------------------------
//hex_bolt(10,16);						// make an M10 x 16 ISO bolt
//hex_nut(10);							// make an M10 ISO nut
//hex_bolt(8,16);						// make an M8 x 16 ISO bolt
//hex_nut(8);							// make an M8 ISO nut
//hex_bolt(6,12);						// make an M6 x 12 ISO bolt
//hex_nut(6);							// make an M6 ISO nut
//thread_out(8,16);					// make an M8 x 16 ISO thread
//thread_out_centre(8,16);				// make a centre for an M8 x 16 ISO thread
//thread_out_pitch(8,16,1.0);			// make an M8 x 16 thread with 1 mm pitch
//thread_out_centre_pitch(8,16,0.5);	// make the centre for an M8 x 16 thread with 1 mm pitch
//thread_in(8,10);						// make an M8 x 10 ISO thread
//thread_in_ring(8,10,2);				// make a ring to enclose an M8 x 10 ISO thread with thickness 2 mm
//thread_in_pitch(8,10,1.0);			// make an M8 x 10 thread with 1mm pitch

//--pitch-----------------------------------------------------------------------
// function for ISO coarse thread pitch (these are specified by ISO)
  function get_coarse_pitch(dia) {
      diameters = {1:0.25,1.2:0.25,1.4:0.3,1.6:0.35,1.8:0.35,
                   2:0.4,2.5:0.45,3:0.5,3.5:0.6,
                   4:0.7,5:0.8,6:1,7:1,8:1.25,
                   10:1.5,12:1.75,14:2,16:2,18:2.5,
                   20:2.5,22:2.5,24:3,27:3,
                   30:3.5,33:3.5,36:4,39:4,
                   42:4.5,45:4.5,48:5,52:5,56:5.5,
                   60:5.5,64:6,78:5};
      return diameters[dia];
    }
//--nut dims--------------------------------------------------------------------
// these are NOT specified by ISO
// support is provided for Rolson or Fairbury sizes, see WrenchSizes above

// function for Rolson hex nut diameter from thread size
function rolson_hex_nut_dia(dia) {
  diameters = { 3:6.4,4:8.1,5:9.2,6:11.5,8:16.0,10:19.6,
    12:22.1,16:27.7,20:34.6,24:41.6,30:53.1,36:63.5 };
  return diameters[dia];
}
// function for Rolson hex nut height from thread size
function rolson_hex_nut_hi(dia) {
  diameters = { 3:2.4,4:3.2,5:4,6:3,8:5,10:5,12:10,16:13,20:16,
    24:19,30:24,36:29 };
  return diameters[dia];
}
// function for Fairbury hex nut diameter from thread size
function fairbury_hex_nut_dia(dia) {
  diameters = { 3:6.0,4:7.7,5:8.8,6:11.0,8:14.4,10:17.8,12:20.0,
    16:26.8,20:33.0,24:40.0,30:50.9,36:60.8 };
    return diameters[dia];
  }
// function for Fairbury hex nut height from thread size
function fairbury_hex_nut_hi(dia) {
  diameters = { 3:2.2,4:3.0,5:4.5,6:5.0,8:6.5,10:8.1,12:10.4,
    16:14.2,20:17,24:20.3,30:24.4,36:29.5 };
    return diameters[dia];
  }

//--bolt dims-------------------------------------------------------------------
// these are NOT specified by ISO
// support is provided for Rolson or Fairbury sizes, see WrenchSizes above

// function for Rolson hex bolt head diameter from thread size
function rolson_hex_bolt_dia(dia) {
  diameters = {3:6.4,4:8.1,5:9.2,6:11.5,8:14.0,10:16,12:22.1,
    16:27.7,20:34.6,24:41.6,30:53.1,36:63.5};
    return diameters[dia];
  }
// function for Rolson hex bolt head height from thread size
function rolson_hex_bolt_hi(dia) {
  diameters = {3:2.4,4:3.2,5:4,6:3.5,8:4.5,10:5,12:10,16:13,
    20:16,24:19,30:24,36:29};
    return diameters[dia];
  }

// function for Fairbury hex bolt head diameter from thread size
function fairbury_hex_bolt_dia(dia) {
  diameters = {3:6.4,4:8.1,5:8.8,6:11.1,8:14.4,10:17.8,12:20.1,
    16:26.8,20:33.0,24:39.6,30:50.9,36:60.8};
    return diameters[dia];
  }
// function for Fairbury hex bolt head height from thread size
function fairbury_hex_bolt_hi(dia) {
  diameters = {3:2.4,4:3.2,5:3.4,6:3.9,8:5.1,10:6.2,12:7.3,
    16:9.7,20:12.2,24:14.6,30:17.9,36:21.7};
    return diameters[dia];
  }

//--top level modules-----------------------------------------------------------

// make an ISO bolt
//  dia=diameter, 6=M6 etc.
//  hi=length of threaded part of bolt
function hex_bolt(dia,hi) {
	if (WrenchSizes==0)	{
    return rolson_hex_bolt(dia,hi);
	} else {
    return fairbury_hex_bolt(dia,hi);
  }
}

// make an ISO nut
//  dia=diameter, 6=M6 etc.
function hex_nut(dia,hi) {
	if (WrenchSizes==0) {
    return rolson_hex_nut(dia);
	} else {
    return fairbury_hex_nut(dia);
  }
}

// make an outside ISO thread (as used on a bolt)
//  dia=diameter, 6=M6 etc
//  hi=height, 10=make a 10mm long thread
//  thr=thread quality, 10=make a thread with 10 segments per turn
function thread_out(dia,hi,thr=fn) {
	p = get_coarse_pitch(dia);
	return thread_out_pitch(dia,hi,p,thr);
}

// make an inside thread (as used on a nut)
//  dia = diameter, 6=M6 etc
//  hi = height, 10=make a 10mm long thread
//  thr = thread quality, 10=make a thread with 10 segments per turn
function thread_in(dia,hi,thr=fn) {
	p = get_coarse_pitch(dia);
	return thread_in_pitch(dia,hi,p,thr);
}

// make an outside thread (as used on a bolt) with supplied pitch
//  dia=diameter, 6=M6 etc
//  hi=height, 10=make a 10mm long thread
//  p=pitch
//  thr=thread quality, 10=make a thread with 10 segments per turn
//////// unfin /////////////
function thread_out_pitch(dia,hi,p,thr=fn) {
	h=(cos(30)*p)/8;
	Rmin=(dia/2)-(5*h);	// as wiki Dmin
	s=360/thr;				// length of segment in degrees
	t1=(hi-p)/p;			// number of full turns
	r=t1%1.0;				// length remaining (not full turn)
	t=t1-r;					// integer number of full turns
	n=r/(p/thr);			// number of segments for remainder
	// do full turns
  var ret = new CSG();
	for(tn=0;tn<=t-1;tn++) {
		ret=ret.union(th_out_turn(dia,p,thr).translate([0,0,tn*p]));
  }
	// do remainder
  for(sg=0;sg<=n;sg++){
		ret=ret.union(th_out_pt(Rmin+0.1,p,s,sg+(t*thr),thr,h,p/thr));
  }
  return ret;
}

// make an inside thread (as used on a nut)
//  dia = diameter, 6=M6 etc
//  hi = height, 10=make a 10mm long thread
//  p=pitch
//  thr = thread quality, 10=make a thread with 10 segments per turn
function thread_in_pitch(dia,hi,p,thr=fn) {
	h=(cos(30)*p)/8;
	Rmin=(dia/2)-(5*h);	// as wiki Dmin
	s=360/thr;				// length of segment in degrees
	t1=(hi-p)/p;			// number of full turns
	r=t1%1.0;				// length remaining (not full turn)
	t=t1-r;					// integer number of turns
	n=r/(p/thr);			// number of segments for remainder
  var ret = new CSG();
  for(tn=0; tn<=t-1; tn++) {
	  ret=ret.union(th_in_turn(dia,p,thr).translate([0,0,tn*p]));
  }

  for(sg=0;sg<=n;sg++) {
	  ret=ret.union(th_in_pt(Rmin+0.1,p,s,sg+(t*thr),thr,h,p/thr));
  }

  return ret;
}

function thread_out_centre(dia,hi)
{
	p = get_coarse_pitch(dia);
	return thread_out_centre_pitch(dia,hi,p);
}

function thread_out_centre_pitch(dia,hi,p)
{
	h = (cos(30)*p)/8;
	Rmin = (dia/2) - (5*h);	// as wiki Dmin
	return cylinder({r:Rmin, h:hi});
}

function thread_in_ring(dia,hi,thk)
{
	ret = difference(
		cylinder({r:(dia/2)+0.5+thk, h:hi+thk, fn:fn}),
		cylinder({r:(dia/2)+0.1, h:hi+thk, fn:fn}).translate([0,0,-1])
	);
  return ret;
}

//--low level modules-----------------------------------------------------------

// make an ISO bolt with Rolson wrench sizes
//  dia=diameter, 6=M6 etc.
//  hi=length of threaded part of bolt
function rolson_hex_bolt(dia,hi) {
	hhi = rolson_hex_bolt_hi(dia);
  ret = union(
    cylinder({r:rolson_hex_bolt_dia(dia)/2, h:hhi, fn:6}),
	  thread_out(dia,hi+0.1).translate([0,0,hhi-0.1]),
	  thread_out_centre(dia,hi+0.1).translate([0,0,hhi-0.1])
  );
 return ret;
}

// make an ISO bolt with Fairbury wrench sizes
//  dia=diameter, 6=M6 etc.
//  hi=length of threaded part of bolt
function fairbury_hex_bolt(dia,hi) {
	hhi = fairbury_hex_bolt_hi(dia);
  ret = union (
	  cylinder({r:fairbury_hex_bolt_dia(dia)/2, h:hhi, fn:6}),
	  thread_out(dia,hi+0.1).translate([0,0,hhi-0.1]),
	  thread_out_centre(dia,hi+0.1).translate([0,0,hhi-0.1])
  );
  return ret;
}

// make an ISO nut with Rolson wrench sizes
//  dia=diameter, 6=M6 etc.
function rolson_hex_nut(dia) {
	hi = rolson_hex_nut_hi(dia);
	ret = difference(
		cylinder({r:rolson_hex_nut_dia(dia)/2, h:hi, fn:6}),
		cylinder({r:dia/2, h:hi + 0.2}).translate([0,0,-0.1])
	);
	ret2 = thread_in(dia,hi-0.2).translate([0,0,0.1]);
  return union(ret, ret2);
}

// make an ISO nut with Fairbury wrench sizes
//  dia=diameter, 6=M6 etc.
function fairbury_hex_nut(dia) {
	hi = fairbury_hex_nut_hi(dia);
	ret = difference(
		cylinder({r:fairbury_hex_nut_dia(dia)/2, h:hi, fn:6}),
		cylinder({r:dia/2, h:hi + 0.2}).translate([0,0,-0.1])
	);
	ret2 = thread_in(dia,hi-0.2).translate([0,0,0.1]);
  return union(ret, ret2);
}

// make a single turn of an outside thread
//  dia=diameter, 6=M6 etc
//  p=pitch
//  thr=thread quality, 10=make a thread with 10 segments per turn
function th_out_turn(dia,p,thr=fn) {
	h = (cos(30)*p)/8;
	Rmin = (dia/2) - (5*h);	// as wiki Dmin
	s = 360/thr;
  var ret = new CSG();
	for(sg=0; sg <= thr-1; sg++) {
		ret = ret.union(th_out_pt(Rmin+0.1,p,s,sg,thr,h,p/thr));
  }
  return ret;
}

// make a part of an outside thread (single segment)
//  rt = radius of thread (nearest centre)
//  p = pitch
//  s = segment length (degrees)
//  sg = segment number
//  thr = segments in circumference
//  h = ISO h of thread / 8
//  sh = segment height (z)
function th_out_pt(rt,p,s,sg,thr,h,sh) {
	as = (sg % thr) * s;			// angle to start of seg
	ae = as + s  - (s/100);		// angle to end of seg (with overlap)
	z = sh*sg;
	//pp = p/2;
	//   1,4
	//   |\
	//   | \  2,5
 	//   | /
	//   |/
	//   0,3
	//  view from front (x & z) extruded in y by sg
	//
	//echo(str("as=",as,", ae=",ae," z=",z));
	return polyhedron({
		points:[
			[cos(as)*rt,sin(as)*rt,z],								// 0
			[cos(as)*rt,sin(as)*rt,z+(3/4*p)],						// 1
			[cos(as)*(rt+(5*h)),sin(as)*(rt+(5*h)),z+(3/8*p)],		// 2
			[cos(ae)*rt,sin(ae)*rt,z+sh],							// 3
			[cos(ae)*rt,sin(ae)*rt,z+(3/4*p)+sh],					// 4
			[cos(ae)*(rt+(5*h)),sin(ae)*(rt+(5*h)),z+sh+(3/8*p)]],	// 5
		triangles:[
			[0,1,2],			// near face
			[3,5,4],			// far face
			[0,3,4],[0,4,1],	// left face
			[0,5,3],[0,2,5],	// bottom face
			[1,4,5],[1,5,2]]  // top face
    });
}


// make an single turn of an inside thread
//  dia = diameter, 6=M6 etc
//  p=pitch
//  thr = thread quality, 10=make a thread with 10 segments per turn
function th_in_turn(dia,p,thr=fn)
{
	h = (cos(30)*p)/8;
	Rmin = (dia/2) - (5*h);	// as wiki Dmin
	s = 360/thr;
  var ret = new CSG();
	for(sg=0; sg <= thr-1; sg++) {
		ret = ret.union(th_in_pt(Rmin+0.1,p,s,sg,thr,h,p/thr));
  }
  return ret;
}

// make a part of an inside thread (single segment)
//  rt = radius of thread (nearest centre)
//  p = pitch
//  s = segment length (degrees)
//  sg = segment number
//  thr = segments in circumference
//  h = ISO h of thread / 8
//  sh = segment height (z)
function th_in_pt(rt,p,s,sg,thr,h,sh) {
  console.log("log:"+sh);
	as = ((sg % thr) * s - 180);	// angle to start of seg
	ae = as + s -(s/100);		// angle to end of seg (with overlap)
	z = sh*sg;
	pp = p/2;
	//         2,5
	//          /|
	//     1,4 / |
 	//         \ |
	//          \|
	//         0,3
	//  view from front (x & z) extruded in y by sg
	//
	return polyhedron({
		points:[
			[cos(as)*(rt+(5*h)),sin(as)*(rt+(5*h)),z],				//0
			[cos(as)*rt,sin(as)*rt,z+(3/8*p)],						//1
			[cos(as)*(rt+(5*h)),sin(as)*(rt+(5*h)),z+(3/4*p)],		//2
			[cos(ae)*(rt+(5*h)),sin(ae)*(rt+(5*h)),z+sh],			//3
			[cos(ae)*rt,sin(ae)*rt,z+(3/8*p)+sh],					//4
			[cos(ae)*(rt+(5*h)),sin(ae)*(rt+(5*h)),z+(3/4*p)+sh]],	//5
		triangles:[
			[0,1,2],			// near face
			[3,5,4],			// far face
			[0,3,4],[0,4,1],	// left face
			[0,5,3],[0,2,5],	// bottom face
			[1,4,5],[1,5,2]]  // top face
    });
}


