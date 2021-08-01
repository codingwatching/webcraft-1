"use strict";

/**
* Renderer
*
* This class contains the code that takes care of visualising the
* elements in the specified world.
**/

const CAMERA_DIST           = 10;
const ZOOM_FACTOR           = 0.25;
const FOV_CHANGE_SPEED      = 150;
const FOV_NORMAL            = 75;
const FOV_WIDE              = FOV_NORMAL * 1.15;
const FOV_ZOOM              = FOV_NORMAL * ZOOM_FACTOR;
const MAX_DIST_FOR_SHIFT    = 800;
const RENDER_DISTANCE       = 800;

var settings = {
    fogColor:               [118 / 255, 194 / 255, 255 / 255, 1],
    // fogColor:               [185 / 255, 210 / 255, 254 / 255, 1],
    fogUnderWaterColor:     [55 / 255, 100 / 255, 190 / 255, 1],
    fogAddColor:            [0, 0, 0, 0],
    fogUnderWaterAddColor:  [55 / 255, 100 / 255, 190 / 255, 0.75],
    fogDensity:             2.52 / 320, // 170, //  0.015 = 168, 0.03 = 84
    fogDensityUnderWater:   0.1
};

var currentRenderState = {
    // fogColor:           [185 / 255, 210 / 255, 254 / 255, 1],
    fogColor:           [118 / 255, 194 / 255, 255 / 255, 1],
    fogDensity:         0.02,
    underWater:         false
};

