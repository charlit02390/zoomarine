// Zoomarine 3D — demo jugable
// Navega un barco por los siete mares y bucea junto a boyas para explorar
// cada zona y sus cuevas submarinas en busca de 14 criaturas marinas.

(function () {
  // ---------------- World tuning ----------------
  const BUOY_RADIUS = 1100;
  const BUOY_INTERACT_RADIUS = 70;
  const ZONE_ROAM_RADIUS = 210;
  const ZONE_SURFACE_Y = -4;
  const ZONE_FLOOR_Y = -120;
  const CAVE_ENTER_RADIUS = 26;
  const CAVE_EXIT_RADIUS = 26;
  const TOTAL = TOTAL_CREATURES;
  const TOTAL_TREASURE = SEAS.length;

  // Combat tuning
  const PIRATE_COUNT = 4;
  const PIRATE_PLAY_RADIUS = 2300;
  const PIRATE_AGGRO_RADIUS = 280;
  const PIRATE_FIRE_RANGE = 180;
  const PIRATE_FIRE_COOLDOWN = 2.8;
  const PIRATE_MAX_HEALTH = 3;
  const PIRATE_RESPAWN_DELAY = 12;
  const PIRATE_SPEED = 20;
  const CANNON_MAX_ARC = Math.PI / 3.2;
  const CANNON_COOLDOWN = 0.55;
  const CANNONBALL_SPEED = 130;
  const PIRATE_BALL_SPEED = 85;
  const GRAVITY = 70;
  const BOAT_MAX_HEALTH = 100;
  const BOAT_HIT_DAMAGE = 22;
  const BOAT_INVULN_TIME = 2.2;

  // Boat speed: after sailing forward non-stop for CRUISE_DELAY seconds the
  // boat shifts into cruise mode and its top speed rises.
  const BOAT_MAX_SPEED = 58;
  const BOAT_CRUISE_SPEED = 96;
  const CRUISE_DELAY = 10;

  // Islands
  const ISLANDS_PER_SEA = 3;
  const MAX_ISLANDS = 24;
  const BOAT_COLLIDE_RADIUS = 8;

  const AUTOSAVE_INTERVAL = 15;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  const buoys = SEAS.map((sea, i) => {
    const angle = -Math.PI / 2 + (i / SEAS.length) * Math.PI * 2;
    return {
      sea,
      index: i,
      x: Math.cos(angle) * BUOY_RADIUS,
      z: Math.sin(angle) * BUOY_RADIUS,
    };
  });

  function hexColor(str) {
    return new THREE.Color(str);
  }

  function hash(i, n) {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---------------- Renderer / cameras ----------------
  const viewport = document.getElementById("viewport");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  viewport.appendChild(renderer.domElement);

  const BASE_FOV = 65;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.rotation.order = "YXZ";

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------- Main scene (ocean + boat + dive zones) ----------------
  const mainScene = new THREE.Scene();
  const daySky = hexColor("#bfe9ff");
  mainScene.background = daySky.clone();
  const SURFACE_FOG_FAR = 2800;
  mainScene.fog = new THREE.Fog(daySky.getHex(), 200, SURFACE_FOG_FAR);

  const hemiLight = new THREE.HemisphereLight(0xbfe9ff, 0x1c3a52, 1.0);
  mainScene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
  sunLight.position.set(300, 500, 200);
  mainScene.add(sunLight);

  // Ocean surface — waves are displaced on the GPU from world coordinates so the
  // mesh can follow the boat around the (now larger) map. waveHeight() below is
  // the same formula in JS, used to float the boats on the swell.
  function waveHeight(x, z, t) {
    return (
      Math.sin(x * 0.02 + t * 1.3) * 1.1 +
      Math.cos(z * 0.017 + t * 1.6) * 0.9 +
      Math.sin((x + z) * 0.045 + t * 2.1) * 0.45 +
      Math.sin((x * 0.8 - z) * 0.09 + t * 2.9) * 0.25
    );
  }

  const OCEAN_SIZE = 6000;
  const OCEAN_SEGMENTS = 240;
  const OCEAN_CELL = OCEAN_SIZE / OCEAN_SEGMENTS;
  const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshPhongMaterial({
    color: 0x1f6fa0,
    shininess: 70,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  const oceanUniforms = {
    uTime: { value: 0 },
    // xyz = island centre x, centre z, shoreline radius (r = 0 means unused slot)
    uIslands: { value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector3()) },
  };
  const WAVE_GLSL = `
    uniform float uTime;
    varying vec2 vWorldXZ;
    float waveH(vec2 p, float t) {
      return sin(p.x * 0.02 + t * 1.3) * 1.1
           + cos(p.y * 0.017 + t * 1.6) * 0.9
           + sin((p.x + p.y) * 0.045 + t * 2.1) * 0.45
           + sin((p.x * 0.8 - p.y) * 0.09 + t * 2.9) * 0.25;
    }
  `;
  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uIslands = oceanUniforms.uIslands;
    shader.vertexShader = WAVE_GLSL + shader.vertexShader
      .replace(
        "#include <beginnormal_vertex>",
        `vec2 wxz = (modelMatrix * vec4(position, 1.0)).xz;
         vWorldXZ = wxz;
         float a = wxz.x * 0.02 + uTime * 1.3;
         float b = wxz.y * 0.017 + uTime * 1.6;
         float c = (wxz.x + wxz.y) * 0.045 + uTime * 2.1;
         float d = (wxz.x * 0.8 - wxz.y) * 0.09 + uTime * 2.9;
         float dhdx = 1.1 * 0.02 * cos(a) + 0.45 * 0.045 * cos(c) + 0.25 * 0.072 * cos(d);
         float dhdz = -0.9 * 0.017 * sin(b) + 0.45 * 0.045 * cos(c) - 0.25 * 0.09 * cos(d);
         vec3 objectNormal = normalize(vec3(-dhdx, 1.0, -dhdz));`
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         transformed.y += waveH(wxz, uTime);`
      );
    shader.fragmentShader =
      WAVE_GLSL +
      `uniform vec3 uIslands[${MAX_ISLANDS}];
       float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
       float vnoise(vec2 p) {
         vec2 i = floor(p), f = fract(p);
         vec2 u = f * f * (3.0 - 2.0 * f);
         return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
                    mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
       }
      ` +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float h = waveH(vWorldXZ, uTime);
         float n = vnoise(vWorldXZ * 0.12 + vec2(uTime * 0.25, -uTime * 0.18));
         float n2 = vnoise(vWorldXZ * 0.45 - vec2(uTime * 0.4, 0.0));
         // deeper colour in the troughs, lighter turquoise on the slopes
         diffuseColor.rgb *= 0.78 + 0.3 * smoothstep(-2.4, 2.4, h);
         // whitecaps on the wave crests, broken up by noise
         float foam = smoothstep(1.35, 2.2, h + (n - 0.5) * 0.9) * (0.45 + 0.55 * n2);
         // surf lines lapping around each island's shoreline
         for (int i = 0; i < ${MAX_ISLANDS}; i++) {
           vec3 isl = uIslands[i];
           if (isl.z <= 0.0) continue;
           float dist = length(vWorldXZ - isl.xy) - isl.z;
           if (dist < 0.0 || dist > 26.0) continue;
           float bands = 0.5 + 0.5 * sin(dist * 0.55 - uTime * 2.2 + n * 3.0);
           float shore = (1.0 - smoothstep(0.0, 26.0, dist)) * (0.35 + 0.65 * bands * n2);
           foam = max(foam, shore + (1.0 - smoothstep(0.0, 4.0, dist)) * 0.6);
         }
         foam = clamp(foam, 0.0, 1.0);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), foam);
         diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`
      );
  };
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.frustumCulled = false; // displaced in the shader, bounding sphere is flat
  mainScene.add(ocean);

  function animateOcean(t) {
    oceanUniforms.uTime.value = t;
    // Keep the ocean under the boat, snapped to the grid so the waves don't swim.
    ocean.position.x = Math.round(boat.position.x / OCEAN_CELL) * OCEAN_CELL;
    ocean.position.z = Math.round(boat.position.z / OCEAN_CELL) * OCEAN_CELL;
  }

  // Sea floor far below, just for visual depth when looking down
  const abyss = new THREE.Mesh(
    new THREE.CircleGeometry(4200, 32),
    new THREE.MeshBasicMaterial({ color: 0x01121f })
  );
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.y = -400;
  mainScene.add(abyss);

  // ---------------- Boat ----------------
  const boat = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.8 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 16), hullMat);
  hull.position.y = 0;
  boat.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6, 4), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.2, -10.5);
  bow.scale.set(1, 0.55, 1);
  boat.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 13), deckMat);
  deck.position.set(0, 1.6, 0.5);
  boat.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), cabinMat);
  cabin.position.set(0, 3, 2);
  boat.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6), hullMat);
  mast.position.set(0, 5.6, -3);
  boat.add(mast);

  // Cannon pivot: rotates horizontally around Y to aim, independent of hull rotation
  const cannonMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.4 });
  const cannonPivot = new THREE.Group();
  cannonPivot.position.set(0, 2, -2);
  const cannonBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.4, 10), cannonMat);
  cannonBarrel.rotation.x = Math.PI / 2;
  cannonBarrel.position.set(0, 0, -2.2);
  cannonPivot.add(cannonBarrel);
  const cannonBase = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 10), cannonMat);
  cannonPivot.add(cannonBase);
  boat.add(cannonPivot);

  boat.position.set(0, 0, 0);
  mainScene.add(boat);

  const boatState = { yaw: 0, speed: 0 };

  // ---------------- Creature builder ----------------
  function buildCreature(color, scale) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: hexColor(color), roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    body.scale.set(1.5, 0.9, 0.85);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 4), mat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-1.9, 0, 0);
    g.add(tail);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), eyeMat);
    eye.position.set(1.1, 0.25, 0.55);
    g.add(eye);
    g.scale.setScalar(scale || 3);
    g.userData.bobSeed = Math.random() * 10;
    g.userData.mainMaterial = mat;
    return g;
  }

  // ---------------- Build the 7 dive zones ----------------
  const zones = buoys.map((b) => {
    const sea = b.sea;
    const group = new THREE.Group();
    group.position.set(b.x, 0, b.z);
    mainScene.add(group);

    // buoy marker
    const buoyMat = new THREE.MeshStandardMaterial({ color: hexColor(sea.accent), emissive: hexColor(sea.accent), emissiveIntensity: 0.3 });
    const buoyMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 10), buoyMat);
    buoyMesh.position.set(0, 1.2, 0);
    group.add(buoyMesh);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    flagPole.position.set(0, 3.5, 0);
    group.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: hexColor(sea.accent), side: THREE.DoubleSide }));
    flag.position.set(0.8, 4.7, 0);
    group.add(flag);

    // seabed disc
    const floorMat = new THREE.MeshStandardMaterial({ color: hexColor(sea.floor), roughness: 1 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ZONE_ROAM_RADIUS + 20, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = ZONE_FLOOR_Y;
    group.add(floor);

    // decorative rocks / coral
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const rx = (hash(b.index, i) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 20);
      const rz = (hash(b.index, i + 50) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 20);
      const s = 3 + hash(b.index, i + 90) * 5;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      rock.position.set(rx, ZONE_FLOOR_Y + s * 0.4, rz);
      rock.rotation.set(hash(b.index, i + 5), hash(b.index, i + 15), 0);
      group.add(rock);
    }
    const coralMat = new THREE.MeshStandardMaterial({ color: hexColor(sea.accent), roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const rx = (hash(b.index, i + 200) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 30);
      const rz = (hash(b.index, i + 240) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 30);
      const coral = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5 + hash(b.index, i) * 4, 6), coralMat);
      coral.position.set(rx, ZONE_FLOOR_Y + 3, rz);
      group.add(coral);
    }

    // creature
    const creatureLocalPos = new THREE.Vector3(60, -70, 30);
    const creatureMesh = buildCreature(sea.creature.color, 3.2);
    creatureMesh.position.copy(creatureLocalPos);
    group.add(creatureMesh);

    // cave entrance (dark arch)
    const entranceLocal = new THREE.Vector3(-90, -100, -50);
    const archGroup = new THREE.Group();
    archGroup.position.copy(entranceLocal);
    const archMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 1 });
    const archTop = new THREE.Mesh(new THREE.TorusGeometry(9, 2.4, 8, 16, Math.PI), archMat);
    archTop.rotation.z = Math.PI;
    archTop.position.y = 0;
    archGroup.add(archTop);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 12, 8), archMat);
    legL.position.set(-9, -6, 0);
    archGroup.add(legL);
    const legR = legL.clone();
    legR.position.x = 9;
    archGroup.add(legR);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(7, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.position.set(0, 0, 0.5);
    archGroup.add(hole);
    group.add(archGroup);

    return {
      sea,
      buoy: b,
      group,
      creatureMesh,
      creatureWorld: new THREE.Vector3(b.x + creatureLocalPos.x, creatureLocalPos.y, b.z + creatureLocalPos.z),
      entranceWorld: new THREE.Vector3(b.x + entranceLocal.x, entranceLocal.y, b.z + entranceLocal.z),
      buoyWorld: new THREE.Vector3(b.x, 0, b.z),
    };
  });

  // ---------------- Islands (styled by each sea) ----------------
  const islandMats = {
    sand: new THREE.MeshStandardMaterial({ color: 0xe9d7a0, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x4f9a45, roughness: 1 }),
    darkGrass: new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x6c6f73, roughness: 1, flatShading: true }),
    darkRock: new THREE.MeshStandardMaterial({ color: 0x2b2624, roughness: 1, flatShading: true }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.9, flatShading: true }),
    ice: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.3, metalness: 0.1, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 1 }),
    palm: new THREE.MeshStandardMaterial({ color: 0x3fae4f, roughness: 0.9, side: THREE.DoubleSide }),
    pine: new THREE.MeshStandardMaterial({ color: 0x1f4f2e, roughness: 1 }),
    lava: new THREE.MeshBasicMaterial({ color: 0xff6a1f }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8302c, roughness: 0.6 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1a8 }),
  };

  function addPalm(g, x, z, y, seed) {
    const palm = new THREE.Group();
    const h = 9 + hash(seed, 1) * 5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, h, 6), islandMats.trunk);
    trunk.position.y = h / 2;
    trunk.rotation.z = (hash(seed, 2) - 0.5) * 0.35;
    palm.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6), islandMats.palm);
      leaf.position.set(0, h, 0);
      leaf.rotation.set(-1.0, (i / 6) * Math.PI * 2, 0, "YXZ");
      leaf.translateY(2.6);
      palm.add(leaf);
    }
    palm.position.set(x, y, z);
    g.add(palm);
  }

  function addPine(g, x, z, y, seed) {
    const s = 0.8 + hash(seed, 3) * 0.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2 * s, 5), islandMats.trunk);
    trunk.position.set(x, y + s, z);
    g.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.4 * s, 7 * s, 7), islandMats.pine);
    top.position.set(x, y + 2 * s + 3.5 * s, z);
    g.add(top);
  }

  function buildIsland(theme, radius, seed) {
    const g = new THREE.Group();
    const r = radius;
    const ring = (i, n, frac) => {
      const a = (i / n) * Math.PI * 2 + hash(seed, i + 40) * 0.6;
      const d = r * frac * (0.6 + hash(seed, i + 60) * 0.4);
      return [Math.cos(a) * d, Math.sin(a) * d];
    };

    if (theme === "hielo") {
      const shelf = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 4, 10), islandMats.ice);
      shelf.position.y = 0;
      g.add(shelf);
      const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.7, 0), islandMats.snow);
      hill.scale.set(1, 0.45, 1);
      hill.position.y = 2;
      g.add(hill);
      for (let i = 0; i < 4; i++) {
        const [x, z] = ring(i, 4, 0.5);
        const peak = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, r * (0.3 + hash(seed, i) * 0.25), 5), islandMats.snow);
        peak.position.set(x, 2 + r * 0.2, z);
        g.add(peak);
      }
    } else if (theme === "rocoso") {
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 4, 12), islandMats.rock);
      g.add(beach);
      const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.75, 1), islandMats.rock);
      hill.scale.set(1, 0.42, 1);
      hill.position.y = 2;
      g.add(hill);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), islandMats.darkGrass);
      cap.scale.set(1, 0.45, 1);
      cap.position.y = r * 0.18;
      g.add(cap);
      for (let i = 0; i < 7; i++) {
        const [x, z] = ring(i, 7, 0.45);
        addPine(g, x, z, r * 0.2, seed * 10 + i);
      }
      // lighthouse on the shore
      const lh = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - k * 0.15, 1.65 - k * 0.15, 3.5, 10), k % 2 ? islandMats.red : islandMats.white);
        seg.position.y = 1.75 + k * 3.5;
        lh.add(seg);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), islandMats.lamp);
      lamp.position.y = 15.2;
      lh.add(lamp);
      lh.position.set(r * 0.72, 2, 0);
      g.add(lh);
    } else if (theme === "volcanico") {
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 4, 12), islandMats.darkRock);
      g.add(beach);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.95, 3, 12), islandMats.grass);
      skirt.position.y = 2.5;
      g.add(skirt);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.7, r * 0.75, 12, 1, true), islandMats.darkRock);
      cone.position.y = 4 + r * 0.375;
      g.add(cone);
      const crater = new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 12), islandMats.lava);
      crater.rotation.x = -Math.PI / 2;
      crater.position.y = 4 + r * 0.72;
      g.add(crater);
      const glow = new THREE.PointLight(0xff6a1f, 1.2, r * 1.5, 2);
      glow.position.y = 4 + r * 0.85;
      g.add(glow);
      for (let i = 0; i < 5; i++) {
        const [x, z] = ring(i, 5, 0.85);
        addPalm(g, x, z, 3, seed * 10 + i);
      }
      g.userData.smokeY = 4 + r * 0.8;
    } else {
      // tropical
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, 4, 16), islandMats.sand);
      g.add(beach);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), islandMats.grass);
      hill.scale.set(1, 0.32, 1);
      hill.position.y = 2;
      g.add(hill);
      for (let i = 0; i < 8; i++) {
        const [x, z] = ring(i, 8, 0.8);
        addPalm(g, x, z, 2, seed * 10 + i);
      }
    }
    g.userData.radius = r;
    return g;
  }

  const islands = [];
  const islandSmoke = [];
  function islandPlacementOk(x, z, r) {
    if (Math.hypot(x, z) < 260 + r) return false; // keep the starting bay open
    for (const b of buoys) {
      if (Math.hypot(x - b.x, z - b.z) < ZONE_ROAM_RADIUS + 30 + r) return false; // clear of the dive zone
    }
    for (const isl of islands) {
      if (Math.hypot(x - isl.x, z - isl.z) < isl.r + r + 60) return false;
    }
    return true;
  }
  buoys.forEach((b) => {
    let placed = 0;
    for (let attempt = 0; attempt < 40 && placed < ISLANDS_PER_SEA; attempt++) {
      const ang = hash(b.index + 7, attempt) * Math.PI * 2;
      const dist = 280 + hash(b.index + 13, attempt) * 280;
      const r = 38 + hash(b.index + 21, attempt) * 50;
      const x = b.x + Math.cos(ang) * dist;
      const z = b.z + Math.sin(ang) * dist;
      if (!islandPlacementOk(x, z, r)) continue;
      const mesh = buildIsland(b.sea.island, r, b.index * 10 + placed);
      mesh.position.set(x, -1, z);
      mesh.rotation.y = hash(b.index, attempt + 99) * Math.PI * 2;
      mainScene.add(mesh);
      islands.push({ x, z, r, mesh, sea: b.sea });
      if (mesh.userData.smokeY) islandSmoke.push(mesh);
      placed++;
    }
  });
  islands.slice(0, MAX_ISLANDS).forEach((isl, i) => oceanUniforms.uIslands.value[i].set(isl.x, isl.z, isl.r));

  // Volcano smoke puffs
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x5a5a5a, transparent: true, opacity: 0.5, depthWrite: false });
  const smokePuffs = [];
  islandSmoke.forEach((isl) => {
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3, 7, 6), smokeMat.clone());
      puff.userData = { island: isl, phase: i / 6 };
      mainScene.add(puff);
      smokePuffs.push(puff);
    }
  });
  function updateSmoke(t) {
    smokePuffs.forEach((p) => {
      const isl = p.userData.island;
      const k = (t * 0.12 + p.userData.phase) % 1;
      p.position.set(isl.position.x + k * 14, isl.position.y + isl.userData.smokeY + k * 40, isl.position.z + k * 6);
      p.scale.setScalar(1 + k * 3);
      p.material.opacity = 0.5 * (1 - k);
    });
  }

  // Pushes a boat-sized object out of any island it overlaps. Returns true on contact.
  function resolveIslandCollision(pos, radius) {
    let hit = false;
    for (const isl of islands) {
      const dx = pos.x - isl.x, dz = pos.z - isl.z;
      const d = Math.hypot(dx, dz);
      const min = isl.r + radius;
      if (d < min && d > 0.001) {
        pos.x = isl.x + (dx / d) * min;
        pos.z = isl.z + (dz / d) * min;
        hit = true;
      }
    }
    return hit;
  }

  // ---------------- Boat wake foam ----------------
  const wakeGeo = new THREE.CircleGeometry(1, 12);
  wakeGeo.rotateX(-Math.PI / 2);
  const wakePool = [];
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.userData.life = 0;
    mainScene.add(m);
    wakePool.push(m);
  }
  let wakeCursor = 0;
  let wakeAccumulator = 0;
  function emitWake(x, z, size, life) {
    const m = wakePool[wakeCursor];
    wakeCursor = (wakeCursor + 1) % wakePool.length;
    m.position.set(x, 0, z);
    m.userData.life = life;
    m.userData.maxLife = life;
    m.userData.size = size;
    m.visible = true;
  }
  function updateWake(dt, t) {
    const speed = Math.abs(boatState.speed);
    if (state.mode === "boat" && speed > 4) {
      wakeAccumulator += dt * (8 + speed * 0.5);
      const back = new THREE.Vector3(Math.sin(boatState.yaw), 0, Math.cos(boatState.yaw));
      const side = new THREE.Vector3(back.z, 0, -back.x);
      while (wakeAccumulator >= 1) {
        wakeAccumulator -= 1;
        const spread = (Math.random() - 0.5) * 5;
        const sx = boat.position.x + back.x * 9 + side.x * spread;
        const sz = boat.position.z + back.z * 9 + side.z * spread;
        emitWake(sx, sz, 1.2 + speed * 0.03, 1.6 + speed * 0.02);
        // bow spray, heavier in cruise mode
        if (Math.random() < 0.35 + (state.cruising ? 0.4 : 0)) {
          const s = Math.random() < 0.5 ? 1 : -1;
          emitWake(boat.position.x - back.x * 11 + side.x * s * 3, boat.position.z - back.z * 11 + side.z * s * 3, 0.9, 0.9);
        }
      }
    }
    wakePool.forEach((m) => {
      if (!m.visible) return;
      m.userData.life -= dt;
      if (m.userData.life <= 0) {
        m.visible = false;
        return;
      }
      const k = 1 - m.userData.life / m.userData.maxLife;
      m.scale.setScalar(m.userData.size * (1 + k * 2.6));
      m.material.opacity = 0.5 * (1 - k) * (1 - k);
      m.position.y = waveHeight(m.position.x, m.position.z, t) + 0.15;
    });
  }

  // ---------------- Pirates ----------------
  function buildPirateShip() {
    const g = new THREE.Group();
    const hMat = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.85 });
    const sMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7 });
    const flagMat = new THREE.MeshBasicMaterial({ color: 0xcc2c2c, side: THREE.DoubleSide });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3, 15), hMat);
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(3.3, 5.5, 4), hMat);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.2, -10);
    bow.scale.set(1, 0.55, 1);
    g.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.6), sMat);
    cabin.position.set(0, 2.8, 2.5);
    g.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), hMat);
    mast.position.set(0, 6, -2);
    g.add(mast);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), flagMat);
    flag.position.set(1, 6.8, -2);
    g.add(flag);

    g.userData.hullMat = hMat;
    return g;
  }

  const pirates = [];
  for (let i = 0; i < PIRATE_COUNT; i++) {
    const group = buildPirateShip();
    mainScene.add(group);
    pirates.push({
      group,
      yaw: 0,
      speed: PIRATE_SPEED,
      health: PIRATE_MAX_HEALTH,
      mode: "patrol",
      wanderTarget: new THREE.Vector3(),
      fireCooldown: rand(1, 3),
      flashTimer: 0,
      sunkTimer: 0,
      respawnTimer: 0,
    });
  }

  function pickWanderTarget(p) {
    const ang = rand(0, Math.PI * 2);
    const rad = rand(200, PIRATE_PLAY_RADIUS);
    p.wanderTarget.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
  }

  function spawnPirate(p) {
    const ang = rand(0, Math.PI * 2);
    const rad = rand(500, PIRATE_PLAY_RADIUS);
    p.group.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    resolveIslandCollision(p.group.position, BOAT_COLLIDE_RADIUS + 10);
    p.yaw = rand(0, Math.PI * 2);
    p.health = PIRATE_MAX_HEALTH;
    p.mode = "patrol";
    p.fireCooldown = rand(1.5, 3.5);
    p.group.visible = true;
    p.group.scale.set(1, 1, 1);
    p.group.rotation.set(0, p.yaw, 0);
    pickWanderTarget(p);
  }
  pirates.forEach(spawnPirate);

  // ---------------- Cannonballs & splashes ----------------
  const cannonballs = [];
  const ballMatPlayer = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.6 });
  const ballMatPirate = new THREE.MeshStandardMaterial({ color: 0x2a0e0e, roughness: 0.4, metalness: 0.6 });

  function spawnCannonball(origin, dirYaw, speed, owner) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), owner === "player" ? ballMatPlayer : ballMatPirate);
    mesh.position.copy(origin);
    mainScene.add(mesh);
    const vx = -Math.sin(dirYaw) * speed;
    const vz = -Math.cos(dirYaw) * speed;
    cannonballs.push({
      mesh,
      velocity: new THREE.Vector3(vx, speed * 0.18, vz),
      life: 3.2,
      owner,
    });
  }

  const splashes = [];
  function spawnSplash(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1, 16),
      new THREE.MeshBasicMaterial({ color: 0xdfffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.2, pos.z);
    mainScene.add(ring);
    splashes.push({ mesh: ring, life: 0.4, maxLife: 0.4 });
  }

  // ---------------- Cave scene (reused pocket dimension) ----------------
  const caveScene = new THREE.Scene();
  caveScene.fog = new THREE.FogExp2(0x02040a, 0.014);
  const caveAmbient = new THREE.AmbientLight(0x2a3450, 0.9);
  caveScene.add(caveAmbient);

  // The flashlight rides on the camera, so the camera must be parented to caveScene
  // while diving in a cave (see enterCave/leaveCaveScene) or the light never renders.
  const flashlight = new THREE.SpotLight(0xdff4ff, 3.5, 200, Math.PI / 5, 0.45, 1.0);
  flashlight.position.set(0, 0, 0);
  camera.add(flashlight);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight.target);

  const caveRockMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 1 });
  const CAVE_SPAWN = new THREE.Vector3(0, -30, 30);
  const CAVE_CREATURE_POS = new THREE.Vector3(30, -45, -50);
  const CAVE_EXIT_POS = new THREE.Vector3(0, -30, 105);

  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2;
    const rad = 120 + hash(i, 1) * 15;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(10 + hash(i, 2) * 10, 0), caveRockMat);
    rock.position.set(Math.cos(ang) * rad, -20 + hash(i, 3) * 60 - 30, Math.sin(ang) * rad);
    caveScene.add(rock);
  }
  const caveFloor = new THREE.Mesh(
    new THREE.CircleGeometry(150, 24),
    new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 1 })
  );
  caveFloor.rotation.x = -Math.PI / 2;
  caveFloor.position.y = -85;
  caveScene.add(caveFloor);

  const caveCreatureMesh = buildCreature("#888888", 3.2);
  caveCreatureMesh.position.copy(CAVE_CREATURE_POS);
  // faint bioluminescence so the creature can be spotted beyond the flashlight cone
  caveCreatureMesh.userData.mainMaterial.emissiveIntensity = 0.35;
  caveScene.add(caveCreatureMesh);

  const caveExitGlowMat = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.55 });
  const caveExitGlow = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 12), caveExitGlowMat);
  caveExitGlow.position.copy(CAVE_EXIT_POS);
  caveScene.add(caveExitGlow);

  // Treasure chest — one physical prop reused for whichever zone's cave is active
  const CAVE_TREASURE_POS = new THREE.Vector3(-55, -50, -15);
  const treasureGroup = new THREE.Group();
  treasureGroup.position.copy(CAVE_TREASURE_POS);
  const chestMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.6 });
  const chestGoldMat = new THREE.MeshStandardMaterial({
    color: 0xffd76b,
    roughness: 0.35,
    metalness: 0.6,
    emissive: 0xffb347,
    emissiveIntensity: 0.35,
  });
  const chestBase = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), chestMat);
  chestBase.position.y = 2.5;
  treasureGroup.add(chestBase);
  const chestLid = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 12, 1, false, 0, Math.PI), chestMat);
  chestLid.rotation.z = Math.PI / 2;
  chestLid.rotation.y = Math.PI / 2;
  chestLid.position.set(0, 5, -1.3);
  treasureGroup.add(chestLid);
  const chestGlow = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1, 4), chestGoldMat);
  chestGlow.position.set(0, 5.1, 0.4);
  treasureGroup.add(chestGlow);
  const chestLight = new THREE.PointLight(0xffcf7a, 1.4, 40, 2);
  chestLight.position.set(0, 8, 0);
  treasureGroup.add(chestLight);
  caveScene.add(treasureGroup);

  // ---------------- Bubbles (ambiance) ----------------
  function makeBubbles(scene, count) {
    const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.35 });
    const bubbles = [];
    for (let i = 0; i < count; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 6, 6), bubbleMat);
      b.userData.speed = 4 + Math.random() * 4;
      b.userData.drift = Math.random() * Math.PI * 2;
      bubbles.push(b);
      scene.add(b);
    }
    return bubbles;
  }
  const diveBubbles = makeBubbles(mainScene, 40);
  const caveBubbles = makeBubbles(caveScene, 20);
  let bubblesInited = false;

  function resetBubble(b, center, radiusXZ, minY, maxY) {
    b.position.set(
      center.x + (Math.random() - 0.5) * 2 * radiusXZ,
      minY + Math.random() * (maxY - minY),
      center.z + (Math.random() - 0.5) * 2 * radiusXZ
    );
  }

  // ---------------- Game state ----------------
  const state = {
    mode: "boat", // 'boat' | 'dive' | 'cave'
    zoneIndex: -1,
    oxygen: 100,
    maxOxygen: 100,
    found: new Set(),
    treasureFound: new Set(),
    modalOpen: false,
    journalOpen: false,
    won: false,
    cooldown: 0,
    time: 0,
    yaw: Math.PI,
    pitch: 0,
    bannerTimeout: null,
    health: BOAT_MAX_HEALTH,
    maxHealth: BOAT_MAX_HEALTH,
    invuln: 0,
    aimYaw: 0,
    cannonCooldown: 0,
    mouseNX: 0,
    started: false, // false while the start screen is up
    cruiseTimer: 0,
    cruising: false,
    shoreBannerCooldown: 0,
    autosaveTimer: 0,
    playTime: 0,
  };

  const dockPoint = new THREE.Vector3(0, 0, 0);

  // ---------------- Input ----------------
  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (!state.started) return;
    if (e.code === "Escape" && !state.modalOpen) openStartMenu();
    if (e.code === "KeyJ") toggleJournal();
    if (e.code === "KeyF" && !e.repeat) handleDiveKey();
    if (e.code === "Space" && !e.repeat && state.mode === "boat") fireCannon();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // ---------------- Touch controls (phones / tablets) ----------------
  const touch = { up: false, down: false };

  function createJoystick(zoneEl, knobEl) {
    const axis = { dx: 0, dy: 0, active: false, id: null };
    const maxKnob = 34;

    function applyFromTouch(clientX, clientY) {
      const rect = zoneEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = rect.width / 2;
      const clampedDist = Math.min(dist, max);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      axis.dx = (clampedDist / max) * nx;
      axis.dy = (clampedDist / max) * ny;
      knobEl.style.transform = `translate(-50%, -50%) translate(${axis.dx * (max - maxKnob / 2)}px, ${axis.dy * (max - maxKnob / 2)}px)`;
    }

    function reset() {
      axis.active = false;
      axis.id = null;
      axis.dx = 0;
      axis.dy = 0;
      knobEl.style.transform = "translate(-50%, -50%)";
    }

    zoneEl.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        axis.active = true;
        axis.id = t.identifier;
        applyFromTouch(t.clientX, t.clientY);
      },
      { passive: false }
    );
    window.addEventListener(
      "touchmove",
      (e) => {
        if (!axis.active) return;
        for (const t of e.changedTouches) {
          if (t.identifier === axis.id) {
            e.preventDefault();
            applyFromTouch(t.clientX, t.clientY);
          }
        }
      },
      { passive: false }
    );
    function onTouchEnd(e) {
      if (!axis.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === axis.id) reset();
      }
    }
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return axis;
  }

  const joyMoveEl = document.getElementById("joy-move");
  const joyLookEl = document.getElementById("joy-look");
  const moveAxis = createJoystick(joyMoveEl, joyMoveEl.querySelector(".joy-knob"));
  const lookAxis = createJoystick(joyLookEl, joyLookEl.querySelector(".joy-knob"));

  function bindHoldButton(el, onChange) {
    const press = (e) => {
      e.preventDefault();
      onChange(true);
    };
    const release = (e) => {
      e.preventDefault();
      onChange(false);
    };
    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release, { passive: false });
    el.addEventListener("touchcancel", release, { passive: false });
  }

  const btnUpEl = document.getElementById("btn-up");
  const btnDownEl = document.getElementById("btn-down");
  const btnDiveEl = document.getElementById("btn-dive");
  const btnFireEl = document.getElementById("btn-fire");
  const vertButtonsEl = document.getElementById("vert-buttons");
  bindHoldButton(btnUpEl, (v) => (touch.up = v));
  bindHoldButton(btnDownEl, (v) => (touch.down = v));
  btnDiveEl.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handleDiveKey();
    },
    { passive: false }
  );
  btnFireEl.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      fireCannon();
    },
    { passive: false }
  );

  // Mouse aiming (desktop): cursor position relative to screen centre sets
  // the cannon's horizontal aim offset — no pointer lock needed.
  window.addEventListener("mousemove", (e) => {
    state.mouseNX = (e.clientX / window.innerWidth - 0.5) * 2;
  });
  viewport.addEventListener("mousedown", (e) => {
    if (e.button === 0) fireCannon();
  });

  function updateTouchUI() {
    const diving = state.mode !== "boat";
    vertButtonsEl.classList.toggle("hidden", !diving);
    btnFireEl.classList.toggle("hidden", diving);
    btnDiveEl.textContent = diving ? "⬆" : "🤿";
  }

  function handleDiveKey() {
    if (!state.started || state.modalOpen || state.journalOpen || state.won) return;
    if (state.mode === "boat") {
      let nearest = -1;
      let nearestDist = Infinity;
      zones.forEach((z, i) => {
        const d = Math.hypot(boat.position.x - z.buoyWorld.x, boat.position.z - z.buoyWorld.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = i;
        }
      });
      if (nearest >= 0 && nearestDist <= BUOY_INTERACT_RADIUS) {
        startDive(nearest);
      } else {
        showBanner("Acércate a una boya para bucear");
      }
    } else {
      returnToBoat();
    }
  }

  // ---------------- DOM refs ----------------
  const seaNameEl = document.getElementById("sea-name");
  const foundCountEl = document.getElementById("found-count");
  const totalCountEl = document.getElementById("total-count");
  const treasureFoundCountEl = document.getElementById("treasure-found-count");
  const treasureTotalCountEl = document.getElementById("treasure-total-count");
  const oxygenFill = document.getElementById("oxygen-fill");
  const healthFill = document.getElementById("health-fill");
  const hitFlashEl = document.getElementById("hit-flash");
  const zoneBanner = document.getElementById("zone-banner");
  const hintEl = document.getElementById("hint");
  const crosshairEl = document.getElementById("crosshair");
  const radar = document.getElementById("radar");
  const radarCtx = radar.getContext("2d");

  const discoveryModal = document.getElementById("discovery-modal");
  const discoveryName = document.getElementById("discovery-name");
  const discoveryFact = document.getElementById("discovery-fact");
  const discoverySwatch = document.getElementById("discovery-swatch");

  const journalModal = document.getElementById("journal-modal");
  const journalList = document.getElementById("journal-list");
  const journalBtn = document.getElementById("journal-btn");
  const journalClose = document.getElementById("journal-close");

  const puzzleModal = document.getElementById("puzzle-modal");
  const puzzleTitle = document.getElementById("puzzle-title");
  const puzzleIntro = document.getElementById("puzzle-intro");
  const puzzleBody = document.getElementById("puzzle-body");
  const puzzleHint = document.getElementById("puzzle-hint");
  const puzzleCancel = document.getElementById("puzzle-cancel");

  const winModal = document.getElementById("win-modal");
  const restartBtn = document.getElementById("restart-btn");
  const loadingEl = document.getElementById("loading");
  const cruiseRowEl = document.getElementById("cruise-row");
  const cruiseFillEl = document.getElementById("cruise-fill");
  const menuBtn = document.getElementById("menu-btn");
  const saveToastEl = document.getElementById("save-toast");
  const startScreen = document.getElementById("start-screen");
  const loginForm = document.getElementById("login-form");
  const loginName = document.getElementById("login-name");
  const loginPin = document.getElementById("login-pin");
  const loginError = document.getElementById("login-error");
  const startMenu = document.getElementById("start-menu");
  const welcomeText = document.getElementById("welcome-text");
  const saveSummary = document.getElementById("save-summary");
  const continueBtn = document.getElementById("continue-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const logoutBtn = document.getElementById("logout-btn");

  totalCountEl.textContent = TOTAL;
  treasureTotalCountEl.textContent = TOTAL_TREASURE;

  const HINTS = {
    boat: "WASD / Flechas: navegar · Ratón: apuntar el cañón · Clic: disparar · Boya + <b>F</b>: bucear · <b>J</b>: Bitácora",
    dive: "WASD: nadar · Flechas: mirar · Espacio/Shift: subir/bajar · <b>F</b>: volver al barco · <b>J</b>: Bitácora",
    cave: "Usa el sonar: 🟡 tesoro · 🔵 salida · punto que late = criatura · WASD: nadar · Flechas: mirar · <b>F</b>: volver al barco",
  };

  function updateHint() {
    hintEl.innerHTML = HINTS[state.mode];
  }

  function showBanner(text) {
    zoneBanner.textContent = text;
    zoneBanner.classList.add("show");
    clearTimeout(state.bannerTimeout);
    state.bannerTimeout = setTimeout(() => zoneBanner.classList.remove("show"), 2200);
  }

  // ---------------- Journal ----------------
  function toggleJournal(forceOpen) {
    if (state.modalOpen) return;
    const open = forceOpen !== undefined ? forceOpen : !state.journalOpen;
    state.journalOpen = open;
    journalModal.classList.toggle("hidden", !open);
    if (open) renderJournal();
  }

  function renderJournal() {
    journalList.innerHTML = "";
    SEAS.forEach((sea) => {
      [
        { c: sea.creature, place: sea.name },
        { c: sea.cave.creature, place: sea.cave.name + " · " + sea.name },
      ].forEach(({ c, place }) => {
        const found = state.found.has(c.id);
        const entry = document.createElement("div");
        entry.className = "journal-entry" + (found ? "" : " locked");
        entry.innerHTML = found
          ? `<h4 style="color:${c.color}">${c.name}</h4><p><em>${place}</em><br>${c.fact}</p>`
          : `<h4>???</h4><p><em>${place}</em><br>Aún no descubierto.</p>`;
        journalList.appendChild(entry);
      });
    });
  }

  journalBtn.addEventListener("click", () => toggleJournal());
  journalClose.addEventListener("click", () => toggleJournal(false));

  // ---------------- Discovery ----------------
  function openDiscovery(creature) {
    state.modalOpen = true;
    discoveryName.textContent = creature.name;
    discoveryFact.textContent = creature.fact;
    discoverySwatch.style.background = creature.color;
    discoveryModal.classList.remove("hidden");

    const close = () => {
      state.modalOpen = false;
      discoveryModal.classList.add("hidden");
      window.removeEventListener("keydown", close);
      discoveryModal.removeEventListener("click", close);
      checkWin();
    };
    setTimeout(() => {
      window.addEventListener("keydown", close);
      discoveryModal.addEventListener("click", close, { once: true });
    }, 150);
  }

  function checkWin() {
    if (state.found.size >= TOTAL && !state.won) {
      state.won = true;
      setTimeout(() => winModal.classList.remove("hidden"), 300);
    }
  }

  restartBtn.addEventListener("click", () => {
    winModal.classList.add("hidden");
    startNewGame();
  });

  function collect(creature) {
    if (state.found.has(creature.id)) return;
    state.found.add(creature.id);
    foundCountEl.textContent = state.found.size;
    saveGame();
    openDiscovery(creature);
  }

  // ---------------- Treasure puzzles ----------------
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function genMathPuzzle() {
    const ops = ["+", "-", "×"];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;
    if (op === "+") {
      a = Math.floor(rand(3, 24));
      b = Math.floor(rand(3, 24));
      answer = a + b;
    } else if (op === "-") {
      a = Math.floor(rand(12, 30));
      b = Math.floor(rand(1, a - 1));
      answer = a - b;
    } else {
      a = Math.floor(rand(2, 9));
      b = Math.floor(rand(2, 9));
      answer = a * b;
    }
    const choices = new Set([answer]);
    let guard = 0;
    while (choices.size < 4 && guard < 50) {
      guard++;
      const delta = Math.floor(rand(-6, 6));
      const c = answer + (delta === 0 ? 3 : delta);
      if (c >= 0) choices.add(c);
    }
    return { question: `${a} ${op} ${b} = ?`, answer, choices: shuffleArray([...choices]) };
  }

  function renderMathPuzzle(onSolved) {
    puzzleHint.textContent = "Elige la respuesta correcta";
    const p = genMathPuzzle();
    puzzleBody.innerHTML = `<div id="puzzle-question">${p.question}</div><div class="math-choices"></div>`;
    const choicesEl = puzzleBody.querySelector(".math-choices");
    p.choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "math-choice";
      btn.textContent = c;
      btn.addEventListener("click", () => {
        if (c === p.answer) {
          btn.classList.add("correct");
          setTimeout(onSolved, 350);
        } else {
          btn.classList.add("wrong");
          btn.disabled = true;
        }
      });
      choicesEl.appendChild(btn);
    });
  }

  function renderSliderPuzzle(onSolved) {
    puzzleHint.textContent = "Ordena las fichas del 1 al 8 deslizándolas hacia el hueco vacío";
    let tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    // Shuffle with legal moves only, guaranteeing a solvable board.
    for (let i = 0; i < 60; i++) {
      const blank = tiles.indexOf(0);
      const bx = blank % 3, by = Math.floor(blank / 3);
      const neighbors = [];
      if (bx > 0) neighbors.push(blank - 1);
      if (bx < 2) neighbors.push(blank + 1);
      if (by > 0) neighbors.push(blank - 3);
      if (by < 2) neighbors.push(blank + 3);
      const swapWith = neighbors[Math.floor(Math.random() * neighbors.length)];
      [tiles[blank], tiles[swapWith]] = [tiles[swapWith], tiles[blank]];
    }

    puzzleBody.innerHTML = `<div class="slider-grid"></div>`;
    const gridEl = puzzleBody.querySelector(".slider-grid");
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("button");
      cell.className = "slider-tile";
      cells.push(cell);
      gridEl.appendChild(cell);
    }

    function render() {
      tiles.forEach((v, i) => {
        cells[i].textContent = v === 0 ? "" : v;
        cells[i].classList.toggle("empty", v === 0);
      });
    }
    function isSolved() {
      return tiles.every((v, i) => v === (i === 8 ? 0 : i + 1));
    }
    cells.forEach((cell, i) => {
      cell.addEventListener("click", () => {
        const blank = tiles.indexOf(0);
        const bx = blank % 3, by = Math.floor(blank / 3);
        const ix = i % 3, iy = Math.floor(i / 3);
        const adjacent = Math.abs(bx - ix) + Math.abs(by - iy) === 1;
        if (!adjacent) return;
        [tiles[blank], tiles[i]] = [tiles[i], tiles[blank]];
        render();
        if (isSolved()) {
          cells.forEach((c) => c.classList.add("solved"));
          setTimeout(onSolved, 350);
        }
      });
    });
    render();
  }

  function openTreasure(zoneIndex) {
    if (state.treasureFound.has(zoneIndex)) return;
    state.modalOpen = true;
    puzzleTitle.textContent = "🪙 Tesoro encontrado";
    puzzleIntro.textContent = "Resuelve esto para quedarte con el tesoro:";
    puzzleModal.classList.remove("hidden");

    const onSolved = () => {
      state.treasureFound.add(zoneIndex);
      treasureFoundCountEl.textContent = state.treasureFound.size;
      state.oxygen = state.maxOxygen;
      state.health = Math.min(state.maxHealth, state.health + 30);
      puzzleModal.classList.add("hidden");
      state.modalOpen = false;
      showBanner("¡Tesoro obtenido! Oxígeno y casco reforzados");
      saveGame();
    };

    if (Math.random() < 0.5) renderMathPuzzle(onSolved);
    else renderSliderPuzzle(onSolved);
  }

  puzzleCancel.addEventListener("click", () => {
    puzzleModal.classList.add("hidden");
    state.modalOpen = false;
  });

  // ---------------- Save / load ----------------
  let profile = null;

  function saveGame(showToast) {
    if (!profile || !state.started) return;
    const ok = Profiles.writeSave(profile.key, {
      version: 1,
      found: [...state.found],
      treasureFound: [...state.treasureFound],
      health: state.health,
      boat: { x: boat.position.x, z: boat.position.z, yaw: boatState.yaw },
      playTime: state.playTime,
      savedAt: Date.now(),
    });
    if (ok && showToast) {
      saveToastEl.classList.add("show");
      clearTimeout(saveToastEl._t);
      saveToastEl._t = setTimeout(() => saveToastEl.classList.remove("show"), 1400);
    }
  }

  function resetWorld() {
    if (state.mode !== "boat") returnToBoat();
    state.found.clear();
    state.treasureFound.clear();
    state.health = state.maxHealth;
    state.oxygen = state.maxOxygen;
    state.won = false;
    state.invuln = 2;
    state.cruiseTimer = 0;
    state.cruising = false;
    state.playTime = 0;
    boat.position.set(0, 0, 0);
    boatState.yaw = 0;
    boatState.speed = 0;
    camLookInit = false;
    pirates.forEach(spawnPirate);
  }

  function applySave(data) {
    resetWorld();
    if (!data) return;
    (data.found || []).forEach((id) => state.found.add(id));
    (data.treasureFound || []).forEach((i) => state.treasureFound.add(i));
    state.health = Math.max(20, Math.min(state.maxHealth, data.health || state.maxHealth));
    state.playTime = data.playTime || 0;
    if (data.boat) {
      boat.position.set(data.boat.x || 0, 0, data.boat.z || 0);
      boatState.yaw = data.boat.yaw || 0;
      resolveIslandCollision(boat.position, BOAT_COLLIDE_RADIUS);
    }
  }

  function refreshCounters() {
    foundCountEl.textContent = state.found.size;
    treasureFoundCountEl.textContent = state.treasureFound.size;
  }

  function formatPlayTime(sec) {
    const m = Math.floor(sec / 60);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  function beginPlay() {
    state.started = true;
    startScreen.classList.add("hidden");
    refreshCounters();
    updateHint();
    updateTouchUI();
    showBanner(state.found.size ? "¡Bienvenido de vuelta, " + profile.name + "!" : "Zarpa y busca las boyas de colores");
    checkWin(); // a finished expedition goes straight to the win screen
  }

  function startNewGame() {
    Profiles.clearSave(profile.key);
    applySave(null);
    beginPlay();
    saveGame();
  }

  function showLogin() {
    startScreen.classList.remove("hidden");
    loginForm.classList.remove("hidden");
    startMenu.classList.add("hidden");
    loginError.textContent = "";
    loginPin.value = "";
    setTimeout(() => (loginName.value ? loginPin : loginName).focus(), 50);
  }

  function openStartMenu() {
    if (state.started) {
      saveGame();
      state.started = false;
    }
    if (state.mode !== "boat") returnToBoat(); // the menu backdrop is the boat on the surface
    toggleJournal(false);
    startScreen.classList.remove("hidden");
    loginForm.classList.add("hidden");
    startMenu.classList.remove("hidden");
    welcomeText.textContent = "Hola, " + profile.name + " 👋";
    const data = Profiles.loadSave(profile.key);
    if (data) {
      const date = new Date(data.savedAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
      saveSummary.innerHTML =
        `🐠 ${(data.found || []).length}/${TOTAL} criaturas · 🪙 ${(data.treasureFound || []).length}/${TOTAL_TREASURE} tesoros<br>` +
        `⏱ ${formatPlayTime(data.playTime || 0)} navegando · guardado ${date}`;
    } else {
      saveSummary.textContent = "Aún no tienes ninguna expedición guardada.";
    }
    continueBtn.disabled = !data;
    continueBtn.textContent = data ? "Continuar expedición" : "Sin partida guardada";
    newGameBtn.classList.toggle("primary", !data);
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = Profiles.login(loginName.value, loginPin.value);
    if (!res.ok) {
      loginError.textContent = res.error;
      return;
    }
    profile = { key: res.key, name: res.name };
    openStartMenu();
  });
  continueBtn.addEventListener("click", () => {
    applySave(Profiles.loadSave(profile.key));
    beginPlay();
  });
  newGameBtn.addEventListener("click", () => {
    const data = Profiles.loadSave(profile.key);
    // A second click within 3 s confirms overwriting an existing save.
    if (data && newGameBtn.dataset.confirm !== "1") {
      newGameBtn.dataset.confirm = "1";
      newGameBtn.textContent = "¿Seguro? Pulsa otra vez para borrar la partida";
      setTimeout(() => {
        newGameBtn.dataset.confirm = "";
        newGameBtn.textContent = "Nueva expedición";
      }, 3000);
      return;
    }
    newGameBtn.dataset.confirm = "";
    newGameBtn.textContent = "Nueva expedición";
    startNewGame();
  });
  logoutBtn.addEventListener("click", () => {
    Profiles.logout();
    profile = null;
    showLogin();
  });
  menuBtn.addEventListener("click", () => {
    if (state.started && !state.modalOpen) openStartMenu();
  });
  window.addEventListener("beforeunload", () => saveGame());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveGame();
  });

  // ---------------- Transitions ----------------
  function yawToward(from, to) {
    return Math.atan2(-(to.x - from.x), -(to.z - from.z));
  }

  function startDive(zoneIndex) {
    state.mode = "dive";
    state.zoneIndex = zoneIndex;
    state.cooldown = 0.6;
    const z = zones[zoneIndex];
    camera.position.set(z.buoyWorld.x, ZONE_SURFACE_Y - 4, z.buoyWorld.z);
    state.yaw = yawToward(camera.position, z.creatureWorld);
    state.pitch = -0.15;
    mainScene.fog = new THREE.FogExp2(hexColor(z.sea.floor).getHex(), 0.012);
    hemiLight.intensity = 0.55;
    flashlight.visible = false;
    seaNameEl.textContent = z.sea.name;
    showBanner(z.sea.name);
    updateHint();
    updateTouchUI();
  }

  function enterCave(zoneIndex) {
    state.mode = "cave";
    state.zoneIndex = zoneIndex;
    state.cooldown = 0.6;
    camera.position.copy(CAVE_SPAWN);
    state.yaw = yawToward(CAVE_SPAWN, CAVE_CREATURE_POS);
    state.pitch = 0;
    flashlight.visible = true;
    caveScene.add(camera);
    const z = zones[zoneIndex];
    caveCreatureMesh.userData.mainMaterial.color.set(hexColor(z.sea.cave.creature.color));
    caveCreatureMesh.userData.mainMaterial.emissive.set(hexColor(z.sea.cave.creature.color));
    caveCreatureMesh.visible = !state.found.has(z.sea.cave.creature.id);
    treasureGroup.visible = !state.treasureFound.has(zoneIndex);
    seaNameEl.textContent = z.sea.cave.name;
    showBanner(z.sea.cave.name);
    updateHint();
    updateTouchUI();
  }

  function exitCave() {
    const z = zones[state.zoneIndex];
    state.mode = "dive";
    state.cooldown = 0.6;
    camera.position.set(z.entranceWorld.x, z.entranceWorld.y, z.entranceWorld.z + 40);
    state.yaw = yawToward(camera.position, z.buoyWorld);
    state.pitch = 0;
    flashlight.visible = false;
    caveScene.remove(camera);
    mainScene.fog = new THREE.FogExp2(hexColor(z.sea.floor).getHex(), 0.012);
    hemiLight.intensity = 0.55;
    seaNameEl.textContent = z.sea.name;
    showBanner(z.sea.name);
    updateHint();
    updateTouchUI();
  }

  function returnToBoat() {
    state.mode = "boat";
    state.cooldown = 0.4;
    flashlight.visible = false;
    caveScene.remove(camera);
    mainScene.fog = new THREE.Fog(daySky.getHex(), 200, SURFACE_FOG_FAR);
    hemiLight.intensity = 1.0;
    seaNameEl.textContent = "Rumbo abierto";
    updateHint();
    updateTouchUI();
  }

  // ---------------- Update ----------------
  const forwardVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  const camDesired = new THREE.Vector3();
  const camLookTarget = new THREE.Vector3();
  let camLookInit = false;

  function updateBoat(dt) {
    const kThrottle = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const kTurn = (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0) - (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0);
    const throttle = Math.max(-1, Math.min(1, kThrottle - moveAxis.dy));
    const turn = Math.max(-1, Math.min(1, kTurn - moveAxis.dx));

    // Cruise mode: charge while sailing forward at speed, lose it when easing off.
    if (throttle > 0.5 && boatState.speed > BOAT_MAX_SPEED * 0.6) {
      state.cruiseTimer = Math.min(CRUISE_DELAY, state.cruiseTimer + dt);
    } else if (throttle <= 0.5) {
      state.cruiseTimer = Math.max(0, state.cruiseTimer - dt * 4);
    }
    const wasCruising = state.cruising;
    state.cruising = state.cruiseTimer >= CRUISE_DELAY || (wasCruising && throttle > 0.5);
    if (state.cruising && !wasCruising) showBanner("⚡ ¡Velocidad de crucero!");
    if (!state.cruising && state.cruiseTimer >= CRUISE_DELAY) state.cruiseTimer = CRUISE_DELAY * 0.5;

    const topSpeed = state.cruising ? BOAT_CRUISE_SPEED : BOAT_MAX_SPEED;
    boatState.speed += throttle * (state.cruising ? 60 : 46) * dt;
    boatState.speed *= 0.985;
    // ease down (not snap) from cruise speed when it ends
    const cap = Math.max(topSpeed, Math.min(boatState.speed, BOAT_CRUISE_SPEED) - 30 * dt);
    boatState.speed = Math.max(-24, Math.min(cap, boatState.speed));
    boatState.yaw += turn * 1.2 * dt * (0.4 + Math.min(1, Math.abs(boatState.speed) / 14));

    forwardVec.set(-Math.sin(boatState.yaw), 0, -Math.cos(boatState.yaw));
    boat.position.addScaledVector(forwardVec, boatState.speed * dt);
    if (resolveIslandCollision(boat.position, BOAT_COLLIDE_RADIUS)) {
      boatState.speed *= 0.4;
      state.cruiseTimer = 0;
      state.cruising = false;
      if (state.shoreBannerCooldown <= 0) {
        showBanner("¡Cuidado, encallas en la costa!");
        state.shoreBannerCooldown = 3;
      }
    }
    state.shoreBannerCooldown = Math.max(0, state.shoreBannerCooldown - dt);

    // ride the swell: height from the wave field, pitch/roll from bow-vs-stern and side samples
    const bx = boat.position.x, bz = boat.position.z, t = state.time;
    const hBow = waveHeight(bx + forwardVec.x * 8, bz + forwardVec.z * 8, t);
    const hStern = waveHeight(bx - forwardVec.x * 8, bz - forwardVec.z * 8, t);
    const hPort = waveHeight(bx - forwardVec.z * 3.5, bz + forwardVec.x * 3.5, t);
    const hStar = waveHeight(bx + forwardVec.z * 3.5, bz - forwardVec.x * 3.5, t);
    boat.position.y = (hBow + hStern) * 0.5 * 0.85 + 0.2;
    boat.rotation.set((hBow - hStern) / 16, boatState.yaw, (hPort - hStar) / 7 * 0.6, "YXZ");

    // wider field of view in cruise mode sells the speed
    const targetFov = BASE_FOV + (state.cruising ? 9 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }

    // chase camera — pulled back a bit further so the higher top speed still reads well
    const behind = forwardVec.clone().multiplyScalar(-32);
    camDesired.copy(boat.position).add(behind).add(new THREE.Vector3(0, 13, 0));
    if (!camLookInit) {
      camera.position.copy(camDesired);
      camLookTarget.copy(boat.position);
      camLookInit = true;
    } else {
      camera.position.lerp(camDesired, 1 - Math.pow(0.0006, dt));
    }
    const lookAhead = boat.position.clone().addScaledVector(forwardVec, 18).add(new THREE.Vector3(0, 3, 0));
    camLookTarget.lerp(lookAhead, 1 - Math.pow(0.0004, dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(camLookTarget);

    // dive proximity hint
    let nearestDist = Infinity;
    zones.forEach((z) => {
      const d = Math.hypot(boat.position.x - z.buoyWorld.x, boat.position.z - z.buoyWorld.z);
      nearestDist = Math.min(nearestDist, d);
    });
    seaNameEl.textContent = nearestDist <= BUOY_INTERACT_RADIUS ? "¡Pulsa F para bucear!" : "Rumbo abierto";

    updateCannonAim(dt);
    updatePirates(dt);
    state.invuln = Math.max(0, state.invuln - dt);
  }

  // Menu backdrop: slow orbit of the camera around the floating boat.
  function updateBoatIdle(dt) {
    const t = state.time;
    boat.position.y = waveHeight(boat.position.x, boat.position.z, t) * 0.85 + 0.2;
    boat.rotation.set(Math.sin(t * 0.9) * 0.03, boatState.yaw, Math.sin(t * 1.1) * 0.05, "YXZ");
    const a = t * 0.08;
    camera.position.set(boat.position.x + Math.sin(a) * 60, 22, boat.position.z + Math.cos(a) * 60);
    camera.lookAt(boat.position.x, 4, boat.position.z);
    camLookInit = false;
  }

  function updateCannonAim(dt) {
    const kAim = (keys["KeyQ"] ? -1 : 0) + (keys["KeyE"] ? 1 : 0);
    const aimInput = Math.max(-1, Math.min(1, state.mouseNX + lookAxis.dx + kAim));
    // Negated: increasing yaw turns the boat/cannon toward -X (see boat steering),
    // so a positive (rightward) aim input needs a negative yaw offset to match it.
    state.aimYaw = -aimInput * CANNON_MAX_ARC;
    cannonPivot.rotation.y = state.aimYaw;
    state.cannonCooldown = Math.max(0, state.cannonCooldown - dt);
  }

  function fireCannon() {
    if (!state.started || state.mode !== "boat" || state.modalOpen || state.journalOpen || state.won) return;
    if (state.cannonCooldown > 0) return;
    state.cannonCooldown = CANNON_COOLDOWN;
    const muzzleYaw = boatState.yaw + state.aimYaw;
    const origin = new THREE.Vector3(0, 2, -4.2).applyMatrix4(boat.matrixWorld);
    spawnCannonball(origin, muzzleYaw, CANNONBALL_SPEED, "player");
  }

  function updatePirates(dt) {
    pirates.forEach((p) => {
      if (p.mode === "sunk") {
        p.sunkTimer -= dt;
        p.group.position.y -= dt * 3;
        p.group.rotation.z += dt * 0.6;
        if (p.sunkTimer <= 0) spawnPirate(p);
        return;
      }

      const toPlayer = boat.position.distanceTo(p.group.position);
      const wasChasing = p.mode === "chase";
      p.mode = toPlayer < PIRATE_AGGRO_RADIUS ? "chase" : "patrol";
      if (p.mode === "patrol" && wasChasing) pickWanderTarget(p);

      let desiredYaw;
      if (p.mode === "chase") {
        desiredYaw = yawToward(p.group.position, boat.position);
      } else {
        if (p.group.position.distanceTo(p.wanderTarget) < 40) pickWanderTarget(p);
        desiredYaw = yawToward(p.group.position, p.wanderTarget);
      }

      const diff = ((desiredYaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const maxTurn = 1.4 * dt;
      p.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));

      const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      p.group.position.addScaledVector(fwd, PIRATE_SPEED * dt);
      if (resolveIslandCollision(p.group.position, BOAT_COLLIDE_RADIUS) && p.mode === "patrol") pickWanderTarget(p);
      p.group.position.y = waveHeight(p.group.position.x, p.group.position.z, state.time) * 0.85 + 0.2;
      p.group.rotation.set(0, p.yaw, 0);

      const distFromCenter = Math.hypot(p.group.position.x, p.group.position.z);
      if (distFromCenter > PIRATE_PLAY_RADIUS) pickWanderTarget(p);

      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      if (p.mode === "chase" && toPlayer < PIRATE_FIRE_RANGE && p.fireCooldown <= 0) {
        p.fireCooldown = PIRATE_FIRE_COOLDOWN + rand(-0.4, 0.6);
        const fireYaw = yawToward(p.group.position, boat.position);
        const origin = p.group.position.clone().add(new THREE.Vector3(0, 2, 0));
        spawnCannonball(origin, fireYaw, PIRATE_BALL_SPEED, "pirate");
      }

      if (p.flashTimer > 0) {
        p.flashTimer -= dt;
        p.group.userData.hullMat.emissive.setRGB(1, 1, 1);
        p.group.userData.hullMat.emissiveIntensity = Math.max(0, p.flashTimer / 0.15);
      }
    });
  }

  function sinkPirate(p) {
    p.mode = "sunk";
    p.sunkTimer = PIRATE_RESPAWN_DELAY;
  }

  function damageBoat(amount) {
    if (state.invuln > 0) return;
    state.health = Math.max(0, state.health - amount);
    state.invuln = BOAT_INVULN_TIME;
    hitFlashEl.classList.add("show");
    setTimeout(() => hitFlashEl.classList.remove("show"), 250);
    state.cruiseTimer = 0;
    state.cruising = false;
    if (state.health <= 0) {
      boat.position.set(0, 0, 0);
      boatState.speed = 0;
      boatState.yaw = 0;
      state.health = state.maxHealth;
      state.invuln = 3;
      showBanner("¡Tu barco fue hundido! Regresas reparado a la bahía de partida.");
    }
  }

  function updateCannonballs(dt) {
    for (let i = cannonballs.length - 1; i >= 0; i--) {
      const b = cannonballs[i];
      b.velocity.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.life -= dt;

      let hit = false;
      if (b.owner === "player") {
        for (const p of pirates) {
          if (p.mode === "sunk") continue;
          if (b.mesh.position.distanceTo(p.group.position) < 11) {
            p.health -= 1;
            p.flashTimer = 0.15;
            hit = true;
            if (p.health <= 0) sinkPirate(p);
            break;
          }
        }
      } else if (b.mesh.position.distanceTo(boat.position) < 9) {
        damageBoat(BOAT_HIT_DAMAGE);
        hit = true;
      }

      if (hit || b.life <= 0 || b.mesh.position.y < -2) {
        spawnSplash(b.mesh.position);
        mainScene.remove(b.mesh);
        cannonballs.splice(i, 1);
      }
    }

    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.life -= dt;
      const t = 1 - s.life / s.maxLife;
      s.mesh.scale.setScalar(1 + t * 6);
      s.mesh.material.opacity = 0.8 * (1 - t);
      if (s.life <= 0) {
        mainScene.remove(s.mesh);
        splashes.splice(i, 1);
      }
    }
  }

  function updateHealthUI() {
    healthFill.style.width = state.health + "%";
    healthFill.style.background =
      state.health < 30
        ? "linear-gradient(90deg, #ff3b3b, #ff8a5f)"
        : "linear-gradient(90deg, #ff7a5f, #ffd76b)";
  }

  function computeLookVectors() {
    // Derive movement vectors straight from the camera's actual orientation
    // so swimming direction always matches what the player sees.
    camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forwardVec);
    rightVec.crossVectors(forwardVec, upVec).normalize();
  }

  function updateSwim(dt, bounds) {
    const kLookYaw = (keys["ArrowLeft"] ? 1 : 0) - (keys["ArrowRight"] ? 1 : 0);
    const kLookPitch = (keys["ArrowUp"] ? 1 : 0) - (keys["ArrowDown"] ? 1 : 0);
    const lookYaw = Math.max(-1, Math.min(1, kLookYaw - lookAxis.dx));
    const lookPitch = Math.max(-1, Math.min(1, kLookPitch - lookAxis.dy));
    state.yaw += lookYaw * 1.6 * dt;
    state.pitch += lookPitch * 1.1 * dt;
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));

    computeLookVectors();

    const kMoveF = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
    const kMoveR = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
    const kMoveU =
      (keys["Space"] ? 1 : 0) - (keys["ShiftLeft"] || keys["ShiftRight"] ? 1 : 0);
    const moveF = Math.max(-1, Math.min(1, kMoveF - moveAxis.dy));
    const moveR = Math.max(-1, Math.min(1, kMoveR + moveAxis.dx));
    const moveU = Math.max(-1, Math.min(1, kMoveU + (touch.up ? 1 : 0) - (touch.down ? 1 : 0)));
    const speed = 34;

    camera.position.addScaledVector(forwardVec, moveF * speed * dt);
    camera.position.addScaledVector(rightVec, moveR * speed * dt);
    camera.position.addScaledVector(upVec, moveU * speed * dt);

    bounds();
  }

  function boundsForDive() {
    const z = zones[state.zoneIndex];
    const dx = camera.position.x - z.buoyWorld.x;
    const dz = camera.position.z - z.buoyWorld.z;
    const dist = Math.hypot(dx, dz);
    if (dist > ZONE_ROAM_RADIUS) {
      const s = ZONE_ROAM_RADIUS / dist;
      camera.position.x = z.buoyWorld.x + dx * s;
      camera.position.z = z.buoyWorld.z + dz * s;
    }
    camera.position.y = Math.max(ZONE_FLOOR_Y + 4, Math.min(ZONE_SURFACE_Y, camera.position.y));
  }

  function boundsForCave() {
    const dist = Math.hypot(camera.position.x, camera.position.z);
    if (dist > 140) {
      const s = 140 / dist;
      camera.position.x *= s;
      camera.position.z *= s;
    }
    camera.position.y = Math.max(-84, Math.min(-4, camera.position.y));
  }

  function updateDiveLogic(dt) {
    updateSwim(dt, boundsForDive);
    const z = zones[state.zoneIndex];

    if (!state.found.has(z.sea.creature.id)) {
      if (camera.position.distanceTo(z.creatureWorld) < 14) collect(z.sea.creature);
    }
    if (state.cooldown <= 0 && camera.position.distanceTo(z.entranceWorld) < CAVE_ENTER_RADIUS) {
      enterCave(state.zoneIndex);
    }
    if (state.cooldown <= 0 && camera.position.y >= ZONE_SURFACE_Y - 1) {
      const dSurf = Math.hypot(camera.position.x - z.buoyWorld.x, camera.position.z - z.buoyWorld.z);
      if (dSurf < 30) returnToBoat();
    }
  }

  function updateCaveLogic(dt) {
    updateSwim(dt, boundsForCave);
    const z = zones[state.zoneIndex];
    if (!state.found.has(z.sea.cave.creature.id)) {
      if (camera.position.distanceTo(CAVE_CREATURE_POS) < 14) collect(z.sea.cave.creature);
    }
    if (!state.treasureFound.has(state.zoneIndex)) {
      if (camera.position.distanceTo(CAVE_TREASURE_POS) < 14) openTreasure(state.zoneIndex);
    }
    if (state.cooldown <= 0 && camera.position.distanceTo(CAVE_EXIT_POS) < CAVE_EXIT_RADIUS) {
      exitCave();
    }
  }

  function updateOxygen(dt) {
    if (state.mode === "boat") {
      state.oxygen = Math.min(state.maxOxygen, state.oxygen + 32 * dt);
    } else {
      const drain = state.mode === "cave" ? 8.5 : 4;
      state.oxygen -= drain * dt;
      if (state.oxygen <= 0) {
        state.oxygen = 35;
        showBanner("¡Sin aire! Regresas al barco...");
        returnToBoat();
      }
    }
    oxygenFill.style.width = state.oxygen + "%";
    oxygenFill.style.background =
      state.oxygen < 25
        ? "linear-gradient(90deg, #ff5f5f, #ffb37c)"
        : "linear-gradient(90deg, #3fd0ff, #7cffcb)";
  }

  function updateBubbles(dt) {
    const activeScene = state.mode === "cave" ? caveScene : mainScene;
    const bubbles = state.mode === "cave" ? caveBubbles : diveBubbles;
    const inWater = state.mode !== "boat";
    bubbles.forEach((b) => {
      b.visible = inWater;
      if (!inWater) return;
      b.position.y += b.userData.speed * dt;
      b.position.x += Math.sin(state.time + b.userData.drift) * 0.3 * dt;
      const tooHigh = state.mode === "cave" ? b.position.y > -6 : b.position.y > ZONE_SURFACE_Y;
      if (tooHigh || !bubblesInited) {
        if (state.mode === "cave") {
          resetBubble(b, new THREE.Vector3(0, 0, 0), 130, -84, -20);
        } else if (state.zoneIndex >= 0) {
          resetBubble(b, zones[state.zoneIndex].buoyWorld, ZONE_ROAM_RADIUS - 10, ZONE_FLOOR_Y + 5, ZONE_SURFACE_Y - 5);
        }
      }
    });
  }

  // ---------------- Radar ----------------
  function drawRadar() {
    const w = radar.width, h = radar.height, cx = w / 2, cy = h / 2, R = w / 2 - 4;
    radarCtx.clearRect(0, 0, w, h);
    radarCtx.save();
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, R, 0, Math.PI * 2);
    radarCtx.clip();
    radarCtx.fillStyle = "rgba(10,40,60,0.6)";
    radarCtx.fillRect(0, 0, w, h);

    if (state.mode === "cave") {
      drawCaveRadar(cx, cy, R);
      radarCtx.restore();
      radarCtx.beginPath();
      radarCtx.arc(cx, cy, R, 0, Math.PI * 2);
      radarCtx.strokeStyle = "rgba(127,224,255,0.5)";
      radarCtx.stroke();
      return;
    }

    const scale = R / (BUOY_RADIUS + 250);
    const originX = state.mode === "boat" ? boat.position.x : (state.zoneIndex >= 0 ? zones[state.zoneIndex].buoyWorld.x : 0);
    const originZ = state.mode === "boat" ? boat.position.z : (state.zoneIndex >= 0 ? zones[state.zoneIndex].buoyWorld.z : 0);

    radarCtx.fillStyle = "rgba(233,215,160,0.75)";
    islands.forEach((isl) => {
      radarCtx.beginPath();
      radarCtx.arc(cx + (isl.x - originX) * scale, cy + (isl.z - originZ) * scale, Math.max(2, isl.r * scale), 0, Math.PI * 2);
      radarCtx.fill();
    });

    zones.forEach((z) => {
      const dx = (z.buoyWorld.x - originX) * scale;
      const dz = (z.buoyWorld.z - originZ) * scale;
      const px = cx + dx, py = cy + dz;
      const bothFound = state.found.has(z.sea.creature.id) && state.found.has(z.sea.cave.creature.id);
      radarCtx.fillStyle = "#" + z.sea.accent.replace("#", "");
      radarCtx.beginPath();
      radarCtx.arc(px, py, bothFound ? 5.5 : 4, 0, Math.PI * 2);
      radarCtx.fill();
      if (bothFound) {
        radarCtx.strokeStyle = "#ffe9a8";
        radarCtx.lineWidth = 1.5;
        radarCtx.stroke();
      }
    });

    if (state.mode === "boat") {
      radarCtx.fillStyle = "#ff5f5f";
      pirates.forEach((p) => {
        if (p.mode === "sunk") return;
        const dx = (p.group.position.x - originX) * scale;
        const dz = (p.group.position.z - originZ) * scale;
        if (Math.hypot(dx, dz) > R) return;
        radarCtx.beginPath();
        radarCtx.arc(cx + dx, cy + dz, 3, 0, Math.PI * 2);
        radarCtx.fill();
      });
    }

    // player marker
    radarCtx.fillStyle = "#ffffff";
    radarCtx.beginPath();
    if (state.mode === "boat") {
      radarCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    } else {
      radarCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    }
    radarCtx.fill();
    radarCtx.restore();
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, R, 0, Math.PI * 2);
    radarCtx.strokeStyle = "rgba(127,224,255,0.5)";
    radarCtx.stroke();
  }

  // Cave sonar: local map centred on the diver showing creature, chest and exit
  function drawCaveRadar(cx, cy, R) {
    const z = zones[state.zoneIndex];
    const scale = R / 150;
    const px = camera.position.x, pz = camera.position.z;
    const blip = (pos, color, size) => {
      let dx = (pos.x - px) * scale, dz = (pos.z - pz) * scale;
      const d = Math.hypot(dx, dz);
      if (d > R - 6) { dx *= (R - 6) / d; dz *= (R - 6) / d; } // pin off-range blips to the edge
      radarCtx.fillStyle = color;
      radarCtx.beginPath();
      radarCtx.arc(cx + dx, cy + dz, size, 0, Math.PI * 2);
      radarCtx.fill();
    };
    // cave wall
    radarCtx.strokeStyle = "rgba(127,224,255,0.25)";
    radarCtx.beginPath();
    radarCtx.arc(cx - px * scale, cy - pz * scale, 140 * scale, 0, Math.PI * 2);
    radarCtx.stroke();
    blip(CAVE_EXIT_POS, "#8fd8ff", 5);
    if (!state.found.has(z.sea.cave.creature.id)) {
      const pulse = 4 + Math.sin(state.time * 5) * 1.2;
      blip(CAVE_CREATURE_POS, "#" + z.sea.cave.creature.color.replace("#", ""), pulse);
    }
    if (!state.treasureFound.has(state.zoneIndex)) blip(CAVE_TREASURE_POS, "#ffd76b", 4);
    // player with heading
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    radarCtx.fillStyle = "#ffffff";
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    radarCtx.fill();
    radarCtx.strokeStyle = "#ffffff";
    radarCtx.lineWidth = 2;
    radarCtx.beginPath();
    radarCtx.moveTo(cx, cy);
    radarCtx.lineTo(cx + fx * 12, cy + fz * 12);
    radarCtx.stroke();
  }

  // ---------------- Main loop ----------------
  let lastT = performance.now();
  function loop(now) {
    try {
      const dt = Math.max(0, Math.min((now - lastT) / 1000, 0.05));
      lastT = now;
      state.time += dt;
      state.cooldown = Math.max(0, state.cooldown - dt);

      animateOcean(state.time);
      updateSmoke(state.time);
      updateWake(dt, state.time);

      if (!state.started) {
        // Start screen: let the boat drift slowly so the sea behind the menu is alive.
        boatState.speed *= 0.95;
        updateBoatIdle(dt);
      } else if (!(state.modalOpen || state.journalOpen || state.won)) {
        state.playTime += dt;
        state.autosaveTimer += dt;
        if (state.autosaveTimer >= AUTOSAVE_INTERVAL) {
          state.autosaveTimer = 0;
          saveGame(true);
        }
        if (state.mode === "boat") updateBoat(dt);
        else if (state.mode === "dive") updateDiveLogic(dt);
        else if (state.mode === "cave") updateCaveLogic(dt);
        updateOxygen(dt);
        updateCannonballs(dt);
      }
      updateHealthUI();
      cruiseFillEl.style.width = (state.cruiseTimer / CRUISE_DELAY) * 100 + "%";
      cruiseRowEl.classList.toggle("active", state.cruising);
      cruiseRowEl.classList.toggle("hidden", state.mode !== "boat");
      updateBubbles(dt);
      drawRadar();

      crosshairEl.classList.toggle("hidden", state.mode === "boat");

      renderer.render(state.mode === "cave" ? caveScene : mainScene, camera);
    } catch (err) {
      console.error("Zoomarine 3D update error:", err);
    }
    requestAnimationFrame(loop);
  }

  updateHint();
  updateTouchUI();
  loadingEl.classList.add("hidden");
  const session = Profiles.current();
  if (session) {
    profile = session;
    loginName.value = session.name;
    openStartMenu();
  } else {
    showLogin();
  }
  requestAnimationFrame(loop);
})();
