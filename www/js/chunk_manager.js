import {Helpers, getChunkAddr, SpiralGenerator, Vector, VectorCollector, IvanArray, VectorCollectorFlat} from "./helpers.js";
import {Chunk} from "./chunk.js";
import {ServerClient} from "./server_client.js";
import {BLOCK} from "./blocks.js";
import {ChunkDataTexture} from "./light/ChunkDataTexture.js";
import {TrivialGeometryPool} from "./light/GeometryPool.js";
import {Basic05GeometryPool} from "./light/Basic05GeometryPool.js";
import {DataWorld} from "./typed_blocks3.js";
import { ALLOW_NEGATIVE_Y, CHUNK_GENERATE_MARGIN_Y } from "./chunk_const.js";
import { decompressNearby } from "./packet_compressor.js";
import { Particles_BeaconRay } from "./particles/bn_ray.js";

const CHUNKS_ADD_PER_UPDATE     = 8;
const MAX_APPLY_VERTICES_COUNT  = 10;
export const GROUPS_TRANSPARENT = ['transparent', 'doubleface_transparent'];
export const GROUPS_NO_TRANSPARENT = ['regular', 'doubleface'];

const CC = [
    {x:  0, y:  1, z:  0},
    {x:  0, y: -1, z:  0},
    {x:  0, y:  0, z: -1},
    {x:  0, y:  0, z:  1},
    {x: -1, y:  0, z:  0},
    {x:  1, y:  0, z:  0}
];

//
export class ChunkManager {

    /**
     * @type {ChunkManager}
     */
    static instance;

    constructor(world) {

        ChunkManager.instance = this;

        this.world                  = world;
        this.chunks                 = new VectorCollectorFlat();
        this.chunks_prepare         = new VectorCollector();
        this.block_sets             = 0;

        this.lightPool              = null;
        this.lightProps = {
            texFormat: 'rgba8unorm',
            depthMul: 1,
        }

        this.bufferPool             = null;
        this.chunkDataTexture       = new ChunkDataTexture();

        // rendering
        this.poses                  = [];
        this.poses_need_update      = false;
        this.poses_chunkPos         = new Vector();
        this.rendered_chunks        = {fact: 0, total: 0};
        this.renderList             = new Map();

        this.update_chunks          = true;
        this.vertices_length_total  = 0;
        this.worker_inited          = false;
        this.timer60fps             = 0;
        this.dataWorld              = new DataWorld();

        this.chunk_modifiers        = new VectorCollector();

        if (navigator.userAgent.indexOf('Firefox') > -1 || globalThis.useGenWorkers) {
            this.worker = new Worker('./js-gen/chunk_worker_bundle.js');
            this.lightWorker = new Worker('./js-gen/light_worker_bundle.js');
        } else {
            this.worker = new Worker('./js/chunk_worker.js'/*, {type: 'module'}*/);
            this.worker.onerror = (e) => {
                debugger;
            };
            this.lightWorker = new Worker('./js/light_worker.js'/*, {type: 'module'}*/);
            this.lightWorker.onerror = (e) => {
                debugger;
            };
        }

        const that = this;

        // Animated blocks
        this.animated_blocks = {
            list: new VectorCollectorFlat(),
            add: function(args) {
                this.list.set(args.block_pos, args);
            },
            delete(pos) {
                this.list.delete(pos);
            },
            destroyAllInAABB(aabb) {
                for(let [pos, _] of this.list.entries(aabb)) {
                    this.list.delete(pos);
                }
            },
            update(player_pos) {
                const meshes = Qubatch.render.meshes;
                const type_distance = {
                    torch_flame: 12,
                    campfire_flame: 96
                };
                // Play animations if need
                for(let item of this.list) {
                    if(Math.random() < .23) {
                        if(player_pos.distance(item.block_pos) < type_distance[item.type]) {
                            for(let pos_index = 0; pos_index < item.pos.length; pos_index++) {
                                meshes.addEffectParticle(item.type, item.pos[pos_index]);
                            }
                        }
                    }
                }
            }
        };

        // Destruct chunks queue
        this.destruct_chunks_queue = {
            list: [],
            add(addr) {
                this.list.push(addr.clone());
            },
            clear: function() {
                this.list = [];
            },
            send: function() {
                if(this.list.length > 0) {
                    //
                    that.postWorkerMessage(['destructChunk', this.list]);
                    //
                    that.postWorkerMessage(['destroyMap', {
                        players: [{
                            chunk_render_dist: Qubatch.player.state.chunk_render_dist,
                            chunk_addr: getChunkAddr(Qubatch.player.state.pos)
                        }]
                    }]);
                    //
                    that.postLightWorkerMessage(['destructChunk', this.list]);
                    this.clear();
                }
            }
        };

    }

