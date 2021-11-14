import GeometryTerrain from "./geometry_terrain.js";
import {NORMALS, Helpers} from './helpers.js';
import {Resources} from "./resources.js";

const {mat4} = glMatrix;

export class PlayerModel {

    constructor(props) {

        this.texPlayer                  = null;
        this.texPlayer2                 = null;

        this.matPlayer = null;
        this.matPlayer2 = null;

        this.moving_timeout             = null;
        this.texture                    = null;
        this.nametag                    = null;
        this.moving                     = false;
        this.aniframe                   = 0;
        this.height                     = 1.7;

        Object.assign(this, props);

        // Create canvas used to draw name tags
        this.textCanvas                 = document.createElement('canvas');
        this.textCanvas.width           = 256;
        this.textCanvas.height          = 64;
        this.textCanvas.style.display   = 'none';

        // Create context used to draw name tags
        this.textContext                = this.textCanvas.getContext('2d');
        this.textContext.textAlign      = 'left';
        this.textContext.textBaseline   = 'top';
        this.textContext.font           = '24px Ubuntu';
        this.modelMatrix                = mat4.create();
    }

    // draw
    draw(render, camPos, delta) {
        const gl = this.gl = render.gl;
        this.drawLayer(render, camPos, delta, {
            scale:          1.0,
            material:       this.matPlayer,
            draw_nametag:   false
        });
        this.drawLayer(render, camPos, delta, {
            scale:          1.05,
            material:       this.matPlayer2,
            draw_nametag:   true
        });
    }

    // loadMesh...
    /**
     *
     * @param {Renderer} render
     */
    loadMesh(render) {
        this.loadPlayerHeadModel(render);
        this.loadPlayerBodyModel(render);
        this.loadTextures(render);
    }

    /**
     *
     * @param {Renderer} render
     */
    loadTextures(render) {
        Resources
            .loadImage(this.skin.file, false)
            .then(image1 => {
                Helpers.createSkinLayer2(null, image1, (file) => {
                    Resources
                        .loadImage(URL.createObjectURL(file), false)
                        .then(image2 => {
                            const texture1 = render.renderBackend.createTexture({
                                source: image1,
                                minFilter: 'nearest',
                                magFilter: 'nearest'
                            });
                            const texture2 = render.renderBackend.createTexture({
                                source: image2,
                                minFilter: 'nearest',
                                magFilter: 'nearest'
                            });
                            this.texPlayer =  texture1;
                            this.texPlayer2 = texture2;
                            this.matPlayer = render.defaultShader.materials.doubleface.getSubMat(texture1);
                            this.matPlayer2 = render.defaultShader.materials.doubleface_transparent.getSubMat(texture2);
                            document.getElementsByTagName('body')[0].append(image2);
                        })
                });
            });

    }

