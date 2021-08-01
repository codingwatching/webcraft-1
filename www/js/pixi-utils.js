function createPixiBuffer(vertices) {
    const geom = new PIXI.Geometry();
    const buf = new PIXI.Buffer(vertices, false);

    //TODO: stream or dynamic?

    geom.addAttribute('a_position', buf, 3, false, PIXI.TYPES.FLOAT);
    geom.addAttribute('a_texcoord', buf, 2, false, PIXI.TYPES.FLOAT);
    geom.addAttribute('a_color', buf, 4, false, PIXI.TYPES.FLOAT);
    geom.addAttribute('a_normal', buf, 3, false, PIXI.TYPES.FLOAT);
    geom.size = vertices.length / 12;

    geom.updateInternal = (data) => {
        geom.buffers[0].update(data);
        geom.size = geom.buffers[0].data.length / 12;
    }

    return geom;
}
