// Modelos 3D glTF (.glb) de la carpeta models/. Los modelos hechos en código
// siguen siendo el respaldo: attach() los muestra mientras el .glb carga (o si
// falla) y los cambia por el modelo cargado en cuanto está listo.
// Créditos y licencias de cada modelo: models/CREDITOS.md.
const ZMGltf = (function () {
  // Cada modelo se normaliza a la convención de models.js: nariz/proa hacia +x,
  // centrado, `length` unidades de largo. yaw/pitch corrigen la orientación del
  // archivo original; tint pinta materiales por nombre con el color de la especie.
  const DEFS = {
    fish: { url: "models/fish.glb", yaw: Math.PI / 2, length: 2, clip: "Swim", tint: { Top: 1, Fins: 0.8 } },
    tuna: { url: "models/tuna.glb", yaw: Math.PI / 2, length: 2.2, clip: "Swimming_Normal", tint: { Tuna_Top: 0.6, Tuna_Main: 1 } },
    swordfish: { url: "models/swordfish.glb", yaw: Math.PI / 2, length: 2.8, clip: "Swimming_Normal", tint: { Swordfish_Main: 1 } },
    manta: { url: "models/manta.glb", yaw: Math.PI / 2, length: 2, clip: "Swim", tint: { Top: 1 } },
    shark: { url: "models/shark.glb", yaw: Math.PI, length: 2.6, clip: "" },
    whale: { url: "models/blue-whale.glb", yaw: Math.PI / 2, length: 2, clip: "" },
    jetski: { url: "models/jetski.glb", yaw: Math.PI / 2, length: 1 },
    speedboat: { url: "models/speedboat.glb", yaw: Math.PI / 2, length: 1 },
    // Quaternius Ships: la carabela de los piratas y los naufragios
    caravel: { url: "models/caravel.glb", yaw: Math.PI / 2, length: 1 },
    // Kenney Watercraft Kit: barcos amarrados en Puerto Limón
    kFishing: { url: "models/kenney/boat-fishing-small.glb", yaw: Math.PI / 2, length: 12 },
    kSail: { url: "models/kenney/boat-sail-a.glb", yaw: Math.PI / 2, length: 11 },
    kTug: { url: "models/kenney/boat-tug-a.glb", yaw: Math.PI / 2, length: 14 },
    kRow: { url: "models/kenney/boat-row-small.glb", yaw: Math.PI / 2, length: 5 },
    kBuoy: { url: "models/kenney/buoy.glb", yaw: 0, length: 2.2 },
  };

  const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
  const cache = {};

  // Caja que tiene en cuenta los huesos: en los modelos animados la malla viene
  // diminuta y el esqueleto la escala, así que Box3.setFromObject no sirve.
  // Atributos cuantizados (enteros normalizados): three r128 no los convierte
  // al leerlos (ni en boneTransform), solo en el shader.
  function normOf(attr) {
    const a = attr.array;
    if (!attr.normalized) return 1;
    return a instanceof Int16Array ? 32767 : a instanceof Uint16Array ? 65535 : a instanceof Int8Array ? 127 : a instanceof Uint8Array ? 255 : 1;
  }
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _acc = new THREE.Vector3(), _t = new THREE.Vector3();
  function measure(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      const pn = normOf(pos);
      const step = Math.max(1, Math.floor(pos.count / 2000));
      const skin = o.isSkinnedMesh ? { idx: geo.attributes.skinIndex, w: geo.attributes.skinWeight, wn: normOf(geo.attributes.skinWeight), sk: o.skeleton } : null;
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).divideScalar(pn);
        if (skin) {
          _p.copy(v).applyMatrix4(o.bindMatrix);
          _acc.set(0, 0, 0);
          for (let k = 0; k < 4; k++) {
            const w = skin.w.getComponent ? skin.w.getComponent(i, k) / skin.wn : [skin.w.getX(i), skin.w.getY(i), skin.w.getZ(i), skin.w.getW(i)][k] / skin.wn;
            if (!w) continue;
            const j = [skin.idx.getX(i), skin.idx.getY(i), skin.idx.getZ(i), skin.idx.getW(i)][k];
            _m.multiplyMatrices(skin.sk.bones[j].matrixWorld, skin.sk.boneInverses[j]);
            _acc.addScaledVector(_t.copy(_p).applyMatrix4(_m), w);
          }
          // los huesos ya están en coordenadas de mundo
          box.expandByPoint(_acc);
        } else {
          box.expandByPoint(v.applyMatrix4(o.matrixWorld));
        }
      }
    });
    return box;
  }

  // El juego pinta en espacio lineal (sin outputEncoding sRGB); los glTF traen
  // texturas sRGB, así que se leen tal cual para que no queden oscuros.
  function fixMaterial(m) {
    if (m.map) {
      m.map.encoding = THREE.LinearEncoding;
      m.map.needsUpdate = true;
    }
    if (m.emissiveMap) m.emissiveMap.encoding = THREE.LinearEncoding;
    if (!m.map) m.color.convertLinearToSRGB();
    m.needsUpdate = true;
  }

  function load(key) {
    if (cache[key]) return cache[key].promise;
    const def = DEFS[key];
    const entry = (cache[key] = { ready: false, failed: false });
    entry.promise = new Promise((resolve) => {
      if (!loader || !def) {
        entry.failed = true;
        return resolve(null);
      }
      loader.load(
        def.url,
        (gltf) => {
          const scene = gltf.scene;
          // un material puede estar en varias mallas: corregirlo una sola vez
          const fixed = new Set();
          scene.traverse((o) => {
            if (!o.isMesh) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
              if (!fixed.has(m)) fixMaterial(m);
              fixed.add(m);
            });
          });
          // orientar y medir en la pose inicial de la animación
          const clip = def.clip !== undefined ? gltf.animations.find((a) => a.name.endsWith(def.clip) && def.clip) || gltf.animations[0] : null;
          const holder = new THREE.Group();
          holder.rotation.set(0, def.yaw || 0, def.pitch || 0);
          holder.add(scene);
          if (clip) {
            const mx = new THREE.AnimationMixer(scene);
            mx.clipAction(clip).play();
            mx.update(0);
          }
          const box = measure(holder);
          // esfera de recorte real (la de la malla sin huesos no sirve): la caja
          // medida llevada al espacio de cada malla, con margen para el nado
          holder.updateMatrixWorld(true);
          scene.traverse((o) => {
            if (!o.isMesh) return;
            const local = box.clone().applyMatrix4(o.matrixWorld.clone().invert());
            o.geometry.boundingSphere = local.getBoundingSphere(new THREE.Sphere());
            o.geometry.boundingSphere.radius *= 1.3;
          });
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          entry.template = holder;
          entry.clip = clip;
          entry.size = size;
          entry.center = center;
          entry.ready = true;
          resolve(entry);
        },
        undefined,
        () => {
          entry.failed = true;
          resolve(null);
        }
      );
    });
    return entry.promise;
  }

  // Copia lista para la escena: nariz hacia +x, largo `def.length`, centrada.
  // opts.color pinta los materiales de def.tint.
  function instance(key, opts) {
    const entry = cache[key];
    if (!entry || !entry.ready) return null;
    const def = DEFS[key];
    opts = opts || {};
    const root = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(entry.template) : entry.template.clone();
    const k = (opts.length || def.length) / entry.size.x;
    const outer = new THREE.Group();
    root.position.copy(entry.center).multiplyScalar(-1);
    outer.add(root);
    outer.scale.setScalar(k);
    const tintColor = opts.color !== undefined && def.tint ? new THREE.Color(opts.color) : null;
    // materiales propios de cada copia: el juego cambia color y brillo por pez
    let main = null;
    const seen = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map((m) => {
        if (seen.has(m)) return seen.get(m);
        const nm = m.clone();
        const f = def.tint ? def.tint[m.name] : undefined;
        if (tintColor && f !== undefined) nm.color.copy(tintColor).multiplyScalar(f);
        if (!main && (f === 1 || (!def.tint && nm.map))) main = nm;
        seen.set(m, nm);
        return nm;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = !!opts.castShadow;
    });
    if (!main) main = seen.values().next().value;
    if (opts.glow && main) {
      main.emissive = new THREE.Color(opts.glow);
      main.emissiveIntensity = 0.45;
    }
    let mixer = null;
    if (entry.clip) {
      mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(entry.clip);
      action.play();
      action.time = Math.random() * entry.clip.duration;
    }
    outer.userData.mixer = mixer;
    outer.userData.mainMaterial = main;
    outer.userData.size = entry.size.clone().multiplyScalar(k);
    return outer;
  }

  // Cambia el contenido de `host` (un modelo de models.js) por el glTF `key`
  // cuando esté cargado. `hide` son los hijos a ocultar (por defecto todos los
  // que había). Devuelve el host para encadenar.
  function attach(host, key, opts, hide) {
    const swap = () => {
      if (host.userData.gltf) return;
      const inst = instance(key, opts);
      if (!inst) return;
      (hide || host.children.slice()).forEach((c) => (c.visible = false));
      // el host suele venir escalado (fish scale); el glTF se mide en unidades del host
      host.add(inst);
      host.userData.gltf = inst;
      // el juego sigue usando userData.mainMaterial: pasa al material del glTF
      // con el color (si se pinta) y el brillo que ya tenía el modelo en código
      const oldMain = host.userData.mainMaterial, nm = inst.userData.mainMaterial;
      if (oldMain && nm) {
        if (DEFS[key].tint) nm.color.copy(oldMain.color);
        if (oldMain.emissive) {
          nm.emissive.copy(oldMain.emissive);
          nm.emissiveIntensity = oldMain.emissiveIntensity;
        }
      }
      if (nm) host.userData.mainMaterial = nm;
      if (opts && opts.onSwap) opts.onSwap(inst);
    };
    const entry = cache[key];
    if (entry && entry.ready) swap();
    else load(key).then((e) => e && swap());
    return host;
  }

  // Avanza la animación del glTF de `host` (si tiene). `rate` acelera el nado.
  function animate(host, t, rate) {
    const inst = host.userData.gltf;
    if (!inst || !inst.userData.mixer) return false;
    const u = inst.userData;
    const last = u.lastT === undefined ? t : u.lastT;
    u.lastT = t;
    u.mixer.update(Math.max(0, Math.min(0.1, t - last)) * (rate === undefined ? 1 : 0.6 + rate * 0.5));
    return true;
  }

  function preload(keys) {
    return Promise.all(keys.map(load));
  }

  // ---------------- Vegetación y rocas (Ultimate Stylized Nature, CC0) ----------------
  // Cada archivo trae varias variantes (un nodo raíz por variante). Se dibujan
  // con InstancedMesh: una llamada por pieza (tronco, hojas...) para todas las
  // plantas de una isla.
  const NATURE = {
    palm: "models/nature/palms.glb",
    pine: "models/nature/pines.glb",
    rock: "models/nature/rocks.glb",
    bush: "models/nature/bushes.glb",
    seaplant: "models/nature/seaplants.glb",
  };
  const natureCache = {};
  function loadNature(kind) {
    if (natureCache[kind]) return natureCache[kind];
    return (natureCache[kind] = new Promise((resolve) => {
      if (!loader || !NATURE[kind]) return resolve(null);
      loader.load(
        NATURE[kind],
        (gltf) => {
          const fixed = new Set();
          gltf.scene.updateMatrixWorld(true);
          const variants = gltf.scene.children.map((node) => {
            const box = measure(node);
            const size = box.getSize(new THREE.Vector3());
            const c = box.getCenter(new THREE.Vector3());
            // base de la planta en el origen
            const base = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
            const parts = [];
            node.traverse((o) => {
              if (!o.isMesh) return;
              const m = o.material;
              if (!fixed.has(m)) {
                fixMaterial(m);
                if (/Leaves|Flowers/.test(m.name)) {
                  // hojas recortadas, sin ordenar transparencias
                  m.transparent = false;
                  m.alphaTest = 0.5;
                  m.side = THREE.DoubleSide;
                }
                fixed.add(m);
              }
              parts.push({ geometry: o.geometry, material: m, matrix: base.clone().multiply(o.matrixWorld) });
            });
            return { parts, height: size.y, width: Math.max(size.x, size.z) };
          });
          resolve(variants);
        },
        undefined,
        () => resolve(null)
      );
    }));
  }

  // Planta `kind` en `parent` (coordenadas locales). items: [{ x, y, z, rotY,
  // height y/o width, variant }]; con los dos, cabe en esa caja. opts.colors
  // multiplica el color de materiales por nombre: { Rock: [r, g, b] }.
  // Devuelve una promesa con el grupo añadido, o null si el modelo no cargó.
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function plant(parent, kind, items, opts) {
    opts = opts || {};
    return loadNature(kind).then((variants) => {
      if (!variants || !items.length) return null;
      const group = new THREE.Group();
      variants.forEach((v, vi) => {
        const mine = items.filter((it) => it.variant % variants.length === vi);
        if (!mine.length) return;
        v.parts.forEach((part) => {
          let material = part.material;
          const rgb = opts.colors && opts.colors[material.name];
          if (rgb) {
            material = material.clone();
            material.color.setRGB(rgb[0], rgb[1], rgb[2]);
          }
          // geometría propia que reusa los mismos búferes: three r128 recorta un
          // InstancedMesh con la esfera de la geometría, y aquí tiene que
          // abarcar todas las plantas de la isla
          const geo = new THREE.BufferGeometry();
          for (const name in part.geometry.attributes) geo.setAttribute(name, part.geometry.attributes[name]);
          geo.setIndex(part.geometry.index);
          const im = new THREE.InstancedMesh(geo, material, mine.length);
          const box = new THREE.Box3();
          let reach = 0;
          mine.forEach((it, i) => {
            const k = Math.min(it.height ? it.height / v.height : Infinity, it.width ? it.width / v.width : Infinity);
            _pos.set(it.x, it.y, it.z);
            _q.setFromAxisAngle(_up, it.rotY || 0);
            _scl.setScalar(k);
            _m4.compose(_pos, _q, _scl).multiply(part.matrix);
            im.setMatrixAt(i, _m4);
            box.expandByPoint(_pos);
            reach = Math.max(reach, k * Math.max(v.height, v.width));
          });
          geo.boundingSphere = box.expandByScalar(reach).getBoundingSphere(new THREE.Sphere());
          im.castShadow = true;
          im.receiveShadow = kind === "rock";
          group.add(im);
        });
      });
      parent.add(group);
      return group;
    });
  }

  // Instancias que se rearman seguido (el fondo marino alrededor del buzo):
  // `capacity` por variante. opts.material(m) adapta cada material (p. ej.
  // cáusticas), opts.colors como en plant. Uso: begin(); add(...) por cada
  // planta; commit().
  const _base = new THREE.Matrix4();
  function instancer(kind, capacity, opts) {
    opts = opts || {};
    return loadNature(kind).then((variants) => {
      if (!variants) return null;
      const group = new THREE.Group();
      const white = new THREE.Color(1, 1, 1);
      const sets = variants.map((v) => {
        const meshes = v.parts.map((part) => {
          let material = part.material.clone();
          const rgb = opts.colors && opts.colors[material.name];
          if (rgb) material.color.setRGB(rgb[0], rgb[1], rgb[2]);
          if (opts.material) material = opts.material(material) || material;
          const im = new THREE.InstancedMesh(part.geometry, material, capacity);
          im.frustumCulled = false; // se rearma alrededor del buzo
          // r128 crea el búfer de color con el `count` del momento: crearlo ya
          im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
          im.count = 0;
          group.add(im);
          return { im, matrix: part.matrix };
        });
        return { v, meshes, n: 0 };
      });
      return {
        group,
        variants: sets.length,
        begin() {
          sets.forEach((st) => (st.n = 0));
        },
        // variant: índice; height/width: tamaño deseado (con los dos, cabe en
        // esa caja); color: tinte de esta instancia (opcional)
        add(variant, x, y, z, rotY, height, width, color) {
          const st = sets[variant % sets.length];
          if (st.n >= capacity) return false;
          const k = Math.min(height ? height / st.v.height : Infinity, width ? width / st.v.width : Infinity);
          _pos.set(x, y, z);
          _q.setFromAxisAngle(_up, rotY || 0);
          _scl.setScalar(k);
          _base.compose(_pos, _q, _scl);
          st.meshes.forEach(({ im, matrix }) => {
            im.setMatrixAt(st.n, _m4.copy(_base).multiply(matrix));
            im.setColorAt(st.n, color || white);
          });
          st.n++;
          return true;
        },
        commit() {
          sets.forEach((st) => st.meshes.forEach(({ im }) => {
            im.count = st.n;
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
          }));
        },
      };
    });
  }

  return { DEFS, load, preload, instance, attach, animate, measure, plant, instancer };
})();