    get lightmap_count() {
        return this.lightPool ? this.lightPool.totalRegions : 0;
    }

    get lightmap_bytes() {
        return this.lightPool ? this.lightPool.totalBytes : 0;
    }

    init() {

        const world                   = this.world;
        const that                    = this;

        // Add listeners for server commands
        this.world.server.AddCmdListener([ServerClient.CMD_NEARBY_CHUNKS], (cmd) => {this.updateNearby(decompressNearby(cmd.data))});
        this.world.server.AddCmdListener([ServerClient.CMD_CHUNK_LOADED], (cmd) => {
            // console.log('1. chunk: loaded', new Vector(cmd.data.addr).toHash());
            this.setChunkState(cmd.data);
        });
        this.world.server.AddCmdListener([ServerClient.CMD_BLOCK_SET], (cmd) => {
            let pos = cmd.data.pos;
            let item = cmd.data.item;
            let block = BLOCK.fromId(item.id);
            let extra_data = cmd.data.item.extra_data ? cmd.data.item.extra_data : null;
            this.setBlock(pos.x, pos.y, pos.z, block, false, item.power, item.rotate, item.entity_id, extra_data, ServerClient.BLOCK_ACTION_REPLACE);
        });
        //
        this.DUMMY = {
            id: BLOCK.DUMMY.id,
            shapes: [],
            properties: BLOCK.DUMMY,
            material: BLOCK.DUMMY,
            getProperties: function() {
                return this.material;
            }
        };
        this.AIR = {
            id: BLOCK.AIR.id,
            properties: BLOCK.AIR
        };
        // Message received from worker
        this.worker.onmessage = function(e) {
            let cmd = e.data[0];
            let args = e.data[1];
            switch(cmd) {
                case 'world_inited':
                case 'worker_inited': {
                    that.worker_inited = --that.worker_counter === 0;
                    break;
                }
                case 'blocks_generated': {
                    // console.log('4. createChunk: generated', new Vector(args.addr).toHash());
                    const chunk = that.chunks.get(args.addr);
                    if(chunk) {
                        chunk.onBlocksGenerated(args);
                    }
                    break;
                }
                case 'vertices_generated': {
                    for(let i = 0; i < args.length; i++) {
                        const result = args[i];
                        let chunk = that.chunks.get(result.addr);
                        if(chunk) {
                            chunk.onVerticesGenerated(result);
                        }
                    }
                    break;
                }
                case 'play_disc': {
                    TrackerPlayer.loadAndPlay('/media/disc/' + args.filename, args.pos, args.dt);
                    break;
                }
                case 'add_animated_block': {
                    that.animated_blocks.add(args);
                    break;
                }
                case 'add_beacon_ray': {
                    const meshes = Qubatch.render.meshes;
                    args.pos = new Vector(args.pos);
                    meshes.addForChunk(getChunkAddr(args.pos), new Particles_BeaconRay(args), 'beacon/' + args.pos.toHash());
                    break;
                }
                case 'del_beacon_ray': {
                    const render = Qubatch.render;
                    args.pos = new Vector(args.pos);
                    render.meshes.remove('beacon/' + args.pos.toHash(), render);
                    break;
                }
                case 'maps_created': {
                    // chunkManager.postWorkerMessage(['createMaps', {addr: {x: 1, y: 1, z: 1}}]);
                    // console.log('maps_created', args.length * 4);
                    console.log('maps_created', args);
                    break;
                }
            }
        }
        // Light worker messages receiver
        this.lightWorker.onmessage = function(e) {
            let cmd = e.data[0];
            let args = e.data[1];
            switch(cmd) {
                case 'worker_inited': {
                    that.worker_inited = --that.worker_counter === 0;
                    break;
                }
                case 'light_generated': {
                    let chunk = that.chunks.get(args.addr);
                    if(chunk) {
                        chunk.onLightGenerated(args);
                    }
                    break;
                }
            }
        }
        // Init webworkers
        let world_info = world.info;
        const generator = world_info.generator;
        const world_seed = world_info.seed;
        const world_guid = world_info.guid;
        const settings = world.settings;
        const resource_cache = Helpers.getCache();

        this.use_light                = !!settings.use_light;
        this.worker_counter           = this.use_light ? 2 : 1;

        this.postWorkerMessage(['init', {
            generator,
            world_seed,
            world_guid,
            settings,
            resource_cache
        }]);
        this.postLightWorkerMessage(['init', null]);

    }