    //
    push_part(vertices, x, y, z, xs, zs, ys, tex_up_down, tex_front, tex_side) {

        let lm              = MULTIPLY.COLOR.WHITE;
        let flags           = 0;
        let sideFlags       = 0;
        let upFlags         = 0;
        let ao              = [0, 0, 0, 0];

        let top_rotate      = [xs, 0, 0, 0, zs, 0]; // Поворот верхней поверхностной текстуры
        let bottom_rotate   = [xs, 0, 0, 0, -zs, 0];
        let north_rotate    = [xs, 0, 0, 0, 0, -ys];
        let south_rotate    = [xs, 0, 0, 0, 0, ys];
        let west_rotate     = [0, -zs, 0, 0, 0, ys];
        let east_rotate     = [0, zs, 0, 0, 0, ys];

        // TOP
        vertices.push(x, z, y + ys,
            ...top_rotate,
            tex_up_down[0], tex_up_down[1], tex_up_down[2], tex_up_down[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | upFlags);
        // BOTTOM
        vertices.push(x, z, y,
            ...bottom_rotate,
            tex_up_down[0], tex_up_down[1], tex_up_down[2], tex_up_down[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags);
        // SOUTH
        vertices.push(x, z - zs/2, y + ys/2,
            ...south_rotate,
            tex_front[0], tex_front[1], tex_front[2], -tex_front[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
        // NORTH
        vertices.push(x, z + zs/2, y + ys/2,
            ...north_rotate,
            tex_front[0], tex_front[1], -tex_front[2], tex_front[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
        // WEST
        vertices.push(x - xs/2, z, y + ys/2,
            ...west_rotate,
            tex_side[0], tex_side[1], tex_side[2], -tex_side[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
        // EAST
        vertices.push(x + xs/2, z, y + ys/2,
            ...east_rotate,
            tex_side[0], tex_side[1], tex_side[2], -tex_side[3],
            lm.r, lm.g, lm.b,
            ao[0], ao[1], ao[2], ao[3], flags | sideFlags);
    }

    // Loads the player head model into a vertex buffer for rendering.
    loadPlayerHeadModel() {

        let lm = {r: 0, g: 0, b: 0, a: 0};

        /*
        // [x, y, z, tX, tY, lm.r, lm.g, lm.b, lm.a, n.x, n.y, n.z],

        let neighbours  = {
            UP: null,
            DOWN: null,
            NORTH: null,
            SOUTH: null,
            WEST: null,
            EAST: null
        };

        let vertices = [];
        push_cube(block, this.vertices, FakeCloudWorld, null, x, y, z, neighbours, null, false);

        return this.playerHead = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));
        */

        // Player head
        let vertices = [
            // Top
            -0.25, -0.25, 0.25, 8/64, 0, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.25, -0.25, 0.25, 16/64, 0, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.25, 0.25, 0.25, 16/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.25, 0.25, 0.25, 16/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.25, 0.25, 0.25, 8/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.25, -0.25, 0.25, 8/64, 0, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,

            // Bottom
            -0.25, -0.25, -0.25, 16/64, 0, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.25, 0.25, -0.25, 16/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.25, 0.25, -0.25, 24/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.25, 0.25, -0.25, 24/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.25, -0.25, -0.25, 24/64, 0, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.25, -0.25, -0.25, 16/64, 0, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,

            // Front
            -0.25, -0.25, 0.25, 8/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.25, -0.25, -0.25, 8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.25, -0.25, -0.25, 16/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.25, -0.25, -0.25, 16/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.25, -0.25, 0.25, 16/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.25, -0.25, 0.25, 8/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,

            // Rear
            -0.25, 0.25, 0.25, 24/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.25, 0.25, 0.25, 32/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.25, 0.25, -0.25, 32/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.25, 0.25, -0.25, 32/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.25, 0.25, -0.25, 24/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.25, 0.25, 0.25, 24/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,

            // Right
            -0.25, -0.25, 0.25, 16/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.25, 0.25, 0.25, 24/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.25, 0.25, -0.25, 24/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.25, 0.25, -0.25, 24/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.25, -0.25, -0.25, 16/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.25, -0.25, 0.25, 16/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,

            // Left
            0.25, -0.25, 0.25, 8/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.25, -0.25, -0.25, 8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.25, 0.25, -0.25, 0/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.25, 0.25, -0.25, 0/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.25, 0.25, 0.25, 0/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.25, -0.25, 0.25, 8/64, 8/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,

        ];

        return this.playerHead = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));

    }

    // Loads the player body model into a vertex buffer for rendering.
    loadPlayerBodyModel(gl) {

        let lm = {r: 0, g: 0, b: 0, a: 0};

        let vertices = [
            // Player torso

            // Top
            -0.30, -0.125, 1.45, 20/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.30, -0.125, 1.45, 28/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.30, 0.125, 1.45, 28/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.30, 0.125, 1.45, 28/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.30, 0.125, 1.45, 20/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.30, -0.125, 1.45, 20/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,

            // Bottom
            -0.30, -0.125, 0.73, 28/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.30, 0.125, 0.73, 28/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.30, 0.125, 0.73, 36/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.30, 0.125, 0.73, 36/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.30, -0.125, 0.73, 36/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.30, -0.125, 0.73, 28/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,

            // Front
            -0.30, -0.125, 1.45, 20/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.30, -0.125, 0.73, 20/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.30, -0.125, 0.73, 28/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.30, -0.125, 0.73, 28/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.30, -0.125, 1.45, 28/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.30, -0.125, 1.45, 20/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,

            // Rear
            -0.30, 0.125, 1.45, 40/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.30, 0.125, 1.45, 32/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.30, 0.125, 0.73, 32/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.30, 0.125, 0.73, 32/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.30, 0.125, 0.73, 40/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.30, 0.125, 1.45, 40/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,

            // Right
            -0.30, -0.125, 1.45, 16/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.30, 0.125, 1.45, 20/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.30, 0.125, 0.73, 20/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.30, 0.125, 0.73, 20/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.30, -0.125, 0.73, 16/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.30, -0.125, 1.45, 16/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,

            // Left
            0.30, -0.125, 1.45, 28/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.30, -0.125, 0.73, 28/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.30, 0.125, 0.73, 32/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.30, 0.125, 0.73, 32/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.30, 0.125, 1.45, 32/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.30, -0.125, 1.45, 28/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,

        ];

        this.playerBody = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));

        vertices = [
            // Left arm

            // Top
            0.30, -0.125, 0.05, 44/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.55, -0.125, 0.05, 48/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.55,  0.125, 0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.55,  0.125, 0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.30,  0.125, 0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.30, -0.125, 0.05, 44/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,

            // Bottom
            0.30, -0.125, -0.67, 48/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.30,  0.125, -0.67, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.55,  0.125, -0.67, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.55,  0.125, -0.67, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.55, -0.125, -0.67, 52/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.30, -0.125, -0.67, 48/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,

            // Front
            0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.30, -0.125, -0.67, 48/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.55, -0.125, -0.67, 44/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.55, -0.125, -0.67, 44/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,

            // Rear
            0.30, 0.125,  0.05, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.55, 0.125,  0.05, 56/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.55, 0.125, -0.67, 56/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.55, 0.125, -0.67, 56/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.30, 0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.30, 0.125,  0.05, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,

            // Right
            0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.30,  0.125,  0.05, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.30,  0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.30,  0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.30, -0.125, -0.67, 48/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,

            // Left
            0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.55, -0.125, -0.67, 44/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.55,  0.125, -0.67, 40/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.55,  0.125, -0.67, 40/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.55,  0.125,  0.05, 40/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,

        ];

        this.playerLeftArm = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));

        vertices = [
            // Right arm

            // Top
            -0.55, -0.125, 0.05, 44/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.30, -0.125, 0.05, 48/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.30,  0.125, 0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.30,  0.125, 0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.55,  0.125, 0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.55, -0.125, 0.05, 44/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,

            // Bottom
            -0.55, -0.125, -0.67, 52/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.55,  0.125, -0.67, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.30,  0.125, -0.67, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.30,  0.125, -0.67, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.30, -0.125, -0.67, 48/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.55, -0.125, -0.67, 52/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,

            // Front
            -0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.55, -0.125, -0.67, 44/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.30, -0.125, -0.67, 48/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.30, -0.125, -0.67, 48/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,

            // Rear
            -0.55, 0.125,  0.05, 56/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.30, 0.125,  0.05, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.30, 0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.30, 0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.55, 0.125, -0.67, 56/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.55, 0.125,  0.05, 56/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,

            // Right
            -0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.55,  0.125,  0.05, 40/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.55,  0.125, -0.67, 40/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.55,  0.125, -0.67, 40/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.55, -0.125, -0.67, 44/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.55, -0.125,  0.05, 44/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,

            // Left
            -0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.30, -0.125, -0.67, 48/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.30,  0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.30,  0.125, -0.67, 52/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.30,  0.125,  0.05, 52/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.30, -0.125,  0.05, 48/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,

        ];

        this.playerRightArm = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));

        vertices = [
            // Left leg

            // Top
            0.01, -0.125, 0, 4/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.3,  -0.125, 0, 8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.3,   0.125, 0, 8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.3,   0.125, 0, 8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.01,  0.125, 0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            0.01, -0.125, 0, 4/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,

            // Bottom
            0.01, -0.125, -0.73,  8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.01,  0.125, -0.73,  8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.3,   0.125, -0.73, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.3,   0.125, -0.73, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.3,  -0.125, -0.73, 12/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            0.01, -0.125, -0.73,  8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,

            // Front
            0.01, -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.01, -0.125, -0.73, 4/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.3,  -0.125, -0.73, 8/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.3,  -0.125, -0.73, 8/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.3,  -0.125,     0, 8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            0.01, -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,

            // Rear
            0.01, 0.125,     0, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.3,  0.125,     0, 16/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.3,  0.125, -0.73, 16/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.3,  0.125, -0.73, 16/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.01, 0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            0.01, 0.125,     0, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,

            // Right
            0.01, -0.125,     0,  8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.01,  0.125,     0, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.01,  0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.01,  0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.01, -0.125, -0.73,  8/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            0.01, -0.125,     0,  8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,

            // Left
            0.3, -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.3, -0.125, -0.73, 4/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.3,  0.125, -0.73, 0/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.3,  0.125, -0.73, 0/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.3,  0.125,     0, 0/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            0.3, -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
        ];

        this.playerLeftLeg = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));

        vertices = [
            // Right leg

            // Top
            -0.3,  -0.125, 0, 4/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.01, -0.125, 0, 8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.01,  0.125, 0, 8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.01,  0.125, 0, 8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.3,   0.125, 0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -0.3,  -0.125, 0, 4/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,

            // Bottom
            -0.3,  -0.125, -0.73,  8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.3,   0.125, -0.73,  8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.01,  0.125, -0.73, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.01,  0.125, -0.73, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.01, -0.125, -0.73, 12/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,
            -0.3,  -0.125, -0.73,  8/64, 16/64, lm.r, lm.g, lm.b, lm.a, NORMALS.DOWN.x, NORMALS.DOWN.y, NORMALS.DOWN.z,

            // Front
            -0.3,  -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.3,  -0.125, -0.73, 4/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.01, -0.125, -0.73, 8/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.01, -0.125, -0.73, 8/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.01, -0.125,     0, 8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,
            -0.3,  -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.FORWARD.x, NORMALS.FORWARD.y, NORMALS.FORWARD.z,

            // Rear
            -0.3,  0.125,     0, 16/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.01, 0.125,     0, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.01, 0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.01, 0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.3,  0.125, -0.73, 16/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,
            -0.3,  0.125,     0, 16/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.BACK.x, NORMALS.BACK.y, NORMALS.BACK.z,

            // Right
            -0.3, -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.3,  0.125,     0, 0/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.3,  0.125, -0.73, 0/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.3,  0.125, -0.73, 0/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.3, -0.125, -0.73, 4/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,
            -0.3, -0.125,     0, 4/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.RIGHT.x, NORMALS.RIGHT.y, NORMALS.RIGHT.z,

            // Left
            -0.01, -0.125,    0,   8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.01, -0.125, -0.73,  8/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.01,  0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.01,  0.125, -0.73, 12/64, 32/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.01,  0.125,     0, 12/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
            -0.01, -0.125,     0,  8/64, 20/64, lm.r, lm.g, lm.b, lm.a, NORMALS.LEFT.x, NORMALS.LEFT.y, NORMALS.LEFT.z,
        ];

        this.playerRightLeg = new GeometryTerrain(GeometryTerrain.convertFrom12(vertices));
    }

    // drawLayer
    drawLayer(render, camPos, delta, options) {
        const {modelMatrix} = this;
        const {material, scale} = options;
        const {renderBackend} = render;
        const z_minus   = (this.height * options.scale - this.height);

        let aniangle = 0;
        if(this.moving || Math.abs(this.aniframe) > 0.1) {
            this.aniframe += (0.1 / 1000 * delta);
            if(this.aniframe > Math.PI) {
                this.aniframe  = -Math.PI;
            }
            aniangle = Math.PI / 2 * Math.sin(this.aniframe);
            if(!this.moving && Math.abs(aniangle) < 0.1) {
                this.aniframe = 0;
            }
        }

        // Draw head
        let pitch = this.pitch;
        if(pitch < -0.5) {
            pitch = -0.5;
        }
        if(pitch > 0.5) {
            pitch = 0.5;
        }

        // Load mesh
        if(!this.playerHead) {
            this.loadMesh(render);
        }

        // Wait loading texture
        if(!options.material) {
            return;
        }

        const a_pos = this.pos;
        // Draw head
        mat4.identity(modelMatrix);
        mat4.translate(modelMatrix, modelMatrix, [0, 0, this.height * options.scale - z_minus]);
        mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale]);
        mat4.rotateZ(modelMatrix, modelMatrix, Math.PI - this.yaw);
        mat4.rotateX(modelMatrix, modelMatrix, -pitch);
        renderBackend.drawMesh(this.playerHead, material, a_pos, modelMatrix);

        // Draw body
        mat4.identity(modelMatrix);
        mat4.translate(modelMatrix, modelMatrix,[0, 0, 0.01 - z_minus / 2]);
        mat4.scale(modelMatrix, modelMatrix,[scale, scale, scale]);
        mat4.rotateZ(modelMatrix, modelMatrix,Math.PI - this.yaw);
        renderBackend.drawMesh(this.playerBody, material, a_pos, modelMatrix);

        // Left arm
        mat4.translate(modelMatrix, modelMatrix, [ 0, 0, 1.4]);
        mat4.rotateX(modelMatrix, modelMatrix,0.75 * aniangle);
        renderBackend.drawMesh(this.playerLeftArm, material, a_pos, modelMatrix);

        // Right arm
        mat4.rotateX(modelMatrix, modelMatrix, -1.5 * aniangle);
        renderBackend.drawMesh(this.playerRightArm, material, a_pos, modelMatrix);
        mat4.rotateX(modelMatrix, modelMatrix, 0.75 * aniangle);
        mat4.translate(modelMatrix, modelMatrix, [ 0, 0, -0.67] );

        // Right leg
        mat4.rotateX(modelMatrix, modelMatrix, 0.5 * aniangle);
        renderBackend.drawMesh(this.playerRightLeg, material, a_pos, modelMatrix);

        // Left leg
        mat4.rotateX(modelMatrix, modelMatrix, -aniangle);
        renderBackend.drawMesh(this.playerLeftLeg, material, a_pos, modelMatrix);

        if(options.draw_nametag) {
            // Draw player name
            if(!this.nametag) {
                this.nametag = this.buildPlayerName(this.username, render);
            }

            mat4.identity(modelMatrix);
            // Calculate angle so that the nametag always faces the local player
            let angZ = -Math.PI/2 + Math.atan2(camPos[2] - this.pos.z, camPos[0] - this.pos.x);
            let angX = 0; // @todo

            mat4.translate(modelMatrix, modelMatrix, [0, 0, (this.height + 0.35) * options.scale - z_minus]);
            mat4.rotateZ(modelMatrix, modelMatrix, angZ);
            mat4.rotateX(modelMatrix, modelMatrix, angX);
            mat4.scale(modelMatrix, modelMatrix, [0.005, 1, 0.005]);

            renderBackend.drawMesh(this.nametag.model, this.nametag.material, a_pos, modelMatrix);
        }

    }

    // Returns the texture and vertex buffer for drawing the name
    // tag of the specified player over head.
    /**
     *
     * @param {string} username
     * @param render
     * @return {{texture: BaseTexture, model: GeometryTerrain}}
     */
    buildPlayerName(username, render) {
        username        = username.replace( /&lt;/g, "<" ).replace( /&gt;/g, ">" ).replace( /&quot;/, "\"" );
        let gl          = this.gl;
        let canvas      = this.textCanvas;
        let ctx         = this.textContext;
        let w           = ctx.measureText(username).width + 16;
        let h           = 45;
        // Draw text box
        ctx.fillStyle   = '#00000055';
        ctx.fillRect(0, 0, w, 45);
        ctx.fillStyle   = '#fff';
        ctx.font        = '24px Ubuntu';
        ctx.fillText(username, 10, 12);

        // abstraction
        const texture = render.renderBackend.createTexture({
            source: canvas,
        });

        // Create model
        let vertices = [
            -w/2, 0, h, w/256, 0, 1, 1, 1, 0.7, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            w/2, 0, h, 0, 0, 1, 1, 1, 0.7, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            w/2, 0, 0, 0, h/64, 1, 1, 1, 0.7, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            w/2, 0, 0, 0, h/64, 1, 1, 1, 0.7, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -w/2, 0, 0, w/256, h/64, 1, 1, 1, 0.7, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
            -w/2, 0, h, w/256, 0, 1, 1, 1, 0.7, NORMALS.UP.x, NORMALS.UP.y, NORMALS.UP.z,
        ];
        return {
            material: render.defaultShader.materials.label.getSubMat(texture),
            model: new GeometryTerrain(GeometryTerrain.convertFrom12(vertices))
        };
    }

}
