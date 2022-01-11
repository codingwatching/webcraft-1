import {ROTATE, Vector, VectorCollector} from "./helpers.js";
import { AABB } from './core/AABB.js';
import {BLOCK} from "./blocks.js";
import {ServerClient} from "./server_client.js";

const _createBlockAABB = new AABB();

// Called to perform an action based on the player's block selection and input.
export async function doBlockAction(e, world, player, currentInventoryItem) {
    const NO_DESTRUCTABLE_BLOCKS = [BLOCK.BEDROCK.id, BLOCK.STILL_WATER.id];
    const resp = {
        id:                 e.id,
        error:              null,
        chat_message:       null,
        create_chest:       null,
        delete_chest:       null,
        play_sound:         null,
        load_chest:         null,
        open_window:        null,
        clone_block:        false,
        reset_target_pos:   false,
        reset_target_event: false,
        decrement:          false,
        drop_items:         [],
        blocks:             []
    };
    if(e.pos == false) {
        return resp;
    }
    //
    let pos             = e.pos;
    let destroyBlock    = e.destroyBlock;
    let cloneBlock      = e.cloneBlock;
    let createBlock     = e.createBlock;
    //
    let world_block     = world.getBlock(pos);
    let world_material  = world_block && world_block.id > 0 ? world_block.material : null;
    let extra_data      = world_block.extra_data;
    let rotate          = world_block.rotate;
    let entity_id       = world_block.entity_id;
    //
    if(!world_material && (cloneBlock || createBlock)) {
        console.log('empty world_material', world_block.id, pos);
        return resp;
    }
    //
    let isEditTrapdoor  = !e.shiftKey && createBlock && world_material && world_material.tags.indexOf('trapdoor') >= 0;
    // Edit trapdoor
    if(isEditTrapdoor) {
        // Trapdoor
        if(!extra_data) {
            extra_data = {
                opened: false,
                point: new Vector(0, 0, 0)
            };
        }
        extra_data.opened = extra_data && !extra_data.opened;
        if(world_material.sound) {
            resp.play_sound = {tag: world_material.sound, action: 'open'};
        }
        resp.reset_target_pos = true;
        resp.blocks.push({pos: pos, item: {id: world_material.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY});
    // Destroy
    } else if(destroyBlock) {
        let can_destroy = true;
        if(world_block.extra_data && 'can_destroy' in world_block.extra_data) {
            can_destroy = world_block.extra_data.can_destroy;
        }
        if(can_destroy) {
            if(world_block.id == BLOCK.CHEST.id) {
                resp.delete_chest = {pos: pos, entity_id: world_block.entity_id};
            }
            if(!world_material || NO_DESTRUCTABLE_BLOCKS.indexOf(world_material.id) < 0) {
                //
                const cv = new VectorCollector();
                //
                const pushDestroyBlock = (block) => {
                    if(cv.has(block.posworld)) {
                        return false;
                    }
                    cv.add(block.posworld, true);
                    resp.blocks.push({pos: block.posworld, item: {id: BLOCK.AIR.id}, action_id: ServerClient.BLOCK_ACTION_DESTROY});
                    // 1. Drop block if need
                    const isSurvival = true; // player.game_mode.isSurvival()
                    if(isSurvival) {
                        if(block.material.spawnable && block.material.tags.indexOf('no_drop') < 0) {
                            const item = {id: block.id, count: 1};
                            resp.drop_items.push({pos: block.posworld.add(new Vector(.5, 0, .5)), items: [item]});
                        }
                    }
                };
                //
                const block = world.getBlock(pos);
                const blocks_for_destroy = [block];
                pushDestroyBlock(block);
                //
                resp.decrement = {id: block.id};
                // Destroyed block
                pos = new Vector(pos);
                // 2. destroy plants over this block
                let block_over = world.getBlock(pos.add(Vector.YP));
                if(BLOCK.isPlants(block_over.id)) {
                    blocks_for_destroy.push(block_over);
                    pushDestroyBlock(block_over);
                }
                // 3. Destroy connected blocks
                for(let block of blocks_for_destroy) {
                    for(let cn of ['next_part', 'previous_part']) {
                        let part = block.material[cn];
                        if(part) {
                            let connected_pos = block.posworld.add(part.offset_pos);
                            let block_connected = world.getBlock(connected_pos);
                            if(block_connected.id == part.id) {
                                pushDestroyBlock(block_connected);
                            }
                        }
                    }
                }
            }
        }
    // Clone
    } else if(cloneBlock) {
        if(world_material && e.number == 1) {
            resp.clone_block = true;
        }
    // Create
    } else if(createBlock) {
        // 1. Если ткнули на предмет с собственным окном
        if([BLOCK.CRAFTING_TABLE.id, BLOCK.CHEST.id, BLOCK.FURNACE.id, BLOCK.BURNING_FURNACE.id].indexOf(world_material.id) >= 0) {
            if(!e.shiftKey) {
                switch(world_material.id) {
                    case BLOCK.CRAFTING_TABLE.id: {
                        resp.open_window = 'frmCraft';
                        break;
                    }
                    case BLOCK.CHEST.id: {
                        resp.load_chest = entity_id;
                        break;
                    }
                }
                resp.reset_target_event = true;
                return resp;
            }
        }
        // 2. Проверка инвентаря
        if(!currentInventoryItem || currentInventoryItem.count < 1) {
            return resp;
        }
        const matBlock = BLOCK.fromId(currentInventoryItem.id);
        if(matBlock.deprecated) {
            // throw 'error_deprecated_block';
            return resp;
        }
        // 3. If is egg
        if(BLOCK.isEgg(matBlock.id)) {
            pos.x += pos.n.x + .5
            pos.y += pos.n.y;
            pos.z += pos.n.z + .5;
            resp.chat_message = {text: `/spawnmob ${pos.x} ${pos.y} ${pos.z} ${matBlock.spawn_egg.type} ${matBlock.spawn_egg.skin}`};
            resp.decrement = true;
            return resp;
        }
        // 4. Нельзя ничего ставить поверх этого блока
        let noSetOnTop = world_material.tags.indexOf('no_set_on_top') >= 0;
        if(noSetOnTop && pos.n.y == 1) {
            return resp;
        }
        // 5.
        let replaceBlock = world_material && BLOCK.canReplace(world_material.id, world_block.extra_data, currentInventoryItem.id);
        if(replaceBlock) {
            if(currentInventoryItem.style == 'ladder') {
                return resp;
            }
            pos.n.y = 1;
        } else {
            pos.x += pos.n.x;
            pos.y += pos.n.y;
            pos.z += pos.n.z;
            // Запрет установки блока, если на позиции уже есть другой блок
            let existingBlock = world.getBlock(pos);
            if(!existingBlock.canReplace()) {
                return resp;
            }
        }
        // 6. Запрет установки блока на блоки, которые занимает игрок
        _createBlockAABB.copyFrom({x_min: pos.x, x_max: pos.x + 1, y_min: pos.y, y_max: pos.y + 1, z_min: pos.z, z_max: pos.z + 1});
        if(_createBlockAABB.intersect({
            x_min: player.pos.x - player.radius / 2,
            x_max: player.pos.x - player.radius / 2 + player.radius,
            y_min: player.pos.y,
            y_max: player.pos.y + player.height,
            z_min: player.pos.z - player.radius / 2,
            z_max: player.pos.z - player.radius / 2 + player.radius
        })) {
            return resp;
        }
        const new_pos = new Vector(pos);
        // 7. Проверка места, куда игрок пытается установить блок(и)
        let check_poses = [new_pos];
        if(matBlock.next_part) {
            // Если этот блок имеет "пару"
            check_poses.push(new_pos.add(matBlock.next_part.offset_pos));
        }
        for(let cp of check_poses) {
            let cp_block = world.getBlock(cp);
            if(!BLOCK.canReplace(cp_block.id, cp_block.extra_data, matBlock.id)) {
                resp.error = 'error_block_cannot_be_replace';
                return resp;
            }
        }
        // 8. Некоторые блоки можно ставить только на что-то сверху
        let setOnlyToTop = matBlock.tags.indexOf('layering') >= 0;
        if(setOnlyToTop && pos.n.y != 1) {
            return resp;
        }
        // 10. "Наслаивание" блока друг на друга, при этом блок остается 1, но у него увеличивается высота (максимум до 1)
        let isLayering = world_material.id == matBlock.id && pos.n.y == 1 && world_material.tags.indexOf('layering') >= 0;
        if(isLayering) {
            let new_extra_data = null;
            pos.y--;
            if(extra_data) {
                new_extra_data = JSON.parse(JSON.stringify(extra_data));
            } else {
                new_extra_data = {height: world_material.height};
            }
            new_extra_data.height += world_material.height;
            if(new_extra_data.height < 1) {
                resp.reset_target_pos = true;
                resp.blocks.push({pos: pos, item: {id: world_material.id, rotate: rotate, extra_data: new_extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY});
                resp.decrement = true;
            } else {
                resp.reset_target_pos = true;
                resp.blocks.push({pos: pos, item: {id: BLOCK.SNOW_BLOCK.id}, action_id: ServerClient.BLOCK_ACTION_CREATE});
                resp.decrement = true;
            }
            return resp;
        }
        // 11. Факелы можно ставить только на определенные виды блоков!
        let isTorch = matBlock.style == 'torch';
        if(isTorch) {
            if(!replaceBlock && (
                        ['default', 'fence'].indexOf(world_material.style) < 0 ||
                        (world_material.style == 'fence' && pos.n.y != 1) ||
                        (pos.n.y < 0) ||
                        (world_material.width && world_material.width != 1) ||
                        (world_material.height && world_material.height != 1)
                    )
                ) {
                return resp;
            }
        }
        // 12. Запрет на списание инструментов как блоков
        if(matBlock.instrument_id) {
            switch(matBlock.instrument_id) {
                case 'shovel': {
                    if(world_material.id == BLOCK.DIRT.id) {
                        const extra_data = null;
                        pos.x -= pos.n.x;
                        pos.y -= pos.n.y;
                        pos.z -= pos.n.z;
                        resp.blocks.push({pos: pos, item: {id: BLOCK.DIRT_PATH.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_REPLACE});
                        resp.decrement = true;
                    }
                    break;
                }
            }
        } else if(matBlock.tags.indexOf('bucket') >= 0) {
            if(matBlock.emit_on_set) {
                const emitBlock = BLOCK.fromName(matBlock.emit_on_set);
                const extra_data = BLOCK.makeExtraData(emitBlock, pos);
                resp.blocks.push({pos: pos, item: {id: emitBlock.id, rotate: rotate, extra_data: extra_data}, action_id: replaceBlock ? ServerClient.BLOCK_ACTION_REPLACE : ServerClient.BLOCK_ACTION_CREATE});
                resp.decrement = true;
                if(emitBlock.sound) {
                    resp.play_sound = {tag: emitBlock.sound, action: 'place'};
                }
                return resp;
            }
        } else {
            // Calc rotate
            const calcRotate = (rot, pos_n) => {
                rot = new Vector(rot);
                rot.x = 0;
                rot.y = 0;
                // top normal
                if (Math.abs(pos_n.y) === 1) {                        
                    rot.x = BLOCK.getCardinalDirection(rot);
                    rot.z = 0;
                    rot.y = pos_n.y; // mark that is up
                } else {
                    rot.z = 0;
                    if (pos_n.x !== 0) {
                        rot.x = pos_n.x > 0 ? ROTATE.E : ROTATE.W;
                    } else {
                        rot.x = pos_n.z > 0 ? ROTATE.N : ROTATE.S;
                    }
                }
                return rot;
            };
            const orientation = calcRotate(player.rotate, pos.n);
            //
            const new_item = {
                id: matBlock.id
            };
            for(const prop of ['entity_id', 'extra_data', 'power', 'rotate']) {
                if(prop in currentInventoryItem) {
                    new_item[prop] = currentInventoryItem[prop];
                }
            }
            // Create entity
            switch(matBlock.id) {
                case BLOCK.CHEST.id: {
                    new_item.rotate = orientation; // rotate_orig;
                    resp.create_chest = {pos: new Vector(pos), item: new_item};
                    resp.decrement = true;
                    return resp;
                    break;
                }
            }
            //
            let extra_data = BLOCK.makeExtraData(matBlock, pos);
            //
            const pushBlock = (params) => {
                resp.blocks.push(params);
                const block = BLOCK.fromId(params.item.id);
                if(block.next_part) {
                    // Если этот блок имеет "пару"
                    const next_params = JSON.parse(JSON.stringify(params));
                    next_params.item.id = block.next_part.id;
                    next_params.pos = new Vector(next_params.pos).add(block.next_part.offset_pos);
                    pushBlock(next_params);
                }
            };
            //
            if(replaceBlock) {
                // Replace block
                if(matBlock.is_item || matBlock.is_entity) {
                    if(matBlock.is_entity) {
                        pushBlock({pos: pos, item: {id: matBlock.id, rotate: orientation}, action_id: ServerClient.BLOCK_ACTION_CREATE});
                        resp.decrement = true;
                    }
                } else {
                    pushBlock({pos: pos, item: {id: matBlock.id, rotate: orientation, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_CREATE}); // ServerClient.BLOCK_ACTION_REPLACE
                    resp.decrement = true;
                }
            } else {
                // Create block
                // Посадить растения можно только на блок земли
                let underBlock = world.getBlock(new Vector(pos.x, pos.y - 1, pos.z));
                if(BLOCK.isPlants(matBlock.id) && (!underBlock || underBlock.id != BLOCK.DIRT.id)) {
                    return resp;
                }
                if(matBlock.is_item || matBlock.is_entity) {
                    if(matBlock.is_entity) {
                        pushBlock({pos: pos, item: {id: matBlock.id, rotate: orientation}, action_id: ServerClient.BLOCK_ACTION_CREATE});
                        resp.decrement = true;
                        let b = BLOCK.fromId(matBlock.id);
                        if(b.sound) {
                            resp.play_sound = {tag: b.sound, action: 'place'};
                        }
                    }
                } else {
                    if(['ladder'].indexOf(matBlock.style) >= 0) {
                        // Лианы можно ставить на блоки с прозрачностью
                        if(world_material.transparent && world_material.style != 'default') {
                            return resp;
                        }
                        if(pos.n.y == 0) {
                            if(pos.n.z != 0) {
                                // z
                            } else {
                                // x
                            }
                        } else {
                            let cardinal_direction = orientation.x;
                            let ok = false;
                            for(let i = 0; i < 4; i++) {
                                let pos2 = new Vector(pos.x, pos.y, pos.z);
                                let cd = cardinal_direction + i;
                                if(cd > 4) cd -= 4;
                                // F R B L
                                switch(cd) {
                                    case ROTATE.S: {
                                        pos2 = pos2.add(new Vector(0, 0, 1));
                                        break;
                                    }
                                    case ROTATE.W: {
                                        pos2 = pos2.add(new Vector(1, 0, 0));
                                        break;
                                    }
                                    case ROTATE.N: {
                                        pos2 = pos2.add(new Vector(0, 0, -1));
                                        break;
                                    }
                                    case ROTATE.E: {
                                        pos2 = pos2.add(new Vector(-1, 0, 0));
                                        break;
                                    }
                                }
                                let cardinal_block = world.getBlock(pos2);
                                if(cardinal_block.transparent && !(matBlock.tags.indexOf('anycardinal') >= 0)) {
                                    cardinal_direction = cd;
                                    ok = true;
                                    break;
                                }
                            }
                            if(!ok) {
                                return resp;
                            }
                        }
                    }
                    pushBlock({pos: pos, item: {id: matBlock.id, rotate: orientation, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_CREATE});
                    resp.decrement = true;
                }
            }
        }
    }
    return resp;
} 