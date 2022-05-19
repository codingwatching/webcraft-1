import {ServerClient} from "../../../www/js/server_client.js";
import { CMD_ENTITY_INDICATORS } from "../serverpackets/cmd_entity_indicators.js";

export class CMD_RESUR {
    constructor(player, data){
        player.state.indicators.live.value = 20;

        new CMD_ENTITY_INDICATORS(player);

        player.world.teleportPlayer(player, {
            place_id: 'spawn',
        });
    }
}