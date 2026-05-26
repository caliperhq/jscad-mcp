function getParameterDefinitions(){
	return [
		{name: 'zagWidth', type: 'int', default: 40, caption: 'Width of the hinge'},
		{name: 'bodyWidth', type: 'int', default: 80, caption: 'Overall length of hinged part'},
		{name: 'zigWidth', type: 'int', default: 2, caption: 'Width of hinge segments'},
		{name: 'numZags', type: 'int', default: 8, caption: 'Number of hinge segments (best if even)'},
		{name: 'thickness', type: 'int', default: 6, caption: 'Thickness of part'},
		{name: 'repeats', type: 'int', default: 1, caption: 'Number of times to repeat hinge'},
	];
}

function main(options){
	options.zagWidth = options.zagWidth || 40;
	options.zigWidth = options.zigWidth || 2;
	options.thickness = options.thickness || 6;
	options.numZags = options.numZags || 8;
	options.hingeWidth = (options.numZags * 2 + 1) * options.zigWidth;
	options.bodyWidth = options.bodyWidth || (options.hingeWidth * 2);

	var result = new CSG();
	var hinges = [];

	for( var idx = 0; idx < options.repeats; idx++){
		hinges.push(hinge(options).translate([0, options.zagWidth * idx, 0]));
	}

	return result.union(hinges);
}

function bend(options){
	var zigRadius = options.zigWidth / 2;
	var zigCube = CSG.cube({center: [0, 0, options.thickness / 2], radius: [zigRadius, zigRadius, options.thickness / 2]});
	var zagCube = CSG.cube({center: [0, 0, options.thickness / 2], radius: [zigRadius, options.zagWidth / 2, options.thickness / 2]});
	var zags = [], zigs = [];
	var result = new CSG();

	for( var idx = 0; idx < options.numZags; idx++){
		zags.push(zagCube.translate([options.zigWidth * idx * 2 + zigRadius, 0, 0]));
	}

	for( idx = -1; idx < options.numZags; idx++){
		if( idx % 2 === 0 ){
			zags.push(zigCube.translate([options.zigWidth * idx * 2 + zigRadius + options.zigWidth, options.zagWidth / 4 - zigRadius * 3, 0]));
			zags.push(zigCube.translate([options.zigWidth * idx * 2 + zigRadius + options.zigWidth, -options.zagWidth / 4 + zigRadius * 3, 0]));
		}else{
			zags.push(zigCube.translate([options.zigWidth * idx * 2 + zigRadius + options.zigWidth, options.zagWidth / 2 - zigRadius, 0]));
			zags.push(zigCube.translate([options.zigWidth * idx * 2 + zigRadius + options.zigWidth, -options.zagWidth / 2 + zigRadius, 0]));
		}
	}

	return result.union(zags).translate([-options.hingeWidth / 2 + options.zigWidth, 0, 0]);
}

function hinge(options){
	var cubeWidth = (options.bodyWidth - options.hingeWidth) / 4;
	var bodyCube = CSG.cube({center: [0, 0, options.thickness / 2], radius: [cubeWidth, options.zagWidth / 2, options.thickness / 2]});

	return bend(options).union([bodyCube.translate([-(cubeWidth + options.hingeWidth / 2), 0, 0]), bodyCube.translate([(cubeWidth + options.hingeWidth / 2), 0, 0])]);
}