    //
    setRenderDist(value) {
        this.world.server.setRenderDist(value);
    }

    // toggleUpdateChunks
    toggleUpdateChunks() {
        this.update_chunks = !this.update_chunks;
    }

    setLightTexFormat(texFormat, hasNormals) {
        this.lightProps.texFormat = texFormat;
        this.lightProps.depthMul = hasNormals ? 2 : 1;
        this.lightWorker.postMessage(['initRender', { texFormat, hasNormals }]);
    }

    /**
     * highly optimized
     * @param render
     */
    prepareRenderList(render) {

        if(Qubatch.render.testLightOn) {
            return false;
        }

        if (!this.bufferPool) {
            if (render.renderBackend.multidrawExt) {
                 this.bufferPool = new Basic05GeometryPool(render.renderBackend, {});
            } else {
                this.bufferPool = new TrivialGeometryPool(render.renderBackend);
            }
        }

        const chunk_render_dist = Qubatch.player.state.chunk_render_dist;
        const player_chunk_addr = Qubatch.player.chunkAddr;

        if (this.poses_need_update || !player_chunk_addr.equal(this.poses_chunkPos)) {
            this.poses_need_update = false;

            this.postLightWorkerMessage(['setPotentialCenter', { pos: Qubatch.player.pos }]);

            const pos               = this.poses_chunkPos = player_chunk_addr;
            const pos_temp          = pos.clone();
            let margin              = Math.max(chunk_render_dist + 1, 1);
            let spiral_moves_3d     = SpiralGenerator.generate3D(new Vector(margin, CHUNK_GENERATE_MARGIN_Y, margin));
            this.poses.length = 0;
            for (let i = 0; i < spiral_moves_3d.length; i++) {
                const item = spiral_moves_3d[i];
                pos_temp.set(pos.x + item.pos.x, pos.y + item.pos.y, pos.z + item.pos.z);
                const chunk = this.chunks.get(pos_temp);
                if (chunk) {
                    this.poses.push(chunk);
                }
            }
        }

        /**
         * please dont re-assign renderList entries
         */
        const {renderList} = this;
        for (let [key, v] of renderList) {
            for (let [key2, v2] of v) {
                v2.clear();
            }
        }

        //
        let applyVerticesCan = MAX_APPLY_VERTICES_COUNT;
        for(let i = 0; i < this.poses.length; i++) {
            const chunk = this.poses[i];
            if (!chunk.chunkManager) {
                // destroyed!
                continue;
            }
            if(!chunk.updateInFrustum(render)) {
                continue;
            }
            if(chunk.need_apply_vertices) {
                if(applyVerticesCan-- > 0) {
                    chunk.applyVertices();
                }
            }
            // actualize light
            chunk.prepareRender(render.renderBackend);
            if(chunk.vertices_length === 0) {
                continue;
            }
            for(let i = 0; i < chunk.verticesList.length; i++) {
                let v = chunk.verticesList[i];
                let rpl = v.rpl;
                if (!rpl) {
                    let key1 = v.resource_pack_id;
                    let key2 = v.material_group;
                    if (!v.buffer) {
                        continue;
                    }
                    let rpList = renderList.get(key1);
                    if (!rpList) {
                        renderList.set(key1, rpList = new Map());
                    }
                    if (!rpList.get(key2)) {
                        rpList.set(key2, new IvanArray());
                    }
                    rpl = v.rpl = rpList.get(key2);
                }
                rpl.push(chunk);
                rpl.push(v);
                chunk.rendered = 0;
            }
        }
    }

    // Draw level chunks
    draw(render, resource_pack, transparent) {
        if(!this.worker_inited || !this.nearby) {
            return;
        }
        const rpList = this.renderList.get(resource_pack.id);
        if (!rpList) {
            return true;
        }
        let groups = transparent ? GROUPS_TRANSPARENT : GROUPS_NO_TRANSPARENT;;
        for(let group of groups) {
            const list = rpList.get(group);
            if (!list) {
                continue;
            }
            const { arr, count } = list;
            const mat = resource_pack.shader.materials[group];
            for (let i = 0; i < count; i += 2) {
                const chunk = arr[i];
                const vertices = arr[i + 1];
                chunk.drawBufferVertices(render.renderBackend, resource_pack, group, mat, vertices);
                if (!chunk.rendered) {
                    this.rendered_chunks.fact++;
                }
                chunk.rendered++;
            }
        }
        return true;
    }