// Creates a new renderer with the specified canvas as target.
function Renderer(world, renderSurfaceId, settings, initCallback) {

    var that                = this;
    that.canvas             = document.getElementById(renderSurfaceId);
	that.canvas.renderer    = that;

    var pixiRender = that.pixiRender = new PIXI.Renderer({
        view: that.canvas,
        antialias: false,
        depth: true,
        premultipliedAlpha: false
    });

	this.skyBox             = null;
    this.videoCardInfoCache = null;

    // Create projection and view matrices
    that.projMatrix         = mat4.create();
    that.viewMatrix         = mat4.create();
    that.modelMatrix        = mat4.create(); // Create dummy model matrix
    mat4.identity(that.modelMatrix);

    this.setWorld(world);
	// Initialise WebGL
	var gl = that.gl = pixiRender.context.gl;
	// throw 'Your browser doesn\'t support WebGL!';

	gl.viewportWidth        = that.canvas.width;
	gl.viewportHeight       = that.canvas.height;

	var state = that.state = new PIXI.State();
	state.depthTest = true;
	state.culling = true;
	state.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;

	pixiRender.state.set(state);

    // PickAt
    this.pickAt             = new PickAt(this, gl);

	// Create main program
    createGLProgram(pixiRender, './shaders/main/vertex.glsl', './shaders/main/fragment.glsl',
        function(info) {

        var program = that.program = info.program;

        var shader = that.terrainShader = new PIXI.Shader(info.pixiProgram, {
            uProjMatrix: mat4.create(),
            u_worldView: mat4.create(),
            uModelMatrix: mat4.create(),
            u_add_pos: new Float32Array(3),
            u_fogColor: new Float32Array(4),
            u_fogDensity: 0,
            u_fogOn: false,
            u_chunkBlockDist: 0,
            u_resolution: new Float32Array(2),
            u_time: 0,
            u_brightness: 0,
        });

        gl.useProgram(program);

        // Store variable locations
        // that.uProjMat           = gl.getUniformLocation(program, 'uProjMatrix');
        // that.uModelMatrix       = gl.getUniformLocation(program, 'u_worldView');
        // that.uModelMat          = gl.getUniformLocation(program, 'uModelMatrix');
        that.u_texture          = gl.getUniformLocation(program, 'u_texture');
        that.u_texture_mask     = gl.getUniformLocation(program, 'u_texture_mask');
        that.a_position         = gl.getAttribLocation(program, 'a_position');
        that.a_color            = gl.getAttribLocation(program, 'a_color');
        that.a_texcoord         = gl.getAttribLocation(program, 'a_texcoord');
        that.a_normal           = gl.getAttribLocation(program, 'a_normal');
        // fog
        // that.u_add_pos          = gl.getUniformLocation(program, 'u_add_pos');
        // that.u_fogColor         = gl.getUniformLocation(program, 'u_fogColor');
        // that.u_fogDensity       = gl.getUniformLocation(program, 'u_fogDensity');
        // that.u_fogAddColor      = gl.getUniformLocation(program, 'u_fogAddColor');
        // that.u_fogOn            = gl.getUniformLocation(program, 'u_fogOn');
        // that.u_chunkBlockDist   = gl.getUniformLocation(program, 'u_chunkBlockDist');
        // //
        // that.u_resolution       = gl.getUniformLocation(program, 'u_resolution');
        // that.u_time             = gl.getUniformLocation(program, 'u_time');
        // that.u_brightness       = gl.getUniformLocation(program, 'u_brightness');

        that.setBrightness(that.world.saved_state.brightness ? that.world.saved_state.brightness : 1);
        // Create projection and view matrices
        shader.uniforms.uModelMatrix = that.modelMatrix;
        // Create 1px white texture for pure vertex color operations (e.g. picking)
        var whiteTexture        = that.texWhite = gl.createTexture();
        var white               = new Uint8Array([255, 255, 255, 255]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, whiteTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, white);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        // Terrain texture
        gl.uniform1i(that.u_texture, 4);
        var terrainTexture          = that.texTerrain = gl.createTexture();
        terrainTexture.image        = new Image();
        terrainTexture.image.onload = function() {
                gl.activeTexture(gl.TEXTURE4);
                gl.bindTexture(gl.TEXTURE_2D, terrainTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, terrainTexture.image);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        };
        terrainTexture.image.src = settings.hd ? 'media/terrain_hd.png' : 'media/terrain.png';

        // Terrain texture mask
        gl.uniform1i(that.u_texture_mask, 5);
        var terrainTextureMask          = that.texTerrainMask = gl.createTexture();
        terrainTextureMask.image        = new Image();
        terrainTextureMask.image.onload = function() {
            gl.activeTexture(gl.TEXTURE5);
            gl.bindTexture(gl.TEXTURE_2D, terrainTextureMask);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, terrainTextureMask.image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        };
        terrainTextureMask.image.src = settings.hd ? 'media/terrain_hd_mask.png' : 'media/terrain_mask.png';

        //
        that.setPerspective(FOV_NORMAL, 0.01, RENDER_DISTANCE);
    });

    // SkyBox
    createGLProgram(pixiRender, './shaders/skybox/vertex.glsl', './shaders/skybox/fragment.glsl', function(info) {
        const program = info.program;
        gl.useProgram(program);

        const shader = new PIXI.Shader(info.pixiProgram, {
            u_lookAtMatrix: new Float32Array(16),
            u_projectionMatrix: new Float32Array(16),
            u_brightness_value: 0,
        });

        const geom = new PIXI.Geometry();

        const vertexData = [
            -1,-1, 1,
            1,-1, 1,
            1, 1, 1,
            -1, 1, 1,
            -1,-1,-1,
            1,-1,-1,
            1, 1,-1,
            -1, 1,-1
        ];
        const indexData = [
            0,1,2,2,3,0, 4,5,6,6,7,4,
            1,5,6,6,2,1, 0,4,7,7,3,0,
            3,2,6,6,7,3, 0,1,5,5,4,0
        ];

        geom.addAttribute('a_vertex', vertexData, 3, false, PIXI.TYPES.FLOAT)
            .addIndex(indexData);

        that.skyBox = {
            gl:         gl,
            program:    program,
            texture:    gl.createTexture(),
            loaded:     false,
            draw: function(_lookAtMatrix, _projectionMatrix) {
                if(!this.loaded) {
                    return;
                }
                _lookAtMatrix = new Float32Array(_lookAtMatrix)
                mat4.rotate(_lookAtMatrix, Math.PI / 2, [ 1, 0, 0 ], _lookAtMatrix);
                _lookAtMatrix[12] = 0;
                _lookAtMatrix[13] = 0;
                _lookAtMatrix[14] = 0;
                this.gl.useProgram(this.program);

                shader.uniforms.u_brightness_value = that.brightness;
                shader.uniforms.u_lookAtMatrix = _lookAtMatrix;
                shader.uniforms.u_projectionMatrix = _projectionMatrix;
                pixiRender.shader.bind(shader);
                // skybox
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
                this.gl.viewport(0,0, this.gl.canvas.width, this.gl.canvas.height);
                this.gl.disable(this.gl.CULL_FACE);
                this.gl.disable(this.gl.DEPTH_TEST);

                pixiRender.geometry.bind(geom);

                this.gl.drawElements(this.gl.TRIANGLES, 36, this.gl.UNSIGNED_SHORT, 0);

                pixiRender.geometry.unbind();
                this.gl.enable(this.gl.CULL_FACE);
                this.gl.enable(this.gl.DEPTH_TEST);
            }
        }
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, that.skyBox.texture);
        const loadImageInTexture = (target, url) => {
            return new Promise((resolve, reject) => {
                const level             = 0;
                const internalFormat    = gl.RGBA;
                const width             = 1;
                const height            = 1;
                const format            = gl.RGBA;
                const type              = gl.UNSIGNED_BYTE;
                gl.texImage2D(target, level, internalFormat, width, height, 0, format, type, new Uint8Array([255, 255, 255, 255]));
                const image = new Image();
                image.addEventListener('load', () => {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.texImage2D(target, level, internalFormat, format, type, image);
                    resolve();
                });
                image.addEventListener('error', () => {
                    reject(new Error(`Ошибка загрузки изображения '${url}'.`));
                });
                image.src = url;
            });
        }
        var skiybox_dir = './media/skybox/park';
        Promise.all([
            loadImageInTexture(gl.TEXTURE_CUBE_MAP_POSITIVE_X, skiybox_dir + '/posx.jpg'),
            loadImageInTexture(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, skiybox_dir + '/negx.jpg'),
            loadImageInTexture(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, skiybox_dir + '/posy.jpg'),
            loadImageInTexture(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, skiybox_dir + '/negy.jpg'),
            loadImageInTexture(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, skiybox_dir + '/posz.jpg'),
            loadImageInTexture(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, skiybox_dir + '/negz.jpg'),
        ]).then(() => {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, that.skyBox.texture);
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
            that.skyBox.loaded = true;
        }).catch((error) => {
            throw new Error(error);
        });
    });

	// HUD
    createGLProgram(pixiRender, './shaders/hud/vertex.glsl', './shaders/hud/fragment.glsl', function(info) {
		const program = info.program;
        // Build main HUD
        var shader = new PIXI.Shader(info.pixiProgram, {
            u_noDraw: false,
            u_noCrosshair: false,
            u_resolution: new Float32Array(2),
        });

        Game.hud = new HUD(0, 0);
        that.HUD = {
            gl: gl,
            tick: 0,
            program: program,
            texture: gl.createTexture(),
            bufRect: null,
            uniform: {
                texture:        gl.getUniformLocation(program, 'u_texture'),
            },
            draw: function() {
                const gl = this.gl;
                Game.hud.draw();
                shader.uniforms.u_resolution[0] = gl.viewportWidth * window.devicePixelRatio;
                shader.uniforms.u_resolution[1] = gl.viewportHeight * window.devicePixelRatio;
                shader.uniforms.u_noCrosshair = Game.hud.wm.getVisibleWindows().length > 0;
                pixiRender.shader.bind(shader);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                if(this.tick++ % 2 == 0) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, Game.hud.canvas);
                }
                if(!this.geom) {
                    const vertexData = [
                        -1, -1,
                         1, -1,
                         1,  1,
                        -1,  1
                    ];
                    const indexData = [
                        0, 1, 2,
                        1, 2, 3
                    ];
                    this.geom = new PIXI.Geometry();
                    this.geom.addAttribute('inPos', vertexData, 2, false, PIXI.TYPES.FLOAT)
                        .addIndex(indexData);
                }
                pixiRender.geometry.bind(this.geom);
                gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
                pixiRender.geometry.unbind();
            }
        }
        // Create HUD texture
        var texture = that.HUD.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        initCallback();
	});

}

