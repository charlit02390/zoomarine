// Islas con terreno de verdad (malla con alturas) para poder desembarcar y
// caminar por ellas. heightAt() es la misma fórmula que da forma a la malla,
// así el explorador pisa exactamente el suelo que se ve.
// Depende de THREE y ZMModels.

const ZMIslands = (function () {
  const M = ZMModels;
  const RINGS = 30;
  const SEGMENTS = 72;
  const SKIRT = 1.25; // mesh reaches past the shoreline so the seabed slope shows through the water

  const PEAK = { tropical: 0.17, rocoso: 0.32, hielo: 0.26, volcanico: 0.6, limon: 0 };

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Irregular coastline: radius multiplier by angle (same formula in the ocean shader).
  function shoreFactor(isl, ang) {
    return 1 + isl.wobble * (0.6 * Math.sin(3 * ang + isl.seed) + 0.4 * Math.sin(5 * ang + 2.3 * isl.seed));
  }

  function shoreRadius(isl, ang) {
    return isl.r * shoreFactor(isl, ang);
  }

  function heightAt(isl, wx, wz) {
    const dx = wx - isl.x, dz = wz - isl.z;
    const e = Math.hypot(dx, dz) / shoreRadius(isl, Math.atan2(dz, dx));
    if (e >= 1) return Math.max(-14, 0.2 - (e - 1) * isl.r * 0.5);
    const beach = smoothstep(1, 0.82, e);
    let h = 0.2 + beach * 1.8;
    const inland = smoothstep(0.85, 0, e);
    const s = isl.seed;
    const noise = Math.sin(dx * 0.09 + s) * Math.cos(dz * 0.08 - s * 1.3) + 0.5 * Math.sin(dx * 0.21 - dz * 0.17 + s * 2);
    const peak = isl.peak;
    switch (isl.theme) {
      case "rocoso":
        h += Math.pow(inland, 1.1) * peak + noise * 2.5 * inland;
        break;
      case "hielo":
        h += Math.pow(inland, 1.3) * peak + Math.abs(noise) * 3 * inland;
        break;
      case "volcanico":
        h += Math.pow(inland, 1.8) * peak + noise * 1.2 * inland;
        if (e < 0.13) h -= ((0.13 - e) / 0.13) * peak * 0.3;
        break;
      case "limon":
        h += noise * 0.25 * inland;
        break;
      default:
        h += Math.pow(inland, 1.6) * peak + noise * 1.2 * inland;
    }
    // levelled ground (Puerto Limón's football pitch), blended at the edges
    if (isl.flats) {
      for (const f of isl.flats) {
        const d = Math.hypot(Math.max(f.minX - wx, 0, wx - f.maxX), Math.max(f.minZ - wz, 0, wz - f.maxZ));
        if (d < 6) h += (f.h - h) * (1 - smoothstep(0, 6, d));
      }
    }
    return h;
  }

  // ---------------- Terrain mesh ----------------
  const C = (hex) => new THREE.Color(hex);
  const PALETTE = {
    tropical: { beach: C(0xe6d4a0), low: C(0x4f9440), high: C(0x3a7a36), rock: C(0x7d7466) },
    limon: { beach: C(0xe6d4a0), low: C(0x5a9a44), high: C(0x4a8a3a), rock: C(0x8a7d66) },
    rocoso: { beach: C(0xa29c90), low: C(0x4f7f3f), high: C(0x3d6634), rock: C(0x7a7d80) },
    hielo: { beach: C(0xdcecf4), low: C(0xf4fbff), high: C(0xffffff), rock: C(0x8a96a0) },
    volcanico: { beach: C(0x3a3432), low: C(0x4f8f3a), high: C(0x2b2624), rock: C(0x3a302c) },
  };
  const WET = C(0xb9a574), DEEP = C(0x4f6f6a), LAVA_EDGE = C(0x8a2a10);

  function terrainColor(isl, h, e, slope, noise, out) {
    const p = PALETTE[isl.theme];
    if (h < 0.3) {
      out.copy(WET).lerp(DEEP, Math.min(1, -h / 10));
      if (isl.theme === "volcanico") out.lerp(p.beach, 0.5);
      return out;
    }
    if (e > 0.8 && h < 2.6) return out.copy(p.beach);
    const k = Math.min(1, (h - 2) / Math.max(4, isl.peak * 0.8));
    out.copy(p.low).lerp(p.high, Math.min(1, k + noise * 0.15));
    if (isl.theme === "volcanico" && k > 0.35) out.copy(p.high);
    if (isl.theme === "volcanico" && e < 0.18) out.lerp(LAVA_EDGE, 0.6);
    if (slope > 0.9 || (isl.theme === "rocoso" && k > 0.75)) out.lerp(p.rock, 0.75);
    if (isl.theme === "hielo" && slope > 0.7) out.copy(p.rock).lerp(p.low, 0.3);
    return out;
  }

  function buildTerrain(isl) {
    const pos = [];
    const cols = [];
    const idx = [];
    const col = new THREE.Color();
    const push = (lx, lz) => {
      const wx = isl.x + lx, wz = isl.z + lz;
      const h = heightAt(isl, wx, wz);
      const hx = heightAt(isl, wx + 1, wz) - h, hz = heightAt(isl, wx, wz + 1) - h;
      const e = Math.hypot(lx, lz) / shoreRadius(isl, Math.atan2(lz, lx));
      const n = 0.5 + 0.5 * Math.sin(lx * 0.3 + isl.seed) * Math.cos(lz * 0.27);
      terrainColor(isl, h, e, Math.hypot(hx, hz), n, col);
      pos.push(lx, h, lz);
      cols.push(col.r, col.g, col.b);
    };
    push(0, 0);
    for (let j = 1; j <= RINGS; j++) {
      const e = SKIRT * Math.pow(j / RINGS, 0.85);
      for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const d = e * shoreRadius(isl, a);
        push(Math.cos(a) * d, Math.sin(a) * d);
      }
    }
    for (let s = 0; s < SEGMENTS; s++) idx.push(0, 1 + ((s + 1) % SEGMENTS), 1 + s);
    for (let j = 1; j < RINGS; j++) {
      const r0 = 1 + (j - 1) * SEGMENTS, r1 = 1 + j * SEGMENTS;
      for (let s = 0; s < SEGMENTS; s++) {
        const s1 = (s + 1) % SEGMENTS;
        idx.push(r0 + s, r0 + s1, r1 + s, r0 + s1, r1 + s1, r1 + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------------- Props ----------------
  function placeAt(isl, obj, wx, wz, sink) {
    obj.position.set(wx - isl.x, heightAt(isl, wx, wz) - (sink || 0), wz - isl.z);
    isl.mesh.add(obj);
    return obj;
  }

  function freeSpot(isl, wx, wz, r) {
    for (const c of isl.colliders) if (Math.hypot(wx - c.x, wz - c.z) < c.r + r + 1.5) return false;
    return true;
  }

  // Tries random spots in an e-range (fraction of shore radius) until one is free and dry.
  function scatter(isl, hash, key, count, eMin, eMax, radius, make, filter) {
    let placed = 0;
    for (let i = 0; i < count * 6 && placed < count; i++) {
      const a = hash(isl.seed * 3 + key, i) * Math.PI * 2;
      const e = eMin + hash(isl.seed * 5 + key, i + 17) * (eMax - eMin);
      const d = e * shoreRadius(isl, a);
      const wx = isl.x + Math.cos(a) * d, wz = isl.z + Math.sin(a) * d;
      if (heightAt(isl, wx, wz) < 1.2 || !freeSpot(isl, wx, wz, radius)) continue;
      if (filter && !filter(wx - isl.x, wz - isl.z)) continue;
      const obj = make(i);
      if (!obj) continue;
      placeAt(isl, obj, wx, wz, 0.2);
      isl.colliders.push({ x: wx, z: wz, r: radius });
      placed++;
    }
    return placed;
  }

  function populate(isl, hash) {
    const seed = isl.seed;
    if (isl.theme === "tropical") {
      scatter(isl, hash, 1, 16, 0.35, 0.85, 0.8, (i) => M.buildPalm(seed * 20 + i, hash));
      scatter(isl, hash, 2, 5, 0.3, 0.95, 1.6, (i) => M.buildRock(1.2 + hash(seed, i) * 1.5, 0x8a7d6a, seed + i, hash));
    } else if (isl.theme === "rocoso") {
      scatter(isl, hash, 1, 14, 0.2, 0.75, 1.4, (i) => M.buildPine(seed * 20 + i, hash));
      scatter(isl, hash, 2, 8, 0.4, 0.97, 2, (i) => M.buildRock(1.6 + hash(seed, i) * 2.2, 0x6c6f73, seed + i, hash));
      const a = hash(seed, 77) * Math.PI * 2;
      const d = 0.86 * shoreRadius(isl, a);
      const lx = isl.x + Math.cos(a) * d, lz = isl.z + Math.sin(a) * d;
      placeAt(isl, M.buildLighthouse(), lx, lz, 0.3);
      isl.colliders.push({ x: lx, z: lz, r: 2.2 });
    } else if (isl.theme === "hielo") {
      scatter(isl, hash, 1, 5, 0.3, 0.7, 1.4, (i) => M.buildPine(seed * 20 + i, hash));
      const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
      scatter(isl, hash, 2, 9, 0.4, 0.95, 1.6, (i) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1 + hash(seed, i) * 0.8, 3 + hash(seed, i + 3) * 4, 5), iceMat);
        c.rotation.z = (hash(seed, i + 9) - 0.5) * 0.5;
        c.castShadow = true;
        return c;
      });
    } else if (isl.theme === "volcanico") {
      scatter(isl, hash, 1, 8, 0.62, 0.86, 0.8, (i) => M.buildPalm(seed * 20 + i, hash));
      scatter(isl, hash, 2, 8, 0.3, 0.95, 1.8, (i) => M.buildRock(1.4 + hash(seed, i) * 2, 0x2b2624, seed + i, hash));
      const top = heightAt(isl, isl.x, isl.z);
      const lava = new THREE.Mesh(new THREE.CircleGeometry(isl.r * 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xff6a1f }));
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = top + 0.6;
      isl.mesh.add(lava);
      const glow = new THREE.PointLight(0xff6a1f, 1.4, isl.r * 1.4, 2);
      glow.position.y = top + 6;
      isl.mesh.add(glow);
      isl.mesh.userData.smokeY = top + 2;
      isl.lava = { x: isl.x, z: isl.z, r: isl.r * 0.1 };
    }

    // One hidden chest per island
    const a = hash(seed, 91) * Math.PI * 2;
    for (let tries = 0; tries < 12; tries++) {
      const e = 0.3 + hash(seed, 92 + tries) * 0.35;
      const aa = a + tries * 0.7;
      const d = e * shoreRadius(isl, aa);
      const wx = isl.x + Math.cos(aa) * d, wz = isl.z + Math.sin(aa) * d;
      if (!freeSpot(isl, wx, wz, 1.5) || (isl.lava && Math.hypot(wx - isl.x, wz - isl.z) < isl.lava.r + 4)) continue;
      const chest = placeAt(isl, M.buildChest(), wx, wz, 0.1);
      chest.rotation.y = hash(seed, 93) * Math.PI * 2;
      isl.colliders.push({ x: wx, z: wz, r: 1.5 });
      isl.chest = { x: wx, z: wz, mesh: chest };
      break;
    }
  }

  // ---------------- Puerto Limón ----------------
  const PIER = { x: 18, z0: 80, len: 60, w: 6, y: 2.4 };

  function buildHomePort(isl, hash) {
    const add = (obj, lx, lz, ry, collideR) => {
      placeAt(isl, obj, isl.x + lx, isl.z + lz, 0);
      if (ry !== undefined) obj.rotation.y = ry;
      if (collideR) isl.colliders.push({ x: isl.x + lx, z: isl.z + lz, r: collideR });
      return obj;
    };
    // buildings face local +z, people face local -z
    const faceTo = (lx, lz, tx, tz) => Math.atan2(tx - lx, tz - lz);
    const lookTo = (lx, lz, tx, tz) => Math.atan2(-(tx - lx), -(tz - lz));

    // pier + mooring spot for the boat
    const pier = M.buildPier(PIER.len, PIER.w, PIER.y);
    pier.position.set(PIER.x, 0, PIER.z0);
    isl.mesh.add(pier);
    isl.platforms.push({ minX: isl.x + PIER.x - PIER.w / 2, maxX: isl.x + PIER.x + PIER.w / 2, minZ: isl.z + PIER.z0 - 2, maxZ: isl.z + PIER.z0 + PIER.len, y: PIER.y + 0.13, solid: true });
    isl.mooring = { x: isl.x + PIER.x + PIER.w / 2 + 5, z: isl.z + PIER.z0 + 46, yaw: Math.PI };
    isl.spawn = { x: isl.x + 2, z: isl.z + 68, yaw: 0 };

    // welcome arch at the root of the pier
    const wood = M.std(0x6b4a2c, { roughness: 1 });
    [-4, 4].forEach((dx) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), wood);
      post.position.y = 3.5;
      post.castShadow = true;
      const holder = new THREE.Group();
      holder.add(post);
      add(holder, PIER.x + dx, PIER.z0 - 2, 0, 0.5);
    });
    const archSign = M.sign("PUERTO LIMÓN", 9, 1.8);
    archSign.position.set(PIER.x, 7.2 + 2, PIER.z0 - 2);
    archSign.rotation.y = Math.PI;
    isl.mesh.add(archSign);

    // market, mission board, workshop
    const stall = add(M.buildStall(), 38, 64, 0, 4.5);
    const stallSign = M.sign("MERCADO", 5, 1.2, { bg: "#1f6fa0" });
    stallSign.position.set(0, 5.1, 1.7);
    stall.add(stallSign);
    const board = add(M.buildMissionBoard(), 2, 58, 0.2, 2);
    const boardSign = M.sign("MISIONES", 3.6, 0.8, { bg: "#8a2a1f" });
    boardSign.position.set(0, 4.1, 0);
    board.add(boardSign);
    const shop = add(M.buildHouse({ w: 10, d: 8, h: 4.5, wall: 0x3fa7c9, roof: 0x2b4a6f }), -34, 56, faceTo(-34, 56, 0, 80), 6.5);
    const shopSign = M.sign("TALLER NÁUTICO", 6, 1.1, { bg: "#2b4a6f" });
    shopSign.position.set(0, 6.3, 4.1);
    shop.add(shopSign);

    // houses around the plaza
    const houses = [
      { x: -58, z: 22, wall: 0xf2c94c, roof: 0xc8302c },
      { x: -46, z: -16, wall: 0xe86fa0, roof: 0x2f7d4f },
      { x: -14, z: -44, wall: 0x7ed957, roof: 0xc8302c },
      { x: 22, z: -46, wall: 0xff9f43, roof: 0x2b4a6f },
      { x: 52, z: -16, wall: 0x54c6eb, roof: 0xc8302c },
      { x: 60, z: 26, wall: 0xb58cff, roof: 0x2f7d4f },
    ];
    houses.forEach((h, i) => {
      const house = M.buildHouse({ w: 7 + hash(i, 4) * 3, d: 6 + hash(i, 5) * 2, h: 3.6 + hash(i, 6), wall: h.wall, roof: h.roof });
      add(house, h.x, h.z, faceTo(h.x, h.z, 0, 18), 5.2);
    });

    // gazebo in the plaza
    const gazebo = new THREE.Group();
    const white = M.std(0xffffff, { roughness: 0.7 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 6), white);
      p.position.set(Math.cos(a) * 3.6, 2.4, Math.sin(a) * 3.6);
      gazebo.add(p);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.6, 0.5, 6), M.std(0xd8c9a8));
    base.position.y = 0.25;
    gazebo.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2.6, 6), M.std(0xc8302c, { roughness: 0.5, metalness: 0.2 }));
    roof.position.y = 5.7;
    gazebo.add(roof);
    M.shadowed(gazebo);
    add(gazebo, 0, 18, 0);
    isl.platforms.push({ minX: isl.x - 3.5, maxX: isl.x + 3.5, minZ: isl.z + 14.5, maxZ: isl.z + 21.5, y: heightAt(isl, isl.x, isl.z + 18) + 0.5 });

    // football pitch for the kids' mejenga
    const F = { minX: -40, maxX: -16, minZ: 14.5, maxZ: 29.5 };
    const fy = isl.flats[0].h;
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = (x0, z0, x1, z1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.25, 0.06, Math.abs(z1 - z0) + 0.25), lineMat);
      m.position.set((x0 + x1) / 2, fy + 0.03, (z0 + z1) / 2);
      isl.mesh.add(m);
    };
    line(F.minX, F.minZ, F.maxX, F.minZ);
    line(F.minX, F.maxZ, F.maxX, F.maxZ);
    line(F.minX, F.minZ, F.minX, F.maxZ);
    line(F.maxX, F.minZ, F.maxX, F.maxZ);
    line((F.minX + F.maxX) / 2, F.minZ, (F.minX + F.maxX) / 2, F.maxZ);
    const circle = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.05, 32).rotateX(-Math.PI / 2), lineMat);
    circle.position.set((F.minX + F.maxX) / 2, fy + 0.04, (F.minZ + F.maxZ) / 2);
    isl.mesh.add(circle);
    const goalA = M.buildGoal(5, 2.2);
    goalA.position.set(F.minX, fy, (F.minZ + F.maxZ) / 2);
    const goalB = M.buildGoal(5, 2.2);
    goalB.position.set(F.maxX, fy, (F.minZ + F.maxZ) / 2);
    goalB.rotation.y = Math.PI;
    isl.mesh.add(goalA, goalB);
    isl.field = { minX: isl.x + F.minX, maxX: isl.x + F.maxX, minZ: isl.z + F.minZ, maxZ: isl.z + F.maxZ, cx: isl.x + (F.minX + F.maxX) / 2, cz: isl.z + (F.minZ + F.maxZ) / 2, y: fy, goalHalf: 2.5 };

    // lighthouse on the point
    add(M.buildLighthouse(), -60, -62, 0, 2.2);

    // palms, avoiding the town centre and the pier approach
    const outsideTown = (lx, lz) => Math.hypot(lx, lz - 18) > 34 && !(lx > 4 && lx < 50 && lz > 50) && !(lx > -47 && lx < -9 && lz > 8 && lz < 36);
    scatter(isl, hash, 3, 22, 0.45, 0.9, 0.8, (i) => M.buildPalm(700 + i, hash), outsideTown);
    scatter(isl, hash, 4, 5, 0.5, 0.95, 1.6, (i) => M.buildRock(1 + hash(i, 44) * 1.4, 0x8a7d6a, 900 + i, hash), outsideTown);

    // points of interest the player can walk up to
    isl.pois.push(
      { id: "missions", x: isl.x + 6, z: isl.z + 62, r: 6, label: "Hablar con Doña Marisol (misiones)" },
      { id: "market", x: isl.x + 38, z: isl.z + 69, r: 6, label: "Vender pescado en el mercado" },
      { id: "shop", x: isl.x - 30, z: isl.z + 63, r: 6.5, label: "Entrar al Taller Náutico" },
      { id: "legend", x: isl.x + 27, z: isl.z + 70.5, r: 5, label: "Hablar con Tata Chema" }
    );
    // NPCs that stay at their post: where they stand, which way they face, how they look
    isl.npcs = [
      { id: "marisol", x: isl.x + 6, z: isl.z + 59, ry: Math.PI, look: { female: true, skin: 0x6b4226, hair: "bun", hairColor: 0x8a8a8a, shirt: 0xe8484a, bottom: "skirt", bottomColor: 0xf2c94c } },
      { id: "fishmonger", x: isl.x + 38, z: isl.z + 62.8, ry: Math.PI, look: { skin: 0x4a2e1a, hair: "short", hairColor: 0x111111, shirt: 0xffffff, bottom: "pants", bottomColor: 0x2b3440, hat: 0xe8d28a } },
      { id: "mechanic", x: isl.x - 30, z: isl.z + 62, ry: lookTo(-30, 62, 0, 80), look: { skin: 0xc68a5e, hair: "short", hairColor: 0x3a2412, beard: 0x3a2412, shirt: 0x2b4a6f, bottom: "pants", bottomColor: 0x2b4a6f, hat: 0xff8a2a, hatStyle: "cap" } },
      { id: "chema", x: isl.x + 27, z: isl.z + 74, ry: lookTo(27, 74, 18, 66), look: { skin: 0x5a3a22, hair: "bald", beard: 0xdedede, hairColor: 0xdedede, shirt: 0xf2e6c8, bottom: "pants", bottomColor: 0x6b5a3a, hat: 0xd8c27a } },
    ];
    // townsfolk who stroll between these spots and stop to chat
    isl.waypoints = [[0, 30], [8, 42], [38, 74], [12, 66], [22, 70], [-50, 32], [-40, -4], [-12, -32], [20, -34], [46, -8], [52, 34], [4, 8], [-28, 38], [-18, 52]].map(([x, z]) => ({ x: isl.x + x, z: isl.z + z }));
    isl.walkers = [
      { female: true, skin: 0x8a5a3a, hair: "braids", hairColor: 0x111111, shirt: 0x7ed957, bottom: "skirt", bottomColor: 0x3b5a8a },
      { skin: 0x5a3a22, hair: "afro", hairColor: 0x111111, shirt: 0xffb347, bottom: "shorts", bottomColor: 0xe0d0a0 },
      { female: true, skin: 0xd9a57a, hair: "long", hairColor: 0x3a2412, shirt: 0x54c6eb, bottom: "pants", bottomColor: 0xf4f4f4 },
      { skin: 0x6a4228, hair: "short", hairColor: 0x111111, shirt: 0xffd84a, bottom: "shorts", bottomColor: 0x2f7d4f, hat: 0xc8302c, hatStyle: "cap" },
    ];
    // kids playing the mejenga: two teams of two
    isl.kids = [
      { team: 0, look: { kid: true, skin: 0x5a3a22, hair: "curly", hairColor: 0x111111, shirt: 0xe8484a, bottomColor: 0xffffff } },
      { team: 0, look: { kid: true, female: true, skin: 0xc68a5e, hair: "bun", hairColor: 0x2a1a10, shirt: 0xe8484a, bottomColor: 0xffffff } },
      { team: 1, look: { kid: true, skin: 0x8a5a3a, hair: "short", hairColor: 0x111111, shirt: 0x2f9d4f, bottomColor: 0x1d3b6e } },
      { team: 1, look: { kid: true, female: true, skin: 0x4a2e1a, hair: "braids", hairColor: 0x111111, shirt: 0x2f9d4f, bottomColor: 0x1d3b6e } },
    ];
    isl.npcs.forEach((n) => isl.colliders.push({ x: n.x, z: n.z, r: 0.8 }));
  }

  // ---------------- Public ----------------
  function create(opts, hash) {
    const isl = {
      index: opts.index,
      x: opts.x,
      z: opts.z,
      r: opts.r,
      theme: opts.theme,
      name: opts.name,
      seed: opts.seed,
      wobble: opts.theme === "limon" ? 0.03 : 0.11,
      peak: opts.r * PEAK[opts.theme],
      home: !!opts.home,
      sea: opts.sea,
      colliders: [],
      platforms: [],
      pois: [],
      npcs: [],
      chest: null,
    };
    // levelled football pitch in Puerto Limón
    if (isl.home) isl.flats = [{ minX: isl.x - 43, maxX: isl.x - 13, minZ: isl.z + 12, maxZ: isl.z + 32, h: 2.1 }];
    isl.mesh = new THREE.Group();
    isl.mesh.position.set(isl.x, 0, isl.z);
    isl.mesh.add(buildTerrain(isl));
    const terrain = isl.mesh.children[0];
    if (isl.home) buildHomePort(isl, hash);
    else populate(isl, hash);
    // one merged mesh per material for all the island's static props
    M.bake(isl.mesh, [terrain, isl.chest && isl.chest.mesh].filter(Boolean));
    return isl;
  }

  // Ground height including walkable platforms (pier, gazebo floor).
  function groundAt(isl, wx, wz) {
    let h = heightAt(isl, wx, wz);
    for (const p of isl.platforms) {
      if (wx >= p.minX && wx <= p.maxX && wz >= p.minZ && wz <= p.maxZ) h = Math.max(h, p.y);
    }
    return h;
  }

  return { create, heightAt, groundAt, shoreRadius, shoreFactor };
})();