    /**
     * Return chunk by address
     * @param {*} addr
     * @returns Chunk
     */
    getChunk(addr) {
        return this.chunks.get(addr);
    }

    // Add
    loadChunk(item) {
        if(this.chunks.has(item.addr) || this.chunks_prepare.has(item.addr)) {
            return false;
        }
        this.chunks_prepare.add(item.addr, {
            start_time: performance.now()
        });
        if(item.has_modifiers) {
            this.world.server.loadChunk(item.addr);
        } else {
           if(!this.setChunkState({addr: item.addr, modify_list: null})) {
               return false;
           }
        }
        return true;
    }

    // Установить начальное состояние указанного чанка
    setChunkState(state) {
        const prepare = this.chunks_prepare.get(state.addr);
        if(prepare) {
            const chunk = new Chunk(state.addr, state.modify_list, this);
            chunk.load_time = performance.now() - prepare.start_time;
            this.chunks.add(state.addr, chunk);
            this.chunk_added = true;
            this.rendered_chunks.total++;
            this.chunks_prepare.delete(state.addr);
            this.poses_need_update = true;
            return true;
        }
        return false;
    }

    // postWorkerMessage
    postWorkerMessage(data) {
        this.worker.postMessage(data);
    }

    // postLightWorkerMessage
    postLightWorkerMessage(data) {
        if(this.use_light) {
            this.lightWorker.postMessage(data);
        }
    }

    // Remove chunk
    removeChunk(addr) {
        this.chunks_prepare.delete(addr);
        let chunk = this.chunks.get(addr);
        if(chunk) {
            this.vertices_length_total -= chunk.vertices_length;
            // 1. Delete torch emmiters
            this.animated_blocks.destroyAllInAABB(chunk.aabb);
            // 2. Destroy playing discs
            TrackerPlayer.destroyAllInAABB(chunk.aabb);
            // 3. Call chunk destructor
            chunk.destruct();
            this.chunks.delete(addr)
            this.rendered_chunks.total--;
        }
    }

    // Update
    update(player_pos, delta) {

        // let p = performance.now();
        // let p2 = performance.now();
        // const stat = {};

        if(!this.update_chunks || !this.worker_inited || !this.nearby) {
            return false;
        }

        // Load chunks
        let can_add = CHUNKS_ADD_PER_UPDATE;
        let j = 0;
        for (let i = 0; i < this.nearby.added.length; i++) {
            const item = this.nearby.added[i];
            if (!this.nearby.deleted.has(item.addr)) {
                if (can_add > 0) {
                    if (this.loadChunk(item)) {
                        can_add--;
                    }
                } else {
                    // save for next time
                    this.nearby.added[j++] = item;
                }
            }
        }
        this.nearby.added.length = j;
        // stat['Load chunks'] = (performance.now() - p); p = performance.now();

        // Delete chunks
        const deleted_size = this.nearby.deleted.size;
        for(let addr of this.nearby.deleted) {
            this.removeChunk(addr);
        }
        this.destruct_chunks_queue.send();
        this.nearby.deleted.clear();
        // stat['Delete chunks'] = [(performance.now() - p), deleted_size]; p = performance.now();

        // Build dirty chunks
        this.buildDirtyChunks();
        // stat['Build dirty chunks'] = (performance.now() - p); p = performance.now();

        // Prepare render list
        this.rendered_chunks.fact = 0;
        this.prepareRenderList(Qubatch.render);
        // stat['Prepare render list'] = (performance.now() - p); p = performance.now();

        // Update animated blocks
        this.timer60fps += delta;
        if(this.timer60fps >= 16.666) {
            this.timer60fps = 0;
            this.animated_blocks.update(player_pos);
        }
        // stat['Update animated blocks'] = (performance.now() - p); p = performance.now();

        // Result
        //p2 = performance.now() - p2;
        //if(p2 > 5) {
        //    stat['Total'] = p2;
        //    console.table(stat);
        //}

    }