// Makes the renderer start tracking a new world and set up the chunk structure.
// world - The world object to operate on.
// chunkSize - X, Y and Z dimensions of each chunk, doesn't have to fit exactly inside the world.
Renderer.prototype.setWorld = function(world) {
    this.world = world;
    world.renderer = this;
}

// setBrightness...
Renderer.prototype.setBrightness = function(value) {
    this.brightness = value;
    var mult = Math.min(1, value * 2)
    currentRenderState.fogColor = [
        settings.fogColor[0] * (value * mult),
        settings.fogColor[1] * (value * mult),
        settings.fogColor[2] * (value * mult),
        settings.fogColor[3]
    ]
}

// toggleNight...
Renderer.prototype.toggleNight = function() {
    if(this.brightness == 1) {
        this.setBrightness(.15);
    } else {
        this.setBrightness(1);
    }
}

// Render one frame of the world to the canvas.
Renderer.prototype.draw = function(delta) {

    var that = this;
	var gl = this.gl;
	var pixiRender = this.pixiRender;

    // console.log(Game.world.renderer.camPos[2]);
    //if(Game.world.localPlayer.pos.z + 1.7 < 63.8) {
    //    currentRenderState.fogDensity   = settings.fogDensityUnderWater;
    //    currentRenderState.fogColor     = settings.fogUnderWaterColor;
    //    currentRenderState.fogAddColor  = settings.fogUnderWaterAddColor;
    //} else {
    currentRenderState.fogDensity   = settings.fogDensity;
    // currentRenderState.fogColor     = settings.fogColor;
    currentRenderState.fogAddColor  = settings.fogAddColor;
    //}

	// Initialise view
    gl.useProgram(this.program);
	this.updateViewport();

    // Говорим WebGL, как преобразовать координаты
    // из пространства отсечения в пиксели
    // gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(...currentRenderState.fogColor);

    const shader = this.terrainShader;

    shader.uniforms.u_fogColor = currentRenderState.fogColor;
    shader.uniforms.u_chunkBlockDist = CHUNK_RENDER_DIST * CHUNK_SIZE_X - CHUNK_SIZE_X * 2;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Draw skybox
	if( that.skyBox) {
        that.skyBox.draw(this.viewMatrix, this.projMatrix);
    }

    // 2. Draw level chunks
    gl.useProgram(this.program);
    // setCamera
    shader.uniforms.u_worldView = this.viewMatrix;
    // setPerspective
    // const zoom = this.world.localPlayer.keys[KEY.C] ? 0.3 : 1;
    mat4.perspective(this.fov, gl.viewportWidth / gl.viewportHeight, this.min, this.max, this.projMatrix);
    shader.uniforms.uProjMatrix = this.projMatrix;

    // Picking
    this.pickAt.draw(); // USE SHADER HERE
    // set the fog color and near, far settings
    // fog1
    shader.uniforms.u_fogDensity = currentRenderState.fogDensity;
    shader.uniforms.u_fogAddColor = currentRenderState.fogAddColor;
    shader.uniforms.u_fogOn = true;
    // resolution
    shader.uniforms.u_resolution[0] = gl.viewportWidth;
    shader.uniforms.u_resolution[1] = gl.viewportHeight;
    shader.uniforms.u_time = performance.now() / 1000;
    shader.uniforms.u_brightness = this.brightness;

    pixiRender.shader.bind(shader);

    gl.enable(gl.BLEND);

    // gl.activeTexture(gl.TEXTURE4);
    // gl.bindTexture(gl.TEXTURE_2D, this.texTerrain);

    // gl.activeTexture(gl.TEXTURE5);
    // gl.bindTexture(gl.TEXTURE_2D, this.texTerrainMask);

    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // Draw chunks
    this.world.chunkManager.draw(this);
    this.world.draw(this, delta, this.modelMatrix, this.uModelMat);

    // 3. Draw players
    this.drawPlayers(delta);

    // 4. Draw HUD
    if(that.HUD) {
        that.HUD.draw();
    }

	gl.disable(gl.BLEND);

}

