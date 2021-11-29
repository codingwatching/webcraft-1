export class EntityManager {

    /*

        type (
            ChestSlot struct {
                ID       int     `json:"id"`
                Count    int     `json:"count"`
                Power    float32 `json:"power"`
                EntityID string  `json:"entity_id,omitempty"`
            }
            EntityBlock struct {
                ID   string `json:"id"`
                Type string `json:"type"` // chest
            }
            // Chest ...
            Chest struct {
                UserID int64              `json:"user_id"` // Кто автор
                Time   time.Time          `json:"time"`    // Время создания, time.Now()
                Item   Struct.BlockItem   `json:"item"`    // Предмет
                Slots  map[int]*ChestSlot `json:"slots"`
            }
            EntityManager struct {
                Mu     *sync.Mutex             `json:"-"` // чтобы избежать коллизий
                Chests map[string]*Chest       `json:"chests"`
                Blocks map[string]*EntityBlock `json:"blocks"` // Блоки занятые сущностями (содержат ссылку на сущность) Внимание! В качестве ключа используется сериализованные координаты блока
                World  *World                  `json:"-"`
            }
        )
    */

    constructor(world) {
        this.world = world;
        this.chests = new Map();
        this.blocks = new Map(); // Блоки занятые сущностями (содержат ссылку на сущность) Внимание! В качестве ключа используется сериализованные координаты блока
        this.load();
    }

    // Load from DB
    async load() {
        let resp = await this.world.db.loadWorldChests(this.world);
        this.chests = resp.chests;
        this.blocks = resp.blocks;
    }

    // LoadChest...
    async loadChest(player, params) {
        if(this.chests.has(params.entity_id)) {
            player.sendChest(this.chests.get(params.entity_id));
        }
        console.log("Chest " + params.entity_id + " not found")
    }

    /*

        // GetBlockKey
        func (this *EntityManager) GetBlockKey(pos Struct.Vector3) string {
            return fmt.Sprintf("%d,%d,%d", pos.X, pos.Y, pos.Z)
        }

        // GenerateID...
        func (this *EntityManager) GenerateID() string {
            b := make([]byte, 16)
            _, err := rand.Read(b)
            if err != nil {
                log.Fatal(err)
            }
            uuid := fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
            if _, ok := this.Chests[uuid]; ok {
                return this.GenerateID()
            }
            return uuid
        }

        // GetEntityByPos
        func (this *EntityManager) GetEntityByPos(pos Struct.Vector3) (interface{}, string) {
            this.Mu.Lock()
            defer this.Mu.Unlock()
            blockPosKey := this.GetBlockKey(pos)
            if be, ok := this.Blocks[blockPosKey]; ok {
                // log.Println("Block occupied by another entity")
                switch be.Type {
                case "chest":
                    return this.Chests[be.ID], be.Type
                }
            }
            return nil, ""
        }

        // CreateEntity...
        func (this *EntityManager) CreateChest(world *World, conn *PlayerConn, params *Struct.ParamBlockSet) string {
            this.Mu.Lock()
            defer this.Mu.Unlock()
            blockPosKey := this.GetBlockKey(params.Pos)
            if _, ok := this.Blocks[blockPosKey]; ok {
                log.Println("Block occupied by another entity")
                return ""
            }
            entity := &Chest{
                UserID: conn.Session.UserID,
                Time:   time.Now(),
                Item:   params.Item,
                Slots:  make(map[int]*ChestSlot, 27),
            }
            entity.Item.EntityID = this.GenerateID()
            this.Chests[entity.Item.EntityID] = entity
            this.Blocks[blockPosKey] = &EntityBlock{
                ID:   entity.Item.EntityID,
                Type: "chest",
            }
            // Save to DB
            world.db.CreateChest(conn, &params.Pos, entity)
            // this.Save()
            return entity.Item.EntityID
        }

        // Получены новые данные о содержимом слоте сундука
        func (this *EntityManager) SetChestSlotItem(world *World, conn *PlayerConn, params *Struct.ParamChestSetSlotItem) {
            if chest, ok := this.Chests[params.EntityID]; ok {
                this.Mu.Lock()
                defer this.Mu.Unlock()
                if params.Item.Count == 0 {
                    delete(chest.Slots, params.SlotIndex)
                } else {
                    log.Println(4)
                    chest.Slots[params.SlotIndex] = &ChestSlot{
                        ID:       params.Item.ID,
                        Count:    params.Item.Count,
                        EntityID: params.Item.EntityID,
                        Power:    params.Item.Power,
                    }
                }
                // Save chest slots to DB
                world.db.SaveChestSlots(chest)
            }
        }

    */
}