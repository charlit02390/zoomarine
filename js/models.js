// Modelos 3D del juego: barco, barcos pirata, peces, personas y edificios.
// Solo construyen geometría (sin lógica de juego) y se usan desde game3d.js.

const ZMModels = (function () {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // Materials are shared between identical calls so baked meshes can merge.
  const stdCache = {};
  function std(color, opts) {
    const key = color + JSON.stringify(opts || {});
    return stdCache[key] || (stdCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7 }, opts || {})));
  }

  // Merges every static mesh under `root` into one mesh per material (far
  // fewer draw calls). Meshes inside `skip` subtrees, multi-material meshes and
  // non-mesh objects (lights, sprites) are left alone.
  function bake(root, skip) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const skipSet = new Set(skip || []);
    const buckets = new Map();
    const victims = [];
    const walk = (o) => {
      if (skipSet.has(o)) return;
      if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o !== root) {
        if (o.visible) {
          const b = buckets.get(o.material) || { parts: [], cast: false, receive: false };
          b.parts.push({ geo: o.geometry, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
          b.cast = b.cast || o.castShadow;
          b.receive = b.receive || o.receiveShadow;
          buckets.set(o.material, b);
        }
        victims.push(o);
      }
      o.children.forEach(walk);
    };
    root.children.forEach(walk);
    victims.forEach((o) => o.parent.remove(o));
    buckets.forEach((b, material) => {
      const geos = b.parts.map(({ geo, m }) => {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.applyMatrix4(m);
        return g;
      });
      const names = ["position", "normal", "uv", "color"].filter((n) => geos.every((g) => g.attributes[n]));
      const merged = new THREE.BufferGeometry();
      names.forEach((n) => {
        const size = geos[0].attributes[n].itemSize;
        const total = geos.reduce((a, g) => a + g.attributes[n].count, 0);
        const arr = new Float32Array(total * size);
        let off = 0;
        geos.forEach((g) => {
          arr.set(g.attributes[n].array, off);
          off += g.attributes[n].array.length;
        });
        merged.setAttribute(n, new THREE.BufferAttribute(arr, size));
      });
      if (!merged.attributes.normal) merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      root.add(mesh);
    });
    return root;
  }

  function shadowed(obj) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return obj;
  }

  // Cylinder stretched between two points (rails, rigging, poles).
  function rod(a, b, radius, mat, radial) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial || 5), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }

  // Text on a canvas, used for port signs and floating labels.
  function textTexture(text, opts) {
    const o = Object.assign({ w: 512, h: 128, bg: "#2b5d34", fg: "#fff6d8", font: "bold 64px 'Segoe UI', sans-serif", border: "#f2c14e" }, opts);
    const c = document.createElement("canvas");
    c.width = o.w;
    c.height = o.h;
    const ctx = c.getContext("2d");
    if (o.bg) {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, o.w, o.h);
    }
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, o.w - 10, o.h - 10);
    }
    ctx.fillStyle = o.fg;
    ctx.font = o.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, o.w / 2, o.h / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function sign(text, w, h, opts) {
    const mat = new THREE.MeshStandardMaterial({ map: textTexture(text, opts), roughness: 0.8 });
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), [std(0x5a3a22), std(0x5a3a22), std(0x5a3a22), std(0x5a3a22), mat, mat]);
  }

  function label(text, color) {
    const tex = textTexture(text, { w: 256, h: 128, bg: null, border: null, fg: color || "#ffe14d", font: "bold 96px 'Segoe UI', sans-serif" });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sp.scale.set(4, 2, 1);
    return sp;
  }

  // ---------------- Hull ----------------
  // Lofted hull: sections from stern (+z) to bow (-z), V-shaped bottom that
  // rises into a sharp stem. Faces are coloured in bands by height
  // (topsides / boot stripe / antifouling), with smooth normals.
  function hullGeometry(o) {
    const N = 18;
    const L = o.length, B = o.beam;
    const levels = [
      { y: 0, f: 1.0 }, // replaced by the bulwark top
      { y: 1.2, f: 1.0 },
      { y: 0.55, f: 0.97 },
      { y: 0.15, f: 0.93 },
      { y: -0.6, f: 0.78 },
      { y: -1.2, f: 0.48 },
      { y: -1.6, f: 0.18 },
      { y: -1.8, f: 0 },
    ];
    const S = levels.length;
    const halfBeam = (u) => {
      if (u < 0.5) return (B / 2) * (0.86 + 0.14 * Math.sin((u / 0.5) * Math.PI / 2));
      return (B / 2) * Math.pow(Math.cos(((u - 0.5) / 0.5) * Math.PI / 2), 0.75);
    };
    const topY = (u) => o.deck + o.bulwark + 0.9 * u * u;
    const keelY = (u) => (u < 0.72 ? o.keel : o.keel + ((u - 0.72) / 0.28) * (o.keel * -1 + 0.9));

    const pos = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const z = L / 2 - u * L;
      const w = Math.max(0.001, halfBeam(u));
      const kY = keelY(u);
      const ring = [];
      levels.forEach((lv, k) => {
        let y = k === 0 ? topY(u) : lv.y * (o.keel / -1.8);
        if (k === 1) y = Math.min(y, topY(u) - 0.3);
        let f = lv.f;
        if (y <= kY) {
          y = kY;
          f = 0;
        }
        ring.push([w * f, y]);
      });
      ring[S - 1] = [0, kY];
      // starboard top→keel then port keel→top (skip duplicate keel)
      for (let k = 0; k < S; k++) pos.push(ring[k][0], ring[k][1], z);
      for (let k = S - 2; k >= 0; k--) pos.push(-ring[k][0], ring[k][1], z);
    }
    const R = S * 2 - 1;
    const idx = [];
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < R - 1; k++) {
        const a = i * R + k, b = a + 1, c = (i + 1) * R + k, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // transom (stern plate)
    const centre = pos.length / 3;
    pos.push(0, (topY(0) + keelY(0)) / 2, L / 2);
    for (let k = 0; k < R - 1; k++) idx.push(centre, k + 1, k);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const flat = g.toNonIndexed();
    const p = flat.attributes.position;
    const cols = [];
    const cTop = new THREE.Color(o.colors.top), cStripe = new THREE.Color(o.colors.stripe), cBottom = new THREE.Color(o.colors.bottom);
    for (let t = 0; t < p.count; t += 3) {
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
      const c = cy > 0.72 ? cTop : cy > 0.05 ? cStripe : cBottom;
      for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    flat.userData = { halfBeam, deckY: (u) => o.deck + 0.9 * u * u, L };
    return flat;
  }

  // Deck plank surface following the hull outline, a little inside the bulwark.
  function deckGeometry(hullGeo, inset) {
    const { halfBeam, deckY, L } = hullGeo.userData;
    const N = 18;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const u = Math.min(i / N, 0.97);
      const z = L / 2 - u * L;
      const w = Math.max(0, halfBeam(u) - inset);
      pos.push(-w, deckY(u), z, w, deckY(u), z);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------------- Player boat: sport-fishing trawler ----------------
  function buildBoat() {
    const boat = new THREE.Group();
    const white = std(0xf4f6f8, { roughness: 0.35 });
    const glass = std(0x0f2336, { roughness: 0.08, metalness: 0.7 });
    const chrome = std(0xdfe6ee, { roughness: 0.25, metalness: 0.85 });
    const teak = std(0xb98352, { roughness: 0.8 });
    const navy = std(0x1d3b6e, { roughness: 0.5 });
    const orange = std(0xff6a1f, { roughness: 0.6 });

    const hullGeo = hullGeometry({
      length: 21, beam: 7.6, deck: 2.1, bulwark: 0.55, keel: -1.8,
      colors: { top: 0xf6f8fa, stripe: 0x1d3b6e, bottom: 0xa3322a },
    });
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide });
    boat.add(new THREE.Mesh(hullGeo, hullMat));
    const deck = new THREE.Mesh(deckGeometry(hullGeo, 0.25), teak);
    boat.add(deck);
    const { halfBeam, deckY } = hullGeo.userData;
    const uAt = (z) => (10.5 - z) / 21;

    // Wheelhouse
    const cabin = new THREE.Group();
    const lower = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 6), white);
    lower.position.y = 1.3;
    cabin.add(lower);
    const windows = new THREE.Mesh(new THREE.BoxGeometry(5.08, 0.95, 6.08), glass);
    windows.position.y = 1.85;
    cabin.add(windows);
    // raked windscreen
    const screen = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.3, 0.2), glass);
    screen.position.set(0, 2.9, -2.6);
    screen.rotation.x = -0.45;
    cabin.add(screen);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 4.6), white);
    upper.position.set(0, 3.2, 0.6);
    cabin.add(upper);
    const upperGlass = new THREE.Mesh(new THREE.BoxGeometry(4.66, 0.6, 4.2), glass);
    upperGlass.position.set(0, 3.3, 0.6);
    cabin.add(upperGlass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 6.6), white);
    roof.position.set(0, 3.95, 0.4);
    cabin.add(roof);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.18, 6.1), navy);
    stripe.position.y = 0.9;
    cabin.add(stripe);
    cabin.position.set(0, deckY(uAt(1)), 1);
    boat.add(cabin);

    // Radar arch and mast with a spinning radar bar
    const mast = new THREE.Group();
    mast.add(rod(V3(-2, 0, 0), V3(-1.2, 2.4, 0), 0.12, white));
    mast.add(rod(V3(2, 0, 0), V3(1.2, 2.4, 0), 0.12, white));
    mast.add(rod(V3(-1.2, 2.4, 0), V3(1.2, 2.4, 0), 0.14, white));
    mast.add(rod(V3(0, 2.4, 0), V3(0, 4.2, 0), 0.08, chrome));
    const radar = new THREE.Group();
    radar.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.35), std(0xf0f0f0)));
    radar.position.y = 3.6;
    mast.add(radar);
    mast.add(rod(V3(0.9, 2.4, 0.2), V3(1.3, 7.2, 0.4), 0.04, chrome));
    mast.add(rod(V3(-0.9, 2.4, 0.2), V3(-1.1, 6.2, 0.4), 0.04, chrome));
    const mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mastLight.position.y = 4.3;
    mast.add(mastLight);
    mast.position.set(0, cabin.position.y + 4.05, 1.8);
    boat.add(mast);

    // Navigation lights (red port, green starboard)
    const navR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    navR.position.set(-2.62, cabin.position.y + 2.6, -1.2);
    boat.add(navR);
    const navG = navR.clone();
    navG.material = new THREE.MeshBasicMaterial({ color: 0x2aff5a });
    navG.position.x = 2.62;
    boat.add(navG);

    // Bow rails: stanchions following the hull edge, joined by a top rail
    const railPts = { l: [], r: [] };
    for (let i = 0; i <= 9; i++) {
      const u = 0.52 + (i / 9) * 0.44;
      const z = 10.5 - u * 21;
      const w = Math.max(0.15, halfBeam(u) - 0.35);
      const y = deckY(u);
      railPts.r.push(V3(w, y + 1.3, z));
      railPts.l.push(V3(-w, y + 1.3, z));
      if (i % 2 === 0) {
        boat.add(rod(V3(w, y, z), V3(w, y + 1.3, z), 0.06, chrome));
        boat.add(rod(V3(-w, y, z), V3(-w, y + 1.3, z), 0.06, chrome));
      }
    }
    ["l", "r"].forEach((s) => {
      for (let i = 0; i < railPts[s].length - 1; i++) boat.add(rod(railPts[s][i], railPts[s][i + 1], 0.06, chrome));
    });
    boat.add(rod(railPts.l[railPts.l.length - 1], railPts.r[railPts.r.length - 1], 0.06, chrome));

    // Outriggers (long fishing poles angled out from the cabin roof)
    const outL = rod(V3(-2.3, cabin.position.y + 3.9, 2.5), V3(-7.5, cabin.position.y + 11, 6), 0.08, chrome);
    const outR = rod(V3(2.3, cabin.position.y + 3.9, 2.5), V3(7.5, cabin.position.y + 11, 6), 0.08, chrome);
    boat.add(outL, outR);

    // Lifebuoys on the cabin back, fenders over the side, cooler + crates aft
    [-1.4, 1.4].forEach((x) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.17, 8, 16), orange);
      ring.position.set(x, cabin.position.y + 1.4, 4.05);
      boat.add(ring);
    });
    const fenderMat = std(0x2d6fd0, { roughness: 0.5 });
    [-3, 1, 5].forEach((z) => {
      const u = uAt(z);
      [-1, 1].forEach((s) => {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 8), fenderMat);
        f.position.set(s * (halfBeam(u) + 0.2), deckY(u) - 0.6, z);
        boat.add(f);
      });
    });
    const cooler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.1), white);
    cooler.position.set(-1.6, deckY(uAt(7.5)) + 0.45, 7.5);
    boat.add(cooler);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), std(0x9a6a3a));
    crate.position.set(1.8, deckY(uAt(7.8)) + 0.4, 7.8);
    boat.add(crate);

    // Rod holders at the stern + the rod used when fishing
    const fishingRod = new THREE.Group();
    const rodMat = std(0x222222, { roughness: 0.4 });
    fishingRod.add(rod(V3(0, 0, 0), V3(0, 6.5, 2.8), 0.07, rodMat));
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 10), std(0xd4a017, { metalness: 0.6, roughness: 0.3 }));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 0.9, 0.35);
    fishingRod.add(reel);
    const rodTip = new THREE.Object3D();
    rodTip.position.set(0, 6.5, 2.8);
    fishingRod.add(rodTip);
    fishingRod.position.set(2.6, deckY(0.05) + 0.3, 9);
    fishingRod.visible = false;
    boat.add(fishingRod);
    const holder = rod(V3(-2.6, deckY(0.05), 9), V3(-2.9, deckY(0.05) + 3.4, 10.4), 0.05, rodMat);
    boat.add(holder);

    // Cannon on the foredeck
    const cannonMat = std(0x2a2a2e, { roughness: 0.5, metalness: 0.4 });
    const cannonPivot = new THREE.Group();
    cannonPivot.position.set(0, deckY(uAt(-5)) + 0.4, -5);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 3.8, 12), cannonMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.5, -1.9);
    cannonPivot.add(barrel);
    const cannonBase = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.7, 12), cannonMat);
    cannonBase.position.y = 0.2;
    cannonPivot.add(cannonBase);
    boat.add(cannonPivot);

    shadowed(boat);
    bake(boat, [cannonPivot, fishingRod, radar]);
    return { group: boat, cannonPivot, fishingRod, rodTip, radar };
  }

  // ---------------- Pirate ship: dark hull, two masts with black sails ----------------
  function sailGeometry(w, h, belly) {
    const g = new THREE.PlaneGeometry(w, h, 6, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
      p.setZ(i, -belly * (1 - x * x) * (1 - 0.4 * y * y));
    }
    g.computeVertexNormals();
    return g;
  }

  function buildPirateShip() {
    const g = new THREE.Group();
    const hullGeo = hullGeometry({
      length: 19, beam: 6.8, deck: 2.2, bulwark: 0.9, keel: -1.6,
      colors: { top: 0x4a3326, stripe: 0x1a1210, bottom: 0x2b1d17 },
    });
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(hullGeo, hullMat));
    g.add(new THREE.Mesh(deckGeometry(hullGeo, 0.3), std(0x6b4a30, { roughness: 0.9 })));
    const { deckY } = hullGeo.userData;
    const wood = std(0x3a2a22, { roughness: 0.9 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.9, side: THREE.DoubleSide });

    // stern castle
    const castle = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2, 4), wood);
    castle.position.set(0, deckY(0.1) + 1, 7);
    g.add(castle);
    [
      { z: -3, h: 11, sw: 6, sh: 5 },
      { z: 3, h: 9, sw: 5, sh: 4 },
    ].forEach((m) => {
      const y0 = deckY(0.5);
      g.add(rod(V3(0, y0, m.z), V3(0, y0 + m.h, m.z), 0.18, wood, 6));
      g.add(rod(V3(-m.sw / 2 - 0.4, y0 + m.h - 1, m.z), V3(m.sw / 2 + 0.4, y0 + m.h - 1, m.z), 0.1, wood));
      const sail = new THREE.Mesh(sailGeometry(m.sw, m.sh, 0.9), sailMat);
      sail.position.set(0, y0 + m.h - 1 - m.sh / 2, m.z - 0.3);
      g.add(sail);
    });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ color: 0xcc2c2c, side: THREE.DoubleSide }));
    flag.position.set(1.1, deckY(0.5) + 11.8, -3);
    g.add(flag);
    // gun ports
    const portMat = new THREE.MeshBasicMaterial({ color: 0x0a0605 });
    [-4, 0, 4].forEach((z) => {
      [-1, 1].forEach((s) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), portMat);
        p.position.set(s * 3.42, 1.7, z);
        p.rotation.y = s * Math.PI / 2;
        g.add(p);
      });
    });
    shadowed(g);
    g.userData.hullMat = hullMat;
    g.userData.flag = flag;
    return g;
  }

  // ---------------- Fish ----------------
  // Shared lathe body (nose toward +x) with darker back / lighter belly vertex
  // shading; the material colour gives each species its tint.
  let fishBodyGeo = null;
  function getFishBodyGeo() {
    if (fishBodyGeo) return fishBodyGeo;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12; // 0 = tail, 1 = nose
      const y = -1 + t * 2;
      const r = 0.42 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8) * (0.75 + 0.35 * t) + 0.02;
      pts.push(new THREE.Vector2(i === 0 || i === 12 ? 0.01 : r, y));
    }
    const g = new THREE.LatheGeometry(pts, 14);
    g.rotateZ(-Math.PI / 2);
    g.scale(1, 1, 0.55);
    const p = g.attributes.position;
    const cols = [];
    for (let i = 0; i < p.count; i++) {
      const k = THREE.MathUtils.clamp(0.5 + p.getY(i) / 0.9, 0, 1); // 0 belly .. 1 back
      const v = 1.15 - k * 0.55;
      cols.push(Math.min(1, v), Math.min(1, v), Math.min(1, v * 1.02));
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    fishBodyGeo = g;
    return g;
  }

  function triShape(points) {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }
  const finGeos = {};
  function finGeo(kind) {
    if (!finGeos[kind]) {
      if (kind === "tail") finGeos[kind] = triShape([[0, 0], [-0.55, 0.5], [-0.38, 0], [-0.55, -0.5]]);
      else if (kind === "dorsal") finGeos[kind] = triShape([[0.35, 0], [-0.4, 0], [-0.25, 0.42]]);
      else if (kind === "sail") finGeos[kind] = triShape([[0.6, 0], [-0.7, 0], [-0.4, 0.9], [0.4, 0.8]]);
      else if (kind === "bill") finGeos[kind] = new THREE.ConeGeometry(0.05, 0.9, 5).rotateZ(-Math.PI / 2);
    }
    return finGeos[kind];
  }
  const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x080808 });

  // opts: { special, sail, bill, glow }
  function buildFish(color, scale, opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), vertexColors: true, roughness: 0.35, metalness: 0.25 });
    const finMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.75), roughness: 0.6, side: THREE.DoubleSide });
    if (opts.glow) {
      bodyMat.emissive = new THREE.Color(opts.glow);
      bodyMat.emissiveIntensity = 0.45;
      finMat.emissive = new THREE.Color(opts.glow);
      finMat.emissiveIntensity = 0.3;
    }
    const body = new THREE.Mesh(getFishBodyGeo(), bodyMat);
    g.add(body);
    const tailPivot = new THREE.Group();
    tailPivot.position.x = -0.95;
    tailPivot.add(new THREE.Mesh(finGeo("tail"), finMat));
    g.add(tailPivot);
    const dorsal = new THREE.Mesh(finGeo(opts.sail ? "sail" : "dorsal"), finMat);
    dorsal.position.set(0, 0.3, 0);
    g.add(dorsal);
    const ventral = new THREE.Mesh(finGeo("dorsal"), finMat);
    ventral.scale.set(0.6, -0.6, 1);
    ventral.position.set(-0.2, -0.28, 0);
    g.add(ventral);
    if (opts.bill) {
      const bill = new THREE.Mesh(finGeo("bill"), finMat);
      bill.position.x = 1.35;
      g.add(bill);
    }
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(0.68, 0.08, s * 0.16);
      g.add(e);
    });
    g.scale.setScalar(scale || 1);
    g.userData.tail = tailPivot;
    g.userData.mainMaterial = bodyMat;
    g.userData.phase = Math.random() * 10;
    return g;
  }

  // Tail wiggle; call every frame with the fish's current speed factor.
  function swimFish(fish, t, rate) {
    const r = rate === undefined ? 1 : rate;
    fish.userData.tail.rotation.y = Math.sin(t * (6 + r * 8) + fish.userData.phase) * (0.35 + r * 0.25);
  }

  // ---------------- Whales ----------------
  // Lathe body from tail (-x) to nose (+x), 2 units long before scaling; each
  // shape is 11 radii sampled tail→nose. Belly vertices are lighter.
  const WHALE_SHAPES = {
    jorobada: { radii: [0.02, 0.05, 0.09, 0.14, 0.18, 0.2, 0.2, 0.19, 0.17, 0.13, 0.04], pectoral: 0.62, dorsal: 0.1, belly: 0xe8ecef },
    azul: { radii: [0.02, 0.04, 0.07, 0.1, 0.12, 0.135, 0.14, 0.135, 0.12, 0.09, 0.03], pectoral: 0.2, dorsal: 0.05, belly: 0xb8c8d6 },
    cachalote: { radii: [0.02, 0.05, 0.09, 0.13, 0.16, 0.18, 0.19, 0.2, 0.2, 0.19, 0.13], pectoral: 0.15, dorsal: 0.07, belly: 0x6a625c },
    beluga: { radii: [0.02, 0.06, 0.12, 0.18, 0.22, 0.24, 0.24, 0.22, 0.2, 0.18, 0.08], pectoral: 0.2, dorsal: 0, belly: 0xffffff },
    franca: { radii: [0.02, 0.05, 0.1, 0.16, 0.21, 0.24, 0.24, 0.23, 0.2, 0.15, 0.06], pectoral: 0.22, dorsal: 0, belly: 0xd8d8dc },
  };
  const whaleBodyGeos = {};
  function whaleBodyGeo(shape) {
    if (whaleBodyGeos[shape]) return whaleBodyGeos[shape];
    const def = WHALE_SHAPES[shape];
    const pts = def.radii.map((r, i) => new THREE.Vector2(i === 0 || i === 10 ? 0.01 : r, -1 + (i / 10) * 2));
    const g = new THREE.LatheGeometry(pts, 18);
    g.rotateZ(-Math.PI / 2);
    g.scale(1, 0.9, 1);
    const p = g.attributes.position;
    const top = new THREE.Color(0xffffff), belly = new THREE.Color(def.belly);
    const cols = [];
    for (let i = 0; i < p.count; i++) {
      // back keeps the material colour, the belly blends toward the belly tint
      const k = THREE.MathUtils.smoothstep(-p.getY(i), 0.02, 0.12);
      const c = top.clone().lerp(belly, k);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return (whaleBodyGeos[shape] = g);
  }
  function flatShape(points) {
    const g = triShape(points);
    g.rotateX(-Math.PI / 2); // lie flat in the XZ plane
    return g;
  }
  const flukeGeo = flatShape([[0.04, 0], [-0.2, 0.36], [-0.3, 0.38], [-0.17, 0.02], [-0.3, -0.38], [-0.2, -0.36]]);
  const whaleEyeGeo = new THREE.SphereGeometry(0.018, 6, 6);

  // Nose toward +x, `length` world units long. userData: tail (pivot to beat
  // up and down), radius (body radius in world units), blowhole (local x).
  function buildWhale(species) {
    const def = WHALE_SHAPES[species.shape] || WHALE_SHAPES.jorobada;
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(species.color), vertexColors: true, roughness: 0.55, metalness: 0.05 });
    const finMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(species.color).multiplyScalar(0.85), roughness: 0.6, side: THREE.DoubleSide });
    const body = new THREE.Mesh(whaleBodyGeo(species.shape), skin);
    body.castShadow = true;
    g.add(body);

    const tail = new THREE.Group();
    tail.position.x = -0.92;
    const fluke = new THREE.Mesh(flukeGeo, finMat);
    fluke.scale.setScalar(species.shape === "beluga" ? 0.8 : 1);
    tail.add(fluke);
    g.add(tail);

    // pectoral fins: humpbacks have huge white "wings"
    const pecMat = species.shape === "jorobada" ? std(0xdfe4e8, { roughness: 0.6, side: THREE.DoubleSide }) : finMat;
    const L = def.pectoral;
    const pecGeo = flatShape([[0.06, 0], [-0.06, 0], [-L * 0.35, L], [-L * 0.2, L * 0.9]]);
    [-1, 1].forEach((s) => {
      const pec = new THREE.Mesh(pecGeo, pecMat);
      pec.position.set(0.32, -0.1, s * 0.15);
      pec.scale.z = -s; // the flat shape points toward -z
      pec.rotation.x = s * 0.45; // droop down and out
      g.add(pec);
    });

    if (def.dorsal) {
      const d = new THREE.Mesh(triShape([[0.05, 0], [-0.12, 0], [-0.1, def.dorsal]]), finMat);
      const r = def.radii[3] * 0.9;
      d.position.set(-0.35, r - 0.01, 0);
      g.add(d);
    }

    // eyes low on the head, where the mouth line ends
    const eyeX = species.shape === "cachalote" ? 0.45 : 0.62;
    const eyeR = def.radii[Math.round(((eyeX + 1) / 2) * 10)] * 0.9;
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(whaleEyeGeo, eyeMat);
      e.position.set(eyeX, -eyeR * 0.35, s * eyeR * 0.93);
      g.add(e);
    });

    // southern right whales: white callosities on the head
    if (species.shape === "franca") {
      const callus = std(0xe9e4d6, { roughness: 0.9 });
      [[0.9, 0.04, 0], [0.8, 0.08, 0.04], [0.8, 0.08, -0.04], [0.7, 0.12, 0.07], [0.7, 0.12, -0.07]].forEach(([x, y, z]) => {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), callus);
        c.position.set(x, y, z);
        c.scale.y = 0.5;
        g.add(c);
      });
    }

    const len = species.length || 20;
    g.scale.setScalar(len / 2);
    const maxR = Math.max(...def.radii);
    g.userData = { tail, radius: (maxR * len) / 2, blowhole: species.shape === "cachalote" ? 0.95 : 0.6, phase: Math.random() * 10 };
    return g;
  }

  // Tail beats up and down; `rate` ~1 cruising, higher when diving or leaping.
  function swimWhale(w, t, rate) {
    const r = rate === undefined ? 1 : rate;
    w.userData.tail.rotation.z = Math.sin(t * (1.2 + r * 0.9) + w.userData.phase) * (0.18 + r * 0.12);
  }

  // ---------------- Sharks ----------------
  // Nose toward +x, about 2 units long before `scale`. userData.tail wiggles
  // side to side like a fish (swimFish works on it).
  function buildShark(color, scale) {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), vertexColors: true, roughness: 0.5, metalness: 0.1 });
    const finMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.85), roughness: 0.55, side: THREE.DoubleSide });
    const body = new THREE.Mesh(getFishBodyGeo(), skin);
    body.scale.set(1.25, 0.75, 0.8);
    g.add(body);
    const tail = new THREE.Group();
    tail.position.x = -1.15;
    tail.add(new THREE.Mesh(triShape([[0.1, 0], [-0.45, 0.62], [-0.3, 0.05], [-0.3, -0.05], [-0.3, -0.35]]), finMat));
    g.add(tail);
    const dorsal = new THREE.Mesh(triShape([[0.25, 0], [-0.3, 0], [-0.2, 0.55]]), finMat);
    dorsal.position.set(0.05, 0.26, 0);
    g.add(dorsal);
    const pecGeo = flatShape([[0.12, 0], [-0.12, 0], [-0.3, 0.5]]);
    [-1, 1].forEach((s) => {
      const pec = new THREE.Mesh(pecGeo, finMat);
      pec.position.set(0.3, -0.16, s * 0.18);
      pec.scale.z = -s;
      pec.rotation.x = s * 0.5;
      g.add(pec);
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(0.95, 0.07, s * 0.17);
      g.add(e);
    });
    g.scale.setScalar(scale || 1);
    g.userData.tail = tail;
    g.userData.mainMaterial = skin;
    g.userData.phase = Math.random() * 10;
    return g;
  }

  // ---------------- Harpoon ----------------
  // Spear along -z (the way the camera looks), tip at the front.
  function buildHarpoonSpear() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6).rotateX(Math.PI / 2), std(0xc9ced6, { metalness: 0.7, roughness: 0.3 }));
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6).rotateX(-Math.PI / 2), std(0xeef2f6, { metalness: 0.8, roughness: 0.2 }));
    tip.position.z = -1.75;
    g.add(tip);
    const barbs = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.35, 4).rotateX(Math.PI / 2), std(0x9aa3ad, { metalness: 0.7, roughness: 0.3 }));
    barbs.position.z = -1.35;
    g.add(barbs);
    return g;
  }

  // Speargun held in front of the camera; userData.spear shows while loaded.
  function buildHarpoonGun() {
    const g = new THREE.Group();
    const dark = std(0x2a2f36, { roughness: 0.5, metalness: 0.4 });
    const wood = std(0x8a5a2a, { roughness: 0.7 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8).rotateX(Math.PI / 2), dark);
    barrel.position.z = -0.35;
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.12), wood);
    grip.position.set(0, -0.14, 0.12);
    grip.rotation.x = -0.3;
    g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.35), wood);
    stock.position.set(0, -0.02, 0.35);
    g.add(stock);
    const bands = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 12), std(0x3a8f4a, { roughness: 0.6 }));
    bands.position.z = -0.9;
    g.add(bands);
    const spear = buildHarpoonSpear();
    spear.scale.setScalar(0.45);
    spear.position.set(0, 0.07, -0.55);
    g.add(spear);
    g.userData.spear = spear;
    return g;
  }

  // ---------------- Kraken ----------------
  // Giant squid-like monster: a mantle pointing up, two glowing eyes and eight
  // tentacles made of segments the game poses every frame. userData:
  // mantle, eyeMat, tentacles [{ base (local), dir (local, unit), segs[] }].
  function buildKraken() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a2a3a, roughness: 0.45, metalness: 0.1, emissive: 0x2a0508, emissiveIntensity: 0.4 });
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14; // 0 = head (bottom) .. 1 = mantle tip (top)
      const r = 14 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.85)) * (1 - t * 0.35) + 0.5;
      pts.push(new THREE.Vector2(i === 14 ? 0.5 : r, t * 42));
    }
    const mantle = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), skin);
    g.add(mantle);
    // side fins at the top of the mantle
    const finGeoK = triShape([[0, 0], [16, 6], [0, 14]]);
    [-1, 1].forEach((s) => {
      const f = new THREE.Mesh(finGeoK, new THREE.MeshStandardMaterial({ color: 0x6a1f2c, roughness: 0.5, side: THREE.DoubleSide }));
      f.position.set(0, 28, 0);
      f.scale.x = s;
      g.add(f);
    });
    const eyeMatK = new THREE.MeshStandardMaterial({ color: 0xffe36b, emissive: 0xffb300, emissiveIntensity: 1.2, roughness: 0.2 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 12), eyeMatK);
      eye.position.set(s * 10.5, 7, 6);
      g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), pupilMat);
      pupil.scale.set(0.5, 1.2, 0.5);
      pupil.position.set(s * 11.6, 7, 8.4);
      g.add(pupil);
    });
    // tentacles: tapered segments, bases in a ring under the head
    const segGeos = [];
    const SEGS = 12;
    for (let i = 0; i < SEGS; i++) {
      const r0 = 2.6 * (1 - i / SEGS) + 0.35, r1 = 2.6 * (1 - (i + 1) / SEGS) + 0.35;
      const geo = new THREE.CylinderGeometry(r1, r0, 1, 8);
      geo.translate(0, 0.5, 0); // pivot at the segment's base
      segGeos.push(geo);
    }
    const suckerMat = new THREE.MeshStandardMaterial({ color: 0xe8a0a8, roughness: 0.6 });
    const tentacles = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const base = new THREE.Vector3(Math.cos(a) * 8, 1, Math.sin(a) * 8);
      const dir = new THREE.Vector3(Math.cos(a), -0.2, Math.sin(a)).normalize();
      const segs = segGeos.map((geo, i) => {
        const m = new THREE.Mesh(geo, i === SEGS - 1 ? suckerMat : skin);
        g.add(m);
        return m;
      });
      tentacles.push({ base, dir, angle: a, segs });
    }
    g.userData = { mantle, skin, eyeMat: eyeMatK, tentacles, segLen: 5.2 };
    return g;
  }

  // ---------------- People ----------------
  // Jointed figure (hips/knees, shoulders/elbows) facing -z, ~2.6 units tall.
  // Options: skin, shirt, bottom ('shorts'|'pants'|'skirt'), bottomColor,
  // hair ('short'|'long'|'afro'|'bun'|'braids'|'curly'|'bald'), hairColor,
  // hat (colour or null), hatStyle ('straw'|'cap'), beard (colour), female, kid, shoes.
  const matCache = {};
  function cmat(color, rough) {
    const k = color + ":" + (rough || 0.85);
    return matCache[k] || (matCache[k] = std(color, { roughness: rough || 0.85 }));
  }
  const geoCache = {};
  function cgeo(key, make) {
    return geoCache[key] || (geoCache[key] = make());
  }
  function segment(r0, r1, len, mat) {
    // tapered capsule hanging down from its pivot: one lathe mesh with rounded ends
    const geo = cgeo(`seg${r0}_${r1}_${len}`, () => {
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const a = (i / 4) * (Math.PI / 2);
        pts.push(new THREE.Vector2(Math.sin(a) * r1 + 0.001, -len - Math.cos(a) * r1));
      }
      for (let i = 4; i >= 0; i--) {
        const a = (i / 4) * (Math.PI / 2);
        pts.push(new THREE.Vector2(Math.sin(a) * r0 + 0.001, Math.cos(a) * r0));
      }
      const g = new THREE.LatheGeometry(pts, 10);
      g.computeVertexNormals();
      return g;
    });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mat));
    return g;
  }
  function torsoGeo(female) {
    return cgeo("torso" + (female ? "f" : "m"), () => {
      const prof = female
        ? [[0.01, 0], [0.36, 0.02], [0.37, 0.14], [0.28, 0.38], [0.36, 0.6], [0.37, 0.72], [0.3, 0.84], [0.11, 0.88]]
        : [[0.01, 0], [0.33, 0.02], [0.34, 0.15], [0.31, 0.38], [0.37, 0.6], [0.42, 0.76], [0.31, 0.85], [0.12, 0.88]];
      const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 16);
      g.scale(1, 1, 0.62);
      g.computeVertexNormals();
      return g;
    });
  }

  function buildPerson(o) {
    o = Object.assign({ shirt: 0x2f8fd8, bottom: "shorts", bottomColor: 0x2b3440, skin: 0xc68a5e, hair: "short", hairColor: 0x2a1a10, hat: null, hatStyle: "straw", beard: null, female: false, kid: false, shoes: 0x3a2a20 }, o);
    // older callers passed pants colour as `pants`
    if (o.pants !== undefined) o.bottomColor = o.pants;
    const g = new THREE.Group();
    const rig = new THREE.Group();
    g.add(rig);
    const skin = cmat(o.skin, 0.75);
    const shirt = cmat(o.shirt, 0.9);
    const bottom = cmat(o.bottomColor, 0.9);
    const hairMat = cmat(o.hairColor, 1);
    const HIP = 1.12;

    // legs
    const leg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.17, HIP, 0);
      hip.add(segment(0.16, 0.12, 0.55, o.bottom === "skirt" ? skin : bottom));
      const knee = new THREE.Group();
      knee.position.y = -0.55;
      knee.add(segment(0.12, 0.085, 0.5, o.bottom === "pants" ? bottom : skin));
      const shoe = new THREE.Mesh(cgeo("shoe", () => new THREE.BoxGeometry(0.2, 0.12, 0.36)), cmat(o.shoes, 0.7));
      shoe.position.set(0, -0.54, -0.08);
      knee.add(shoe);
      hip.add(knee);
      rig.add(hip);
      return { hip, knee };
    };
    const L = leg(-1), R = leg(1);

    // hips, torso, skirt
    const hips = new THREE.Mesh(cgeo("hips", () => new THREE.CylinderGeometry(0.34, 0.33, 0.3, 14).scale(1, 1, 0.66)), bottom);
    hips.position.y = HIP + 0.05;
    rig.add(hips);
    const torso = new THREE.Mesh(torsoGeo(o.female), shirt);
    torso.position.y = HIP - 0.02;
    rig.add(torso);
    if (o.bottom === "skirt") {
      const skirt = new THREE.Mesh(cgeo("skirt", () => new THREE.CylinderGeometry(0.33, 0.52, 0.62, 16, 1, true).scale(1, 1, 0.8)), cmat(o.bottomColor, 0.9));
      skirt.material.side = THREE.DoubleSide;
      skirt.position.y = HIP - 0.2;
      rig.add(skirt);
    }

    // arms (short sleeves: upper arm in shirt colour, forearm skin)
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.46, HIP + 0.78, 0);
      sh.add(segment(0.11, 0.09, 0.42, shirt));
      const el = new THREE.Group();
      el.position.y = -0.42;
      el.add(segment(0.085, 0.07, 0.4, skin));
      const hand = new THREE.Mesh(cgeo("hand", () => new THREE.SphereGeometry(0.1, 8, 8).scale(0.8, 1.1, 0.6)), skin);
      hand.position.y = -0.48;
      el.add(hand);
      sh.add(el);
      rig.add(sh);
      return { sh, el };
    };
    const AL = arm(-1), AR = arm(1);
    AL.sh.rotation.z = -0.08;
    AR.sh.rotation.z = 0.08;

    // neck + head
    const neck = new THREE.Mesh(cgeo("neck", () => new THREE.CylinderGeometry(0.1, 0.11, 0.18, 8)), skin);
    neck.position.y = HIP + 0.94;
    rig.add(neck);
    const head = new THREE.Group();
    head.position.y = HIP + 1.26;
    rig.add(head);
    const skull = new THREE.Mesh(cgeo("skull", () => new THREE.SphereGeometry(0.28, 18, 14).scale(0.92, 1.06, 0.98)), skin);
    head.add(skull);
    const white = cmat(0xffffff, 0.3), dark = cmat(0x1a1210, 0.4);
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(cgeo("eyeW", () => new THREE.SphereGeometry(0.045, 10, 8).scale(1, 0.8, 0.6)), white);
      eye.position.set(s * 0.1, 0.03, -0.255);
      const pupil = new THREE.Mesh(cgeo("pupil", () => new THREE.SphereGeometry(0.025, 8, 6)), dark);
      pupil.position.set(s * 0.1, 0.03, -0.278);
      const brow = new THREE.Mesh(cgeo("brow", () => new THREE.BoxGeometry(0.11, 0.022, 0.03)), hairMat);
      brow.position.set(s * 0.1, 0.115, -0.255);
      brow.rotation.z = s * -0.12;
      const ear = new THREE.Mesh(cgeo("ear", () => new THREE.SphereGeometry(0.06, 8, 6).scale(0.5, 1, 0.8)), skin);
      ear.position.set(s * 0.265, 0, 0.02);
      head.add(eye, pupil, brow, ear);
    });
    const nose = new THREE.Mesh(cgeo("nose", () => new THREE.ConeGeometry(0.04, 0.11, 6).rotateX(-Math.PI / 2)), skin);
    nose.position.set(0, -0.03, -0.29);
    head.add(nose);
    const mouth = new THREE.Mesh(cgeo("smile", () => new THREE.TorusGeometry(0.065, 0.013, 6, 12, Math.PI)), cmat(0x7a2a2a, 0.6));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.1, -0.255);
    head.add(mouth);

    // hair
    const cap = () => {
      const c = new THREE.Mesh(cgeo("hairCap", () => new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), hairMat);
      c.position.set(0, 0.05, 0.03);
      c.rotation.x = 0.5; // tilted back so the hairline sits above the brows
      head.add(c);
    };
    if (o.hair === "short") cap();
    else if (o.hair === "long") {
      cap();
      const back = new THREE.Mesh(cgeo("hairLong", () => new THREE.SphereGeometry(0.3, 12, 10).scale(1, 1.5, 0.55)), hairMat);
      back.position.set(0, -0.2, 0.13);
      head.add(back);
    } else if (o.hair === "afro") {
      const afro = new THREE.Mesh(cgeo("afro", () => new THREE.SphereGeometry(0.38, 14, 12).scale(1, 0.95, 0.85)), hairMat);
      afro.position.set(0, 0.12, 0.08);
      head.add(afro);
    } else if (o.hair === "bun") {
      cap();
      const bun = new THREE.Mesh(cgeo("bun", () => new THREE.SphereGeometry(0.13, 10, 8)), hairMat);
      bun.position.set(0, 0.22, 0.2);
      head.add(bun);
    } else if (o.hair === "braids") {
      cap();
      [-1, 1].forEach((s) => {
        const br = segment(0.05, 0.04, 0.5, hairMat);
        br.position.set(s * 0.18, -0.02, 0.16);
        br.rotation.z = s * 0.15;
        head.add(br);
      });
    } else if (o.hair === "curly") {
      cap();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const c = new THREE.Mesh(cgeo("curl", () => new THREE.SphereGeometry(0.09, 8, 6)), hairMat);
        c.position.set(Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2 + 0.03);
        head.add(c);
      }
    }
    if (o.beard) {
      const beard = new THREE.Mesh(cgeo("beard", () => new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).scale(1, 1, 0.8)), cmat(o.beard, 1));
      beard.position.set(0, -0.07, -0.08);
      head.add(beard);
    }
    if (o.hat) {
      const hatMat = cmat(o.hat, 1);
      if (o.hatStyle === "cap") {
        const dome = new THREE.Mesh(cgeo("capDome", () => new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hatMat);
        dome.position.y = 0.08;
        const visor = new THREE.Mesh(cgeo("visor", () => new THREE.BoxGeometry(0.34, 0.03, 0.24)), hatMat);
        visor.position.set(0, 0.1, -0.33);
        head.add(dome, visor);
      } else {
        const brim = new THREE.Mesh(cgeo("brim", () => new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20)), hatMat);
        brim.position.y = 0.2;
        const crown = new THREE.Mesh(cgeo("crown", () => new THREE.CylinderGeometry(0.26, 0.3, 0.26, 14)), hatMat);
        crown.position.y = 0.33;
        const band = new THREE.Mesh(cgeo("band", () => new THREE.CylinderGeometry(0.305, 0.305, 0.06, 14)), cmat(0x3a2a20));
        band.position.y = 0.24;
        head.add(brim, crown, band);
      }
    }

    shadowed(g);
    // tiny face/hair details don't need their own shadow pass
    g.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (m.geometry.boundingSphere.radius < 0.16) m.castShadow = false;
    });
    if (o.kid) {
      head.scale.setScalar(1.28);
      head.position.y += 0.08;
      g.scale.setScalar(0.6);
    }
    g.userData = { rig, hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, shL: AL.sh, shR: AR.sh, elL: AL.el, elR: AR.el, head, phase: Math.random() * 6, wave: 0, talk: 0, kick: 0 };
    return g;
  }

  // speed in world units/s (of the unscaled figure); the figure faces -z.
  function animatePerson(p, dt, speed, t) {
    const u = p.userData;
    const k = Math.min(1, Math.abs(speed) / 7);
    const runK = Math.min(1, Math.max(0, (Math.abs(speed) - 8) / 6));
    u.phase += dt * (2 + Math.abs(speed) * 1.1);
    const s = Math.sin(u.phase);
    const swing = (0.55 + runK * 0.35) * k;
    u.hipL.rotation.x = s * swing;
    u.hipR.rotation.x = -s * swing;
    u.kneeL.rotation.x = -Math.max(0, Math.sin(u.phase - 1.2)) * (0.9 + runK * 0.6) * k;
    u.kneeR.rotation.x = -Math.max(0, -Math.sin(u.phase - 1.2)) * (0.9 + runK * 0.6) * k;
    u.shL.rotation.x = -s * swing * 0.9;
    u.shR.rotation.x = s * swing * 0.9;
    u.elL.rotation.x = u.elR.rotation.x = 0.25 + k * 0.5 + runK * 0.5;
    u.rig.position.y = Math.abs(Math.cos(u.phase)) * 0.07 * k;
    u.rig.rotation.x = -runK * 0.12;
    // idle breathing / arm sway
    const idle = 1 - k;
    u.shL.rotation.z = -0.08 - Math.sin(t * 1.5) * 0.03 * idle;
    u.shR.rotation.z = 0.08 + Math.sin(t * 1.5) * 0.03 * idle;
    u.head.rotation.y = Math.sin(t * 0.5 + u.phase * 0.1) * 0.25 * idle;

    if (u.talk > 0) {
      u.talk -= dt;
      u.elL.rotation.x = 1.1 + Math.sin(t * 6) * 0.25;
      u.elR.rotation.x = 1.0 + Math.sin(t * 5 + 1) * 0.3;
      u.shL.rotation.x = u.shR.rotation.x = -0.3;
      u.head.rotation.x = Math.sin(t * 7) * 0.06;
    }
    if (u.wave > 0) {
      u.wave -= dt;
      u.shR.rotation.set(0, 0, 2.7);
      u.elR.rotation.set(0, 0, Math.sin(t * 11) * 0.5);
    } else if (u.elR.rotation.z !== 0) {
      u.elR.rotation.z = 0;
    }
    if (u.kick > 0) {
      u.kick -= dt;
      u.hipR.rotation.x = 1.2 * Math.sin(Math.PI * Math.min(1, u.kick / 0.3));
      u.kneeR.rotation.x = -0.2;
    }
  }

  // ---------------- Speech bubbles ----------------
  const bubbleCache = {};
  function bubbleTexture(text) {
    if (bubbleCache[text]) return bubbleCache[text];
    const font = "bold 44px 'Segoe UI', sans-serif";
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = font;
    const w = Math.min(1000, Math.ceil(probe.measureText(text).width) + 60);
    const h = 120;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(20,40,60,0.8)";
    ctx.lineWidth = 5;
    const r = 30, bh = 88;
    ctx.beginPath();
    ctx.moveTo(r, 3);
    ctx.lineTo(w - r, 3);
    ctx.quadraticCurveTo(w - 3, 3, w - 3, r);
    ctx.lineTo(w - 3, bh - r);
    ctx.quadraticCurveTo(w - 3, bh, w - r, bh);
    ctx.lineTo(w / 2 + 16, bh);
    ctx.lineTo(w / 2, h - 4);
    ctx.lineTo(w / 2 - 16, bh);
    ctx.lineTo(r, bh);
    ctx.quadraticCurveTo(3, bh, 3, bh - r);
    ctx.lineTo(3, r);
    ctx.quadraticCurveTo(3, 3, r, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#12324a";
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, bh / 2 + 3, w - 40);
    const tex = new THREE.CanvasTexture(c);
    bubbleCache[text] = { tex, w, h };
    return bubbleCache[text];
  }
  // A sprite whose text can be swapped; hidden when empty.
  function buildBubble() {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    sp.renderOrder = 10;
    sp.visible = false;
    sp.userData.setText = (text) => {
      if (!text) {
        sp.visible = false;
        return;
      }
      const b = bubbleTexture(text);
      sp.material.map = b.tex;
      sp.material.needsUpdate = true;
      sp.scale.set(b.w / 75, b.h / 75, 1);
      sp.visible = true;
    };
    return sp;
  }

  // ---------------- Soccer (mejenga) ----------------
  function buildBall() {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#111111";
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc((i * 29) % 128, 12 + ((i * 37) % 44), 7, 0, Math.PI * 2);
      ctx.fill();
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.5 }));
    ball.castShadow = true;
    return ball;
  }

  // Small goal; the mouth opens toward +x.
  function buildGoal(width, height) {
    const g = new THREE.Group();
    const white = std(0xffffff, { roughness: 0.5 });
    g.add(rod(V3(0, 0, -width / 2), V3(0, height, -width / 2), 0.1, white));
    g.add(rod(V3(0, 0, width / 2), V3(0, height, width / 2), 0.1, white));
    g.add(rod(V3(0, height, -width / 2), V3(0, height, width / 2), 0.1, white));
    g.add(rod(V3(-1.2, 0, -width / 2), V3(0, height, -width / 2), 0.05, white));
    g.add(rod(V3(-1.2, 0, width / 2), V3(0, height, width / 2), 0.05, white));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.hypot(1.2, height)), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 }));
    net.rotation.set(0, Math.PI / 2, 0);
    net.rotateX(-Math.atan2(1.2, height));
    net.position.set(-0.6, height / 2, 0);
    g.add(net);
    shadowed(g);
    return g;
  }

  // ---------------- Buildings & props ----------------
  // Caribbean wooden house on stilts with a veranda and tin roof.
  function buildHouse(o) {
    o = Object.assign({ w: 8, d: 7, h: 4, wall: 0xf2c94c, roof: 0xc8302c, trim: 0xffffff }, o);
    const g = new THREE.Group();
    const wall = std(o.wall, { roughness: 0.85 });
    const trim = std(o.trim, { roughness: 0.7 });
    const roofMat = std(o.roof, { roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const wood = std(0x7a5534, { roughness: 1 });
    const lift = 1.1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, lift, 0.4), wood);
      post.position.set(sx * (o.w / 2 - 0.3), lift / 2, sz * (o.d / 2 + 0.9));
      g.add(post);
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.4, 0.3, o.d + 2.2), wood);
    floor.position.set(0, lift, 0.9);
    g.add(floor);
    const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), wall);
    body.position.y = lift + o.h / 2;
    g.add(body);
    // door + windows on the front (+z) face
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), std(0x5a3a22));
    door.position.set(0, lift + 1.1, o.d / 2 + 0.05);
    g.add(door);
    const winMat = std(0x243a4a, { roughness: 0.2, metalness: 0.4 });
    [-1, 1].forEach((s) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.1), winMat);
      win.position.set(s * o.w * 0.3, lift + o.h * 0.55, o.d / 2 + 0.05);
      g.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.06), trim);
      frame.position.copy(win.position).add(V3(0, 0, -0.03));
      g.add(frame);
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.08), std(o.roof));
      shutter.position.copy(win.position).add(V3(s * 1.0, 0, 0.02));
      g.add(shutter);
      const side = win.clone();
      side.rotation.y = Math.PI / 2;
      side.position.set(s * (o.w / 2 + 0.05), lift + o.h * 0.55, 0);
      g.add(side);
    });
    // veranda railing
    for (let i = 0; i <= 6; i++) {
      const x = -o.w / 2 + (i / 6) * o.w;
      if (Math.abs(x) < 0.8) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), trim);
      p.position.set(x, lift + 0.6, o.d / 2 + 1.9);
      g.add(p);
    }
    [-1, 1].forEach((s) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(o.w / 2 - 0.8, 0.1, 0.12), trim);
      rail.position.set(s * (o.w / 4 + 0.4), lift + 1.05, o.d / 2 + 1.9);
      g.add(rail);
    });
    // pitched roof (triangular prism) with porch overhang
    const roofH = o.h * 0.55;
    const prism = new THREE.Shape();
    prism.moveTo(-o.w / 2 - 0.6, 0);
    prism.lineTo(o.w / 2 + 0.6, 0);
    prism.lineTo(0, roofH);
    prism.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(prism, { depth: o.d + 2.8, bevelEnabled: false });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, lift + o.h, -o.d / 2 - 0.4);
    g.add(roof);
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(prism), trim);
    gable.scale.set(0.9, 0.9, 1);
    gable.position.set(0, lift + o.h + 0.05, o.d / 2 + 0.02);
    g.add(gable);
    shadowed(g);
    bake(g);
    g.userData.radius = Math.hypot(o.w, o.d) / 2;
    return g;
  }

  function buildPalm(seed, hash) {
    const palm = new THREE.Group();
    const h = 8 + hash(seed, 1) * 5;
    const lean = (hash(seed, 2) - 0.5) * 0.5;
    const trunkMat = std(0x8a6239, { roughness: 1 });
    const leafMat = std(0x3fae4f, { roughness: 0.9, side: THREE.DoubleSide });
    const segs = 5;
    let prev = V3(0, 0, 0);
    for (let i = 1; i <= segs; i++) {
      const k = i / segs;
      const p = V3(Math.sin(lean) * h * k * k, h * k, 0);
      palm.add(rod(prev, p, 0.5 - k * 0.2, trunkMat, 6));
      prev = p;
    }
    const top = prev;
    const leafGeo = new THREE.PlaneGeometry(1.4, 6, 1, 4);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i) + 3;
      lp.setZ(i, -0.12 * y * y); // droop
      lp.setX(i, lp.getX(i) * (1 - Math.abs(y - 2.5) / 3.2));
    }
    leafGeo.computeVertexNormals();
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.copy(top);
      leaf.rotation.set(-1.1, (i / 7) * Math.PI * 2 + hash(seed, i) * 0.4, 0, "YXZ");
      leaf.translateY(2.8);
      palm.add(leaf);
    }
    const coco = std(0x5a3b1c);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), coco);
      c.position.copy(top).add(V3(Math.cos(i * 2.1) * 0.4, -0.4, Math.sin(i * 2.1) * 0.4));
      palm.add(c);
    }
    palm.rotation.y = hash(seed, 3) * Math.PI * 2;
    shadowed(palm);
    return bake(palm);
  }

  function buildPine(seed, hash) {
    const g = new THREE.Group();
    const s = 0.9 + hash(seed, 3) * 0.7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 2.4 * s, 6), std(0x6a4a2c, { roughness: 1 }));
    trunk.position.y = 1.2 * s;
    g.add(trunk);
    const green = std(0x1f4f2e, { roughness: 1, flatShading: true });
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((2.6 - k * 0.6) * s, 3.4 * s, 8), green);
      cone.position.y = (2.8 + k * 1.9) * s;
      g.add(cone);
    }
    shadowed(g);
    return bake(g);
  }

  function buildRock(size, color, seed, hash) {
    const geo = new THREE.DodecahedronGeometry(size, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + hash(seed + i * 0.37, 7) * 0.4;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, std(color, { roughness: 1, flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  function buildLighthouse() {
    const lh = new THREE.Group();
    const white = std(0xffffff, { roughness: 0.6 });
    const red = std(0xc8302c, { roughness: 0.6 });
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.6 - k * 0.16, 1.76 - k * 0.16, 3.2, 12), k % 2 ? red : white);
      seg.position.y = 1.6 + k * 3.2;
      lh.add(seg);
    }
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.25, 12), std(0x333333));
    balcony.position.y = 16.1;
    lh.add(balcony);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 10), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
    lamp.position.y = 17;
    lh.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 10), red);
    cap.position.y = 18.3;
    lh.add(cap);
    shadowed(lh);
    return bake(lh);
  }

  function buildChest() {
    const g = new THREE.Group();
    const wood = std(0x8a5a2a, { roughness: 0.7 });
    const gold = std(0xffd76b, { roughness: 0.3, metalness: 0.7, emissive: 0x6a4a00, emissiveIntensity: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4), wood);
    base.position.y = 0.6;
    g.add(base);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 10, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 1.2;
    g.add(lid);
    [-0.8, 0.8].forEach((x) => {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.95, 1.48), gold);
      band.position.set(x, 0.95, 0);
      g.add(band);
    });
    shadowed(g);
    return g;
  }

  // Market stall with striped awning and fish crates.
  function buildStall() {
    const g = new THREE.Group();
    const wood = std(0x8a5f3a, { roughness: 1 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 2), wood);
    counter.position.y = 0.65;
    g.add(counter);
    [[-3.8, -0.9], [3.8, -0.9], [-3.8, 0.9], [3.8, 0.9]].forEach(([x, z]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25), wood);
      p.position.set(x, 2, z);
      g.add(p);
    });
    for (let i = 0; i < 8; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 3.2), std(i % 2 ? 0xffffff : 0x2f8fd8, { roughness: 0.9 }));
      stripe.position.set(-3.7 + i * 1.05, 4.1, 0.3);
      stripe.rotation.x = 0.25;
      g.add(stripe);
    }
    const ice = std(0xdff6ff, { roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 1.4), ice);
      crate.position.set(-2.5 + i * 2.5, 1.5, 0.1);
      g.add(crate);
      for (let k = 0; k < 3; k++) {
        const f = buildFish([0x9fb8c8, 0xe0564a, 0x4fcf6a][(i + k) % 3], 0.5);
        f.position.set(-2.5 + i * 2.5 + (k - 1) * 0.5, 1.8, 0.1);
        f.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        g.add(f);
      }
    }
    shadowed(g);
    return bake(g);
  }

  function buildMissionBoard() {
    const g = new THREE.Group();
    const wood = std(0x6b4a2c, { roughness: 1 });
    [-1.6, 1.6].forEach((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), wood);
      p.position.set(x, 1.8, 0);
      g.add(p);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.2), std(0x9a7048, { roughness: 1 }));
    board.position.y = 2.5;
    g.add(board);
    const noteColors = [0xfff6d8, 0xffe0a0, 0xd8f0ff, 0xffd0d0];
    for (let i = 0; i < 5; i++) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8), std(noteColors[i % 4], { side: THREE.DoubleSide }));
      n.position.set(-1.2 + (i % 3) * 1.1, 2.9 - Math.floor(i / 3) * 0.95, 0.12);
      n.rotation.z = (i - 2) * 0.08;
      g.add(n);
    }
    shadowed(g);
    return bake(g);
  }

  // Wooden pier: planks, posts and rope rails. Lies along -z..+z from the origin.
  function buildPier(length, width, deckY) {
    const g = new THREE.Group();
    const wood = std(0x9a6d42, { roughness: 1 });
    const dark = std(0x5b3f25, { roughness: 1 });
    const planks = Math.floor(length / 1.2);
    for (let i = 0; i < planks; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(width, 0.25, 1.05), i % 3 === 0 ? dark : wood);
      p.position.set(0, deckY, i * 1.2 + 0.6);
      g.add(p);
    }
    for (let i = 0; i <= length; i += 6) {
      [-1, 1].forEach((s) => {
        const postH = deckY + 5;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, postH, 7), dark);
        post.position.set(s * (width / 2 + 0.1), deckY + 1 - postH / 2, i);
        g.add(post);
        const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), dark);
        bollard.position.set(s * (width / 2 + 0.1), deckY + 1.6, i);
        g.add(bollard);
      });
    }
    shadowed(g);
    return bake(g);
  }

  // Seagull: two flapping wings; call flapGull each frame.
  function buildGull() {
    const g = new THREE.Group();
    const white = std(0xf6f6f6, { roughness: 0.8, side: THREE.DoubleSide });
    const grey = std(0x9aa3ad, { roughness: 0.8, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), white);
    body.scale.set(0.7, 0.7, 1.6);
    g.add(body);
    const wingGeo = triShape([[0, 0.4], [2.2, 0], [0, -0.4]]);
    wingGeo.rotateX(-Math.PI / 2);
    const wl = new THREE.Group();
    wl.add(new THREE.Mesh(wingGeo, grey));
    const wr = new THREE.Group();
    const wrm = new THREE.Mesh(wingGeo, grey);
    wrm.scale.x = -1;
    wr.add(wrm);
    g.add(wl, wr);
    g.userData = { wl, wr };
    return g;
  }
  function flapGull(g, t) {
    const a = Math.sin(t * 7) * 0.5;
    g.userData.wl.rotation.z = a;
    g.userData.wr.rotation.z = -a;
  }

  // ---------------- Deep sea: glow, noise ----------------
  let glowTex = null;
  function glowSprite(color, size) {
    if (!glowTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.3, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 64);
      glowTex = new THREE.CanvasTexture(c);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.scale.set(size, size, 1);
    return sp;
  }

  // 3D value noise in [0, 1]
  function hash3(x, y, z) {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
    return l(
      l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
      l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
      w
    );
  }

  // ---------------- Cavern ----------------
  // Inside of a lumpy ellipsoid (walls only bulge outward so the swimmable
  // space stays predictable), hung with stalactites and grown with
  // stalagmites and glowing crystals. Returns { group, crystalMat }.
  const CAVERN = { cy: -44, rx: 150, ry: 48, rz: 150 };
  function cavernSurface(dir) {
    const n = noise3(dir.x * 2.2 + 3, dir.y * 2.2, dir.z * 2.2) * 0.7 + noise3(dir.x * 6, dir.y * 6 + 7, dir.z * 6) * 0.3;
    const k = 1 + 0.16 * n;
    return V3(dir.x * CAVERN.rx * k, CAVERN.cy + dir.y * CAVERN.ry * k * (dir.y < 0 ? 0.95 : 1.05), dir.z * CAVERN.rz * k);
  }

  function buildCavern() {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 64, 36);
    const p = geo.attributes.position;
    const cols = [];
    const dir = new THREE.Vector3();
    const rock = new THREE.Color(0x3a332c), wet = new THREE.Color(0x24303a), sand = new THREE.Color(0x5a5040);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      dir.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const s = cavernSurface(dir);
      p.setXYZ(i, s.x, s.y, s.z);
      const n = noise3(s.x * 0.08, s.y * 0.08, s.z * 0.08);
      c.copy(rock).lerp(wet, n);
      if (dir.y < -0.45) c.lerp(sand, Math.min(1, (-dir.y - 0.45) * 3));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const walls = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.BackSide, flatShading: true }));
    group.add(walls);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x7fe0ff, emissive: 0x7fe0ff, emissiveIntensity: 0.8, roughness: 0.2, flatShading: true });
    const coneGeo = new THREE.ConeGeometry(1, 1, 7);
    const rnd = (i, k) => hash3(i, k, 5.5);
    for (let i = 0; i < 140; i++) {
      const a = rnd(i, 1) * Math.PI * 2;
      const up = rnd(i, 2) < 0.55; // ceiling or floor
      const e = 0.15 + rnd(i, 3) * 0.75; // horizontal fraction
      dir.set(Math.cos(a) * e, (up ? 1 : -1) * Math.sqrt(1 - e * e), Math.sin(a) * e).normalize();
      const s = cavernSurface(dir);
      const h = 4 + rnd(i, 4) * (up ? 16 : 10);
      const r = 0.8 + rnd(i, 5) * 2.4;
      const m = new THREE.Mesh(coneGeo, stoneMat);
      m.scale.set(r, h, r);
      if (up) {
        m.rotation.x = Math.PI;
        m.position.set(s.x, s.y - h / 2 + 1, s.z);
      } else {
        m.position.set(s.x, s.y + h / 2 - 1, s.z);
      }
      group.add(m);
    }
    // crystal clusters near the floor
    for (let i = 0; i < 26; i++) {
      const a = rnd(i, 11) * Math.PI * 2;
      const e = 0.35 + rnd(i, 12) * 0.5;
      dir.set(Math.cos(a) * e, -Math.sqrt(1 - e * e), Math.sin(a) * e).normalize();
      const s = cavernSurface(dir);
      const cluster = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystalMat);
        const h = 2 + rnd(i, k + 20) * 3;
        cr.scale.set(0.5, h, 0.5);
        cr.position.set((rnd(i, k + 30) - 0.5) * 2, h * 0.6, (rnd(i, k + 40) - 0.5) * 2);
        cr.rotation.set((rnd(i, k + 50) - 0.5) * 0.8, 0, (rnd(i, k + 60) - 0.5) * 0.8);
        cluster.add(cr);
      }
      cluster.position.copy(s);
      group.add(cluster);
    }
    bake(group);
    return { group, crystalMat };
  }
  // Largest safe normalised radius for the swimmer inside the cavern.
  function cavernInside(pos, margin) {
    const q = Math.hypot(pos.x / CAVERN.rx, (pos.y - CAVERN.cy) / CAVERN.ry, pos.z / CAVERN.rz);
    const lim = margin || 0.86;
    if (q > lim) {
      const k = lim / q;
      pos.x *= k;
      pos.z *= k;
      pos.y = CAVERN.cy + (pos.y - CAVERN.cy) * k;
    }
  }

  // Cave mouth set into a seamount: rocky rim + dark tunnel receding along -z.
  function buildCaveMouth() {
    const g = new THREE.Group();
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1, flatShading: true });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(10, 3.4, 7, 14), rimMat);
    g.add(rim);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + (i % 3) * 1.5, 0), rimMat);
      r.position.set(Math.cos(a) * 12, Math.sin(a) * 12, 1 + (i % 2) * 2);
      g.add(r);
    }
    // the seamount's surface passes right behind the rim, so the hole is a
    // dark disc plus a short tunnel stub rather than a long carved tunnel
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(9, 8, 8, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x03050a, side: THREE.BackSide }));
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = -2;
    g.add(tunnel);
    const back = new THREE.Mesh(new THREE.CircleGeometry(9.2, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    back.position.z = -5.5;
    g.add(back);
    const glow = glowSprite(0x3f9fd0, 9);
    glow.position.z = -4;
    g.add(glow);
    return bake(g);
  }

  // ---------------- Atlantis ----------------
  const marble = () => new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.85 });
  function buildColumn(h, broken, mat) {
    const g = new THREE.Group();
    const shaftH = broken ? h * (0.35 + Math.random() * 0.4) : h;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, shaftH, 12), mat);
    shaft.position.y = shaftH / 2 + 0.6;
    g.add(shaft);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 3.2), mat);
    base.position.y = 0.6;
    g.add(base);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 3.2), mat);
      cap.position.y = shaftH + 1.1;
      g.add(cap);
    } else {
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.4, 12), mat);
      top.position.y = shaftH + 0.6;
      top.rotation.z = 0.4;
      g.add(top);
    }
    return g;
  }

  // Ruined city on a flat seabed; local y = 0 is the ground.
  function buildAtlantis(radius) {
    const g = new THREE.Group();
    const mat = marble();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.3, metalness: 0.8, emissive: 0x6a4200, emissiveIntensity: 0.5 });
    const orich = new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1f, emissiveIntensity: 0.9, roughness: 0.3, flatShading: true });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x7fe0ff, emissive: 0x3fc8ff, emissiveIntensity: 1, roughness: 0.2, flatShading: true });
    const rnd = (i, k) => hash3(i, k, 9.1);

    // concentric ring walls (the legendary rings of Atlantis), broken in places
    [radius * 0.92, radius * 0.6].forEach((R, ring) => {
      const segs = 36;
      for (let i = 0; i < segs; i++) {
        if (rnd(i, ring) < 0.28) continue;
        const a = (i / segs) * Math.PI * 2;
        const h = 6 + rnd(i, ring + 5) * 8;
        const w = new THREE.Mesh(new THREE.BoxGeometry((2 * Math.PI * R) / segs - 1, h, 3), mat);
        w.position.set(Math.cos(a) * R, h / 2, Math.sin(a) * R);
        w.rotation.y = -a + Math.PI / 2;
        w.rotation.z = (rnd(i, ring + 9) - 0.5) * 0.15;
        g.add(w);
      }
    });
    // colonnade on the inner ring + a few fallen columns
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const R = radius * 0.42;
      const broken = rnd(i, 20) < 0.4;
      if (rnd(i, 21) < 0.15) {
        const fallen = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 14, 12), mat);
        fallen.rotation.set(Math.PI / 2, 0, a + rnd(i, 22));
        fallen.position.set(Math.cos(a) * R, 1.1, Math.sin(a) * R);
        g.add(fallen);
        continue;
      }
      const col = buildColumn(16, broken, mat);
      col.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      g.add(col);
    }
    // stepped temple in the centre with a statue of Poseidon
    const temple = new THREE.Group();
    [[40, 3], [32, 3], [24, 3]].forEach(([w, h], k) => {
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      step.position.y = h / 2 + k * 3;
      temple.add(step);
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const col = buildColumn(12, i % 5 === 2, mat);
      col.position.set(Math.cos(a) * 10, 9, Math.sin(a) * 10);
      temple.add(col);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 10, 0, Math.PI * 1.4, 0, Math.PI / 2), mat);
    dome.position.y = 23;
    dome.rotation.z = 0.12;
    temple.add(dome);
    const statue = buildPerson({ beard: 0xcfc6b0, hair: "long" });
    statue.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
    statue.scale.setScalar(4);
    statue.position.set(0, 9, 0);
    statue.userData.shR.rotation.set(-0.3, 0, 0.5);
    temple.add(statue);
    const trident = new THREE.Group();
    trident.add(rod(V3(0, 0, 0), V3(0, 16, 0), 0.25, gold));
    [-1.3, 0, 1.3].forEach((x) => trident.add(rod(V3(x, 15, 0), V3(x, 19, 0), 0.2, gold)));
    trident.add(rod(V3(-1.3, 15, 0), V3(1.3, 15, 0), 0.2, gold));
    trident.position.set(5, 9, -1);
    temple.add(trident);
    g.add(temple);

    // arches at the four gates
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arch = new THREE.Group();
      const l = buildColumn(14, false, mat);
      l.position.x = -6;
      const r = buildColumn(14, false, mat);
      r.position.x = 6;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(16, 2.4, 3.4), mat);
      lintel.position.y = 16.5;
      arch.add(l, r, lintel);
      arch.position.set(Math.cos(a) * radius * 0.6, 0, Math.sin(a) * radius * 0.6);
      arch.rotation.y = -a + Math.PI / 2;
      g.add(arch);
    }
    // glowing orichalcum and crystal outcrops
    for (let i = 0; i < 30; i++) {
      const a = rnd(i, 40) * Math.PI * 2;
      const d = radius * (0.2 + rnd(i, 41) * 0.75);
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), i % 2 ? orich : cyan);
      const h = 2 + rnd(i, 42) * 4;
      cr.scale.set(0.8, h, 0.8);
      cr.position.set(Math.cos(a) * d, h * 0.5, Math.sin(a) * d);
      cr.rotation.z = (rnd(i, 43) - 0.5) * 0.6;
      g.add(cr);
    }
    bake(g);
    const light = new THREE.PointLight(0x9fe8ff, 2.6, radius * 3, 1);
    light.position.y = 40;
    g.add(light);
    return g;
  }

  // Mythic treasure on a pedestal, floating and glowing.
  function buildMythic(id, color) {
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 3, 12), marble());
    ped.position.y = 1.5;
    g.add(ped);
    const item = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.7 });
    if (id === "tridente") {
      item.add(rod(V3(0, -2.5, 0), V3(0, 2, 0), 0.14, m));
      [-0.7, 0, 0.7].forEach((x) => item.add(rod(V3(x, 1.6, 0), V3(x, 3.2, 0), 0.12, m)));
      item.add(rod(V3(-0.7, 1.6, 0), V3(0.7, 1.6, 0), 0.12, m));
    } else if (id === "corona") {
      item.add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.25, 8, 20).rotateX(Math.PI / 2), m));
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), m);
        const a = (i / 8) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 1.2, 0.5, Math.sin(a) * 1.2);
        item.add(sp);
      }
    } else if (id === "perla") {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8c9b0, roughness: 0.6, side: THREE.DoubleSide }));
      shell.position.y = 0.4;
      item.add(shell);
      item.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 16), m));
    } else if (id === "cristal") {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), m);
      c.scale.set(1, 2, 1);
      item.add(c);
    } else {
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 24), m);
      shield.rotation.x = Math.PI / 2;
      item.add(shield);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), m);
      boss.position.z = -0.25;
      item.add(boss);
    }
    item.position.y = 6;
    g.add(item);
    const glow = glowSprite(color, 10);
    glow.position.y = 6;
    g.add(glow);
    g.userData.item = item;
    return g;
  }

  return {
    buildBoat,
    buildPirateShip,
    buildFish,
    swimFish,
    buildWhale,
    swimWhale,
    buildShark,
    buildHarpoonSpear,
    buildHarpoonGun,
    buildKraken,
    buildPerson,
    animatePerson,
    buildHouse,
    buildPalm,
    buildPine,
    buildRock,
    buildLighthouse,
    buildChest,
    buildStall,
    buildMissionBoard,
    buildPier,
    buildGull,
    flapGull,
    buildBubble,
    bake,
    buildBall,
    buildGoal,
    glowSprite,
    noise3,
    buildCavern,
    cavernInside,
    buildCaveMouth,
    buildAtlantis,
    buildMythic,
    sign,
    label,
    rod,
    std,
    shadowed,
  };
})();