    // Build dirty chunks
    buildDirtyChunks() {
        if(!this.chunk_added) {
            return;
        }
        this.chunk_added = false;
        for(let chunk of this.chunks) {
            if(chunk.dirty && !chunk.buildVerticesInProgress) {
                let ok = true;
                if(!chunk.addr_neighbors) {
                    chunk.addr_neighbors = [];
                    for(let i = 0; i < CC.length; i++) {
                        const c = CC[i];
                        chunk.addr_neighbors.push(chunk.addr.add(c));
                    }
                }
                for(let i = 0; i < chunk.addr_neighbors.length; i++) {
                    const neighbour_addr = chunk.addr_neighbors[i];
                    if(ALLOW_NEGATIVE_Y || neighbour_addr.y >= 0) {
                        if(!this.getChunk(neighbour_addr)) {
                            ok = false;
                            break;
                        }
                    }
                }
                if(ok) {
                    chunk.buildVertices();
                }
            }
        }
    }

    // Возвращает блок по абслютным координатам
    getBlock(x, y, z, v) {
        if(x instanceof Vector || typeof x == 'object') {
            y = x.y;
            z = x.z;
            x = x.x;
        }
        this.get_block_chunk_addr = getChunkAddr(x, y, z, this.get_block_chunk_addr);
        let chunk = this.chunks.get(this.get_block_chunk_addr);
        if(chunk) {
            return chunk.getBlock(x, y, z, v);
        }
        return this.DUMMY;
    }

    // setBlock
    setBlock(x, y, z, block, is_modify, power, rotate, entity_id, extra_data, action_id) {
        // определяем относительные координаты чанка
        let chunkAddr = getChunkAddr(x, y, z);
        // обращаемся к чанку
        let chunk = this.getChunk(chunkAddr);
        // если чанк найден
        if(!chunk) {
            return null;
        }
        let pos = new Vector(x, y, z);
        let item = {
            id:         block.id,
            power:      power ? power : 1.0,
            rotate:     rotate,
            entity_id:  entity_id,
            extra_data: extra_data ? extra_data : null
        };
        // устанавливаем блок
        return chunk.setBlock(pos.x, pos.y, pos.z, item, false, item.power, item.rotate, item.entity_id, extra_data);
    }

    // Set nearby chunks
    updateNearby(data) {
        if(!this.nearby) {
            this.nearby = {
                added:      [],
                deleted:    new VectorCollector()
            };
        }
        // if (this.nearby.deleted.length > 0) {
        if(this.nearby.deleted.list.size > 0) {
            this.update();
        }
        for(let item of data.added) {
            this.nearby.added.push(item);
        }
        for(let addr of data.deleted) {
            this.nearby.deleted.add(addr, new Vector(addr));
        }
        Qubatch.player.state.chunk_render_dist = data.chunk_render_dist;
    }

    //
    setTestBlocks(pos) {
        let d = 16;
        let cnt = 0;
        let startx = pos.x;
        let all_blocks = BLOCK.getAll();
        const set_block_list = [];
        for(let mat of all_blocks) {
            if(mat.deprecated || !mat.spawnable || mat.item || mat.is_fluid || mat.next_part || mat.previous_part || ['extruder', 'text'].indexOf(mat.style) >= 0) {
                continue;
            }
            if(cnt % d == 0) {
                pos.x = startx;
                pos.z += 2;
            }
            pos.x += 2;
            const item = {
                id:         mat.id,
                extra_data: null
            };
            if(mat.is_chest) {
                item.extra_data = { can_destroy: true, slots: {} };
            } else if(mat.tags.includes('sign')) {
                item.extra_data = {
                    text: 'Hello, World!',
                    username: 'Server',
                    dt: new Date().toISOString()
                };
            } else if(mat.extra_data) {
                item.extra_data = mat.extra_data;
            }
            if(mat.can_rotate) {
                item.rotate = new Vector(0, 1, 0);
            }
            set_block_list.push({
                pos:        pos.clone(),
                type:       item,
                is_modify:  false,
                power:      null,
                rotate:     item.rotate,
                extra_data: item.extra_data
            });
            if(mat.has_head) {
                if(item.rotate) {
                    item.rotate.x = 2;
                }
                const head_extra_data = {...item.extra_data};
                head_extra_data.is_head = true;
                set_block_list.push({
                    pos:        pos.clone().addSelf(mat.has_head.pos),
                    type:       item,
                    is_modify:  false,
                    power:      null,
                    rotate:     item.rotate,
                    extra_data: head_extra_data
                });
            }
            cnt++;
        }
        this.postWorkerMessage(['setBlock', set_block_list]);
    }

}