// drawPlayers
Renderer.prototype.drawPlayers = function(delta) {
    var gl = this.gl;
    gl.useProgram(this.program);
    for(const [id, player] of Object.entries(this.world.players)) {
        if(player.id != this.world.server.id) {
            player.draw(this, this.modelMatrix, this.uModelMat, this.camPos, delta);
        }
    }
    // Restore Matrix
    mat4.identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.uModelMat, false, this.modelMatrix);
}

/**
* Check if the viewport is still the same size and update
* the render configuration if required.
*/
Renderer.prototype.updateViewport = function() {
	var gl = this.gl;
	var canvas = this.canvas;
	if (canvas.clientWidth != gl.viewportWidth || canvas.clientHeight != gl.viewportHeight) {
		gl.viewportWidth  = canvas.clientWidth;
		gl.viewportHeight = canvas.clientHeight;
		canvas.width      = window.innerWidth * window.devicePixelRatio;
		canvas.height     = window.innerHeight * window.devicePixelRatio;
		// Update perspective projection based on new w/h ratio
		this.setPerspective(this.fov, this.min, this.max);
	}
}

// refresh...
Renderer.prototype.refresh = function() {
    this.world.chunkManager.refresh();
}

// Sets the properties of the perspective projection.
Renderer.prototype.setPerspective = function(fov, min, max) {
	this.fov = fov;
	this.min = min;
	this.max = max;
}

// Moves the camera to the specified orientation.
//
// pos - Position in world coordinates.
// ang - Pitch, yaw and roll.
Renderer.prototype.setCamera = function(pos, ang) {
    var y_add = Math.cos(this.world.localPlayer.walking_frame * (15 * (this.world.localPlayer.running ? 1.5 : 1))) * .025;
	this.camPos = pos;
	mat4.identity(this.viewMatrix);
	mat4.rotate(this.viewMatrix, -ang[0] - Math.PI / 2, [ 1, 0, 0 ], this.viewMatrix);
	mat4.rotate(this.viewMatrix, ang[1], [ 0, 1, 0 ], this.viewMatrix);
	mat4.rotate(this.viewMatrix, ang[2], [ 0, 0, 1 ], this.viewMatrix);
    mat4.translate(this.viewMatrix, [
        -pos[0] + Game.shift.x,
        -pos[2] + Game.shift.z,
        -pos[1] + y_add
    ], this.viewMatrix);

/*
    var z_add = Math.cos(this.world.localPlayer.walking_frame * (15 * (this.world.localPlayer.running ? 1.5 : 1))) * .025;
    if(this.world.localPlayer.walking) {
        // ang[1] += Math.cos(this.world.localPlayer.walking_frame * 15) * 0.0025;
    }
	this.camPos = pos;
	mat4.identity(this.viewMatrix);
	mat4.rotate(this.viewMatrix, -ang[0] - Math.PI / 2, [ 1, 0, 0 ], this.viewMatrix);
	mat4.rotate(this.viewMatrix, ang[1], [ 0, 0, 1 ], this.viewMatrix);
	mat4.rotate(this.viewMatrix, -ang[2], [ 0, 1, 0 ], this.viewMatrix);
    mat4.translate(this.viewMatrix, [-pos[0] + Game.shift.x, -pos[2] + Game.shift.z, -pos[1] + z_add], this.viewMatrix);
    */
}

// drawBuffer...
Renderer.prototype.drawBuffer = function(buffer, a_pos) {
    if (buffer.size === 0) {
        return;
    }

	var gl = this.gl;
    const shader = this.terrainShader;
    const pixiRender = this.pixiRender;
    shader.uniforms.u_add_pos[0] = a_pos.x;
    shader.uniforms.u_add_pos[1] = a_pos.y;
    shader.uniforms.u_add_pos[2] = a_pos.z;
    pixiRender.shader.bind(shader);
	this.pixiRender.geometry.bind(buffer);
    // gl.drawArrays(gl.LINES, 0, buffer.size);
    gl.drawArrays(gl.TRIANGLES, 0, buffer.size);
    this.pixiRender.geometry.unbind();
}

// getVideoCardInfo...
Renderer.prototype.getVideoCardInfo = function() {
    if(this.videoCardInfoCache) {
        return this.videoCardInfoCache;
    }
    var gl = this.gl; // document.createElement('canvas').getContext('webgl');
    if (!gl) {
        return {
            error: 'no webgl',
        };
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    var resp = null;
    if(debugInfo) {
        resp = {
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
            renderer:  gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        };
    }
    resp = {
        error: 'no WEBGL_debug_renderer_info',
    };
    this.videoCardInfoCache = resp;
    return resp;
}
