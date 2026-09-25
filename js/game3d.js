// Zoomarine 3D — demo jugable
// Navega un barco por los siete mares y bucea junto a boyas para explorar
// cada zona y sus cuevas submarinas en busca de 14 criaturas marinas.

(function () {
  // ---------------- World tuning ----------------
  const BUOY_RADIUS = 1100;
  const BUOY_INTERACT_RADIUS = 70;
  const ZONE_ROAM_RADIUS = 210;
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

  // Fishing
  const FISH_CAST_RANGE = 45; // the boat must be this close to a school to cast
  const FISH_MAX_BOAT_SPEED = 10;
  const SCHOOLS_PER_SEA = 3;
  const SCHOOL_RESPAWN = 30;
  const HOME_REGION_RADIUS = 480;

  // Walking on islands
  const LAND_RANGE = 28; // boat distance from the shoreline to go ashore
  const EMBARK_RANGE = 16;
  const WALK_SPEED = 8;
  const RUN_SPEED = 15;
  const PORT_SAFE_RADIUS = 420; // pirates keep out of Puerto Limón's bay

  // Phones get a lighter renderer
  const LOW_END = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_END ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const daySky = hexColor("#cdeaf7"); // horizon colour: fog fades into the sky dome
  mainScene.background = daySky.clone();
  const SURFACE_FOG_FAR = 2800;
  mainScene.fog = new THREE.Fog(daySky.getHex(), 250, SURFACE_FOG_FAR);

  const hemiLight = new THREE.HemisphereLight(0xcfeeff, 0x2a4a5a, 0.62);
  mainScene.add(hemiLight);

  // Sun: a shadow-casting light whose small shadow box follows the player.
  const SUN_DIR = new THREE.Vector3(300, 420, 200).normalize();
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 0.95);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(LOW_END ? 1024 : 2048, LOW_END ? 1024 : 2048);
  Object.assign(sunLight.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 50, far: 900 });
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.4;
  mainScene.add(sunLight, sunLight.target);
  function updateSun(focus) {
    sunLight.position.copy(focus).addScaledVector(SUN_DIR, 400);
    sunLight.target.position.copy(focus);
  }

  // Sky dome: gradient + sun glow, follows the camera.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_DIR },
        uTop: { value: new THREE.Color(0x2f7fd0) },
        uHorizon: { value: daySky.clone() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uSunDir; uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uHorizon, uTop, pow(max(d.y, 0.0), 0.5));
          float s = max(dot(d, uSunDir), 0.0);
          col += vec3(1.0, 0.9, 0.7) * (pow(s, 10.0) * 0.3 + pow(s, 800.0) * 1.5);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  mainScene.add(sky);

  // Drifting clouds: clumps of flattened spheres high above the map.
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a9aa8, fog: false });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const puffs = 4 + Math.floor(hash(i, 3) * 4);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      const sz = 40 + hash(i, k + 10) * 50;
      m.scale.set(sz * 1.6, sz * 0.55, sz);
      m.position.set((k - puffs / 2) * 45 + hash(i, k) * 30, hash(i, k + 20) * 15, hash(i, k + 30) * 40);
      c.add(m);
    }
    const a = hash(i, 1) * Math.PI * 2, d = 900 + hash(i, 2) * 1700;
    c.position.set(Math.cos(a) * d, 320 + hash(i, 4) * 180, Math.sin(a) * d);
    c.rotation.y = hash(i, 5) * Math.PI;
    clouds.add(c);
  }
  mainScene.add(clouds);

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
    color: 0x1a6c9c,
    specular: 0x8aa4b8,
    shininess: 90,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  const oceanUniforms = {
    uTime: { value: 0 },
    // x, z = island centre, z = shoreline radius (0 means unused slot), w = coastline seed
    uIslands: { value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector4()) },
    uIslandWob: { value: new Array(MAX_ISLANDS).fill(0) },
    uSkyColor: { value: new THREE.Color(0x9fd4f0) },
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
    shader.uniforms.uIslandWob = oceanUniforms.uIslandWob;
    shader.uniforms.uSkyColor = oceanUniforms.uSkyColor;
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
      `uniform vec4 uIslands[${MAX_ISLANDS}];
       uniform float uIslandWob[${MAX_ISLANDS}];
       uniform vec3 uSkyColor;
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
           vec4 isl = uIslands[i];
           if (isl.z <= 0.0) continue;
           vec2 dv = vWorldXZ - isl.xy;
           float len = length(dv);
           if (len > isl.z * 1.2 + 26.0) continue;
           float ang = atan(dv.y, dv.x);
           float shoreR = isl.z * (1.0 + uIslandWob[i] * (0.6 * sin(3.0 * ang + isl.w) + 0.4 * sin(5.0 * ang + 2.3 * isl.w)));
           float dist = len - shoreR;
           if (dist < 0.0 || dist > 26.0) continue;
           float bands = 0.5 + 0.5 * sin(dist * 0.55 - uTime * 2.2 + n * 3.0);
           float shore = (1.0 - smoothstep(0.0, 26.0, dist)) * (0.35 + 0.65 * bands * n2);
           foam = max(foam, shore + (1.0 - smoothstep(0.0, 4.0, dist)) * 0.6);
         }
         foam = clamp(foam, 0.0, 1.0);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), foam);
         diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`
      ).replace(
        "#include <envmap_fragment>",
        `#include <envmap_fragment>
         // sky reflection at grazing angles (fresnel)
         float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 4.0);
         outgoingLight = mix(outgoingLight, uSkyColor, fres * 0.6 * (1.0 - foam));`
      );
  };
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.frustumCulled = false; // displaced in the shader, bounding sphere is flat
  ocean.receiveShadow = true;
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
  const boatModel = ZMModels.buildBoat();
  const boat = boatModel.group;
  const cannonPivot = boatModel.cannonPivot;
  // the marine biologist at the helm (hidden while walking on an island)
  const captain = ZMModels.buildPerson({ shirt: 0x2f8fd8, bottom: "shorts", bottomColor: 0xc8b48a, skin: 0xc68a5e, hair: "short", hairColor: 0x3a2412, hat: 0xe8d28a });
  captain.position.set(0.8, 2.2, 5.2);
  boat.add(captain);
  mainScene.add(boat);

  const boatState = { yaw: 0, speed: 0 };

  // ---------------- Creature builder ----------------
  function buildCreature(color, scale) {
    return ZMModels.buildFish(color, (scale || 3) * 1.2);
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

    // decorative rocks / coral (settled onto the seabed once it exists, see settleZones)
    const props = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1, flatShading: true });
    for (let i = 0; i < 10; i++) {
      const rx = (hash(b.index, i) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 20);
      const rz = (hash(b.index, i + 50) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 20);
      const s = 3 + hash(b.index, i + 90) * 5;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      rock.position.set(rx, 0, rz);
      rock.rotation.set(hash(b.index, i + 5), hash(b.index, i + 15), 0);
      group.add(rock);
      props.push({ mesh: rock, lift: s * 0.4 });
    }
    const coralMat = new THREE.MeshStandardMaterial({ color: hexColor(sea.accent), roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const rx = (hash(b.index, i + 200) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 30);
      const rz = (hash(b.index, i + 240) - 0.5) * 2 * (ZONE_ROAM_RADIUS - 30);
      const coral = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5 + hash(b.index, i) * 4, 6), coralMat);
      coral.position.set(rx, 0, rz);
      group.add(coral);
      props.push({ mesh: coral, lift: 3 });
    }

    // small schools of fish circling the zone (only shown while diving here)
    const life = new THREE.Group();
    life.visible = false;
    group.add(life);
    const schoolColors = [sea.accent, "#ffd166", "#7fd8ff", "#ff8c6b", "#b8f07a"];
    const fishSchools = [];
    for (let k = 0; k < 3; k++) {
      const fishes = [];
      const color = schoolColors[(b.index + k) % schoolColors.length];
      for (let i = 0; i < 9; i++) {
        const f = ZMModels.buildFish(color, 1.1 + hash(b.index, i + k * 9) * 0.5);
        life.add(f);
        fishes.push({ mesh: f, off: new THREE.Vector3(rand(-6, 6), rand(-3, 3), rand(-6, 6)) });
      }
      fishSchools.push({ fishes, radius: 55 + k * 38, depth: -30 - k * 24, speed: (0.16 + k * 0.05) * (k % 2 ? -1 : 1), phase: k * 2.1 });
    }

    // creature
    const creatureLocalPos = new THREE.Vector3(60, -70, 30);
    const creatureMesh = buildCreature(sea.creature.color, 3.2);
    creatureMesh.position.copy(creatureLocalPos);
    group.add(creatureMesh);

    // cave entrance: a tunnel into a seamount rising beside the zone
    const toMount = new THREE.Vector3(-90, 0, -50).normalize();
    const entranceLocal = toMount.clone().multiplyScalar(100);
    const mouth = ZMModels.buildCaveMouth();
    mouth.position.copy(entranceLocal);
    mouth.rotation.y = Math.atan2(-toMount.x, -toMount.z); // tunnel (-z) points into the mountain
    group.add(mouth);

    return {
      sea,
      buoy: b,
      group,
      creatureMesh,
      creatureLocalPos,
      life,
      fishSchools,
      props,
      mouth,
      mountX: b.x + toMount.x * 150,
      mountZ: b.z + toMount.z * 150,
      outward: toMount.clone().negate(),
      creatureWorld: new THREE.Vector3(b.x + creatureLocalPos.x, creatureLocalPos.y, b.z + creatureLocalPos.z),
      entranceWorld: new THREE.Vector3(b.x + entranceLocal.x, -80, b.z + entranceLocal.z),
      buoyWorld: new THREE.Vector3(b.x, 0, b.z),
    };
  });

  // ---------------- Islands ----------------
  // Puerto Limón sits in the centre; each sea gets a few explorable islands.
  const islands = [];
  const islandSmoke = [];
  const homeIsland = ZMIslands.create(
    { index: 0, x: HOME_PORT.x, z: HOME_PORT.z, r: HOME_PORT.r, theme: "limon", name: HOME_PORT.name, seed: 1.7, home: true },
    hash
  );
  mainScene.add(homeIsland.mesh);
  islands.push(homeIsland);

  const usedNames = {};
  function islandName(theme) {
    const list = ISLAND_NAMES[theme] || ["Isla"];
    const n = usedNames[theme] || 0;
    usedNames[theme] = n + 1;
    return list[n % list.length] + (n >= list.length ? " " + (Math.floor(n / list.length) + 1) : "");
  }

  function islandPlacementOk(x, z, r) {
    if (Math.hypot(x - HOME_PORT.x, z - HOME_PORT.z) < 300 + r) return false; // keep Puerto Limón's bay open
    if (Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z) < ATLANTIS.radius + 320 + r) return false; // the trench stays open sea
    for (const b of buoys) {
      if (Math.hypot(x - b.x, z - b.z) < ZONE_ROAM_RADIUS + 30 + r) return false; // clear of the dive zone
    }
    for (const isl of islands) {
      if (Math.hypot(x - isl.x, z - isl.z) < isl.r * 1.12 + r * 1.12 + 60) return false;
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
      const isl = ZMIslands.create(
        { index: islands.length, x, z, r, theme: b.sea.island, name: islandName(b.sea.island), seed: b.index * 10 + placed + 3, sea: b.sea },
        hash
      );
      mainScene.add(isl.mesh);
      islands.push(isl);
      if (isl.mesh.userData.smokeY) islandSmoke.push(isl.mesh);
      placed++;
    }
  });
  islands.slice(0, MAX_ISLANDS).forEach((isl, i) => {
    oceanUniforms.uIslands.value[i].set(isl.x, isl.z, isl.r, isl.seed);
    oceanUniforms.uIslandWob.value[i] = isl.wobble;
  });

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

  // Pushes a boat-sized object off any coastline (or pier) it overlaps. Returns true on contact.
  function resolveIslandCollision(pos, radius) {
    let hit = false;
    for (const isl of islands) {
      const dx = pos.x - isl.x, dz = pos.z - isl.z;
      const d = Math.hypot(dx, dz);
      if (d > isl.r * 1.2 + radius + 70) continue;
      const min = ZMIslands.shoreRadius(isl, Math.atan2(dz, dx)) * 0.97 + radius;
      if (d < min && d > 0.001) {
        pos.x = isl.x + (dx / d) * min;
        pos.z = isl.z + (dz / d) * min;
        hit = true;
      }
      for (const p of isl.platforms) {
        if (!p.solid) continue;
        const r = radius * 0.45;
        const pen = [pos.x - (p.minX - r), p.maxX + r - pos.x, pos.z - (p.minZ - r), p.maxZ + r - pos.z];
        if (pen.every((v) => v > 0)) {
          const k = pen.indexOf(Math.min(...pen));
          if (k === 0) pos.x = p.minX - r;
          else if (k === 1) pos.x = p.maxX + r;
          else if (k === 2) pos.z = p.minZ - r;
          else pos.z = p.maxZ + r;
          hit = true;
        }
      }
    }
    return hit;
  }

  function islandShoreDistance(isl, x, z) {
    const dx = x - isl.x, dz = z - isl.z;
    return Math.hypot(dx, dz) - ZMIslands.shoreRadius(isl, Math.atan2(dz, dx));
  }

  // Seagulls circling the islands
  const gulls = [];
  islands.forEach((isl, i) => {
    const n = isl.home ? 5 : i % 3 === 0 ? 2 : 0;
    for (let k = 0; k < n; k++) {
      const g = ZMModels.buildGull();
      mainScene.add(g);
      gulls.push({ g, cx: isl.x, cz: isl.z, r: isl.r * (0.5 + hash(i, k) * 0.7), h: 30 + hash(i, k + 5) * 25, speed: (0.25 + hash(i, k + 9) * 0.2) * (k % 2 ? 1 : -1), phase: hash(i, k + 13) * 6 });
    }
  });
  function updateGulls(t) {
    gulls.forEach((b) => {
      const a = t * b.speed + b.phase;
      b.g.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + b.phase) * 3, b.cz + Math.sin(a) * b.r);
      b.g.rotation.set(0, -a - (b.speed > 0 ? 0 : Math.PI), b.speed > 0 ? -0.3 : 0.3);
      ZMModels.flapGull(b.g, t + b.phase);
    });
  }

  // ---------------- Seabed: mountains, valleys and trenches ----------------
  // One height function for the whole ocean floor: shallow shelves around the
  // islands, rolling hills, ridged seamounts, deep valleys, a flat valley with a
  // cave seamount at each dive buoy, and the Atlantis trench.
  function smooth01(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function fbm(x, z, seed) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += a * ZMModels.noise3(x * f, seed, z * f);
      norm += a;
      a *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }

  function seabedHeight(x, z) {
    let near = 0;
    for (const isl of islands) {
      const s = Math.hypot(x - isl.x, z - isl.z) - isl.r * 1.15;
      if (s < 500) near = Math.max(near, Math.exp(-Math.max(0, s) / 110));
    }
    let h = -150 + 138 * near;
    const hills = (fbm(x * 0.006, z * 0.006, 0.5) - 0.5) * 40;
    const ridge = 1 - Math.abs(fbm(x * 0.0025 + 17, z * 0.0025 - 9, 3.5) * 2 - 1);
    const mountains = Math.pow(ridge, 4) * 125;
    const valley = Math.max(0, fbm(x * 0.0018 - 40, z * 0.0018 + 23, 7.5) - 0.56) * 420;
    h += (hills + mountains - valley) * (1 - near * 0.8);
    for (const zn of zones) {
      const d = Math.hypot(x - zn.buoy.x, z - zn.buoy.z);
      if (d < 280) h += (-115 + hills * 0.3 - h) * smooth01(280, 170, d);
      const dm = Math.hypot(x - zn.mountX, z - zn.mountZ);
      if (dm < 200) h += 90 * Math.exp(-(dm * dm) / 2500);
    }
    const da = Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z);
    if (da < ATLANTIS.radius + 280) h += (ATLANTIS.depth - h) * smooth01(ATLANTIS.radius + 280, ATLANTIS.radius + 30, da);
    return Math.min(h, -6);
  }

  // Put each zone's rocks, corals and cave mouth on the real seabed.
  zones.forEach((z) => {
    z.props.forEach((p) => {
      p.mesh.position.y = seabedHeight(z.buoy.x + p.mesh.position.x, z.buoy.z + p.mesh.position.z) + p.lift;
    });
    const ex = z.entranceWorld.x, ez = z.entranceWorld.z;
    z.entranceWorld.y = seabedHeight(ex, ez) + 10;
    // stand the mouth proud of the slope so its dark hole reads in front of the rock
    z.entranceWorld.addScaledVector(z.outward, 6);
    z.mouth.position.set(z.entranceWorld.x - z.buoy.x, z.entranceWorld.y, z.entranceWorld.z - z.buoy.z);
  });

  // Seabed mesh: a grid that follows the diver and is rebuilt as they move.
  const SEABED_SIZE = 520;
  const SEABED_SEGS = 104;
  const seabedGeo = new THREE.PlaneGeometry(SEABED_SIZE, SEABED_SIZE, SEABED_SEGS, SEABED_SEGS);
  seabedGeo.rotateX(-Math.PI / 2);
  seabedGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(seabedGeo.attributes.position.count * 3), 3));
  const seabed = new THREE.Mesh(seabedGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  seabed.frustumCulled = false;
  seabed.visible = false;
  mainScene.add(seabed);
  const seabedCentre = { x: Infinity, z: Infinity };

  // Instanced seabed life scattered on a stable hash grid around the diver.
  const DECOR_CELL = 13;
  const decorRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1, flatShading: true }), 420);
  const decorCoral = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 3, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 420);
  const decorKelp = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1, 0.12), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.9, side: THREE.DoubleSide }), 420);
  [decorRocks, decorCoral, decorKelp].forEach((m) => {
    m.frustumCulled = false;
    m.visible = false;
    mainScene.add(m);
  });
  const CORAL_COLORS = [0xff7a8a, 0xffb347, 0xb58cff, 0x7fe0ff, 0xff5f9e, 0xffe066].map((c) => new THREE.Color(c));

  const SAND = new THREE.Color(0xbfb088), MUD = new THREE.Color(0x7d7a66), DEEP_ROCK = new THREE.Color(0x323c48), ROCK = new THREE.Color(0x5e5850);
  function rebuildSeabed(cx, cz) {
    seabedCentre.x = cx;
    seabedCentre.z = cz;
    seabed.position.set(cx, 0, cz);
    const p = seabedGeo.attributes.position;
    const col = seabedGeo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const wx = cx + p.getX(i), wz = cz + p.getZ(i);
      const h = seabedHeight(wx, wz);
      p.setY(i, h);
      const depthK = Math.min(1, -h / 240);
      c.copy(SAND).lerp(MUD, Math.min(1, depthK * 1.6)).lerp(DEEP_ROCK, Math.max(0, depthK - 0.5) * 1.6);
      const n = ZMModels.noise3(wx * 0.05, 1.5, wz * 0.05);
      c.lerp(ROCK, n * 0.35);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    // steep slopes read as rock: compare neighbours along the grid rows
    const row = SEABED_SEGS + 1;
    for (let i = 0; i < p.count; i++) {
      const j = i % row === row - 1 ? i - 1 : i + 1;
      const k = i + row < p.count ? i + row : i - row;
      const slope = Math.hypot(p.getY(j) - p.getY(i), p.getY(k) - p.getY(i)) / (SEABED_SIZE / SEABED_SEGS);
      if (slope > 0.7) {
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(ROCK, Math.min(1, (slope - 0.7) * 1.5));
        col.setXYZ(i, c.r, c.g, c.b);
      }
    }
    p.needsUpdate = true;
    col.needsUpdate = true;
    seabedGeo.computeVertexNormals();

    // decorations
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), e = new THREE.Euler();
    let nr = 0, nc = 0, nk = 0;
    const half = SEABED_SIZE / 2 - 10;
    const gx0 = Math.floor((cx - half) / DECOR_CELL), gx1 = Math.floor((cx + half) / DECOR_CELL);
    const gz0 = Math.floor((cz - half) / DECOR_CELL), gz1 = Math.floor((cz + half) / DECOR_CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const r = hash(gx * 3.1, gz * 1.7);
        if (r > 0.45) continue;
        const wx = (gx + hash(gx, gz + 9)) * DECOR_CELL, wz = (gz + hash(gx + 5, gz)) * DECOR_CELL;
        const h = seabedHeight(wx, wz);
        if (h > -7) continue;
        const kind = r < 0.16 ? "rock" : h > -140 ? (r < 0.32 ? "coral" : "kelp") : "rock";
        const s = 0.6 + hash(gx + 2, gz + 3) * 1.6;
        if (kind === "rock" && nr < 420) {
          sc.set(s * 2.2, s * 1.4, s * 2);
          e.set(r * 5, r * 11, 0);
          pos.set(wx, h + s * 0.5, wz);
          decorRocks.setMatrixAt(nr++, m.compose(pos, q.setFromEuler(e), sc));
        } else if (kind === "coral" && nc < 420) {
          sc.set(s, s * (0.8 + r * 2), s);
          e.set(0, r * 20, (r - 0.2) * 0.8);
          pos.set(wx, h + sc.y * 1.3, wz);
          decorCoral.setMatrixAt(nc, m.compose(pos, q.setFromEuler(e), sc));
          decorCoral.setColorAt(nc++, CORAL_COLORS[Math.floor(hash(gx, gz) * CORAL_COLORS.length)]);
        } else if (kind === "kelp" && nk < 420) {
          const tall = 8 + hash(gx + 7, gz) * 18;
          sc.set(1 + s * 0.5, tall, 1);
          e.set(0, r * 30, 0);
          pos.set(wx, h + tall / 2, wz);
          decorKelp.setMatrixAt(nk++, m.compose(pos, q.setFromEuler(e), sc));
        }
      }
    }
    decorRocks.count = nr;
    decorCoral.count = nc;
    decorKelp.count = nk;
    [decorRocks, decorCoral, decorKelp].forEach((d) => {
      d.instanceMatrix.needsUpdate = true;
      if (d.instanceColor) d.instanceColor.needsUpdate = true;
    });
  }

  function updateSeabed(show) {
    [seabed, decorRocks, decorCoral, decorKelp].forEach((m) => (m.visible = show));
    if (!show) return;
    const x = camera.position.x, z = camera.position.z;
    if (Math.hypot(x - seabedCentre.x, z - seabedCentre.z) > 60) {
      rebuildSeabed(Math.round(x / 20) * 20, Math.round(z / 20) * 20);
    }
  }

  // ---------------- Sunken treasure all over the map ----------------
  const seaChests = [];
  const chestGlowColor = 0xffd76b;
  for (let i = 0, tries = 0; seaChests.length < 55 && tries < 400; tries++) {
    const a = hash(tries, 301) * Math.PI * 2, d = 250 + hash(tries, 302) * 2000;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = seabedHeight(x, z);
    if (h > -10 || Math.hypot(x - ATLANTIS.x, z - ATLANTIS.z) < ATLANTIS.radius) continue;
    if (seaChests.some((c) => Math.hypot(c.x - x, c.z - z) < 90)) continue;
    const mesh = ZMModels.buildChest();
    mesh.scale.setScalar(1.6);
    mesh.position.set(x, h - 0.2, z);
    mesh.rotation.set(0, hash(tries, 303) * 6, (hash(tries, 304) - 0.5) * 0.3);
    const glow = ZMModels.glowSprite(chestGlowColor, 7);
    glow.position.y = 2;
    mesh.add(glow);
    mesh.visible = false;
    mainScene.add(mesh);
    seaChests.push({ index: seaChests.length, x, y: h, z, mesh, reward: Math.round(20 + -h * 0.45 + hash(tries, 305) * 30) });
    i++;
  }
  // Shipwrecks: an old pirate ship on the bottom with a big chest beside it.
  const wrecks = [];
  [[0.9, 700], [2.6, 1500], [4.1, 900], [5.4, 1900]].forEach(([a, d], k) => {
    let x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = seabedHeight(x, z);
    if (h > -30) return;
    const ship = ZMModels.buildPirateShip();
    ship.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) {
        o.material = o.material.clone();
        o.material.color.multiplyScalar(0.55).lerp(new THREE.Color(0x3a5a4a), 0.3);
      }
    });
    ship.userData.flag.visible = false;
    ZMModels.bake(ship);
    ship.position.set(x, h + 0.5, z);
    ship.rotation.set(0.12, a * 3, 0.45);
    ship.visible = false;
    mainScene.add(ship);
    const chest = ZMModels.buildChest();
    chest.scale.setScalar(2.2);
    const cx = x + 12, cz = z + 4;
    chest.position.set(cx, seabedHeight(cx, cz) - 0.2, cz);
    const glow = ZMModels.glowSprite(chestGlowColor, 9);
    glow.position.y = 2;
    chest.add(glow);
    chest.visible = false;
    mainScene.add(chest);
    wrecks.push(ship);
    seaChests.push({ index: seaChests.length, x: cx, y: chest.position.y, z: cz, mesh: chest, reward: 150, wreck: true });
  });

  // ---------------- Atlantis ----------------
  const atlantis = ZMModels.buildAtlantis(ATLANTIS.radius);
  atlantis.position.set(ATLANTIS.x, ATLANTIS.depth, ATLANTIS.z);
  atlantis.visible = false;
  mainScene.add(atlantis);
  const mythics = MYTHIC_TREASURES.map((t, i) => {
    const m = ZMModels.buildMythic(t.id, hexColor(t.color).getHex());
    let lx = 0, lz = -7, ly = 9;
    if (i > 0) {
      const a = Math.PI / 4 + (i - 1) * (Math.PI / 2);
      lx = Math.cos(a) * ATLANTIS.radius * 0.5;
      lz = Math.sin(a) * ATLANTIS.radius * 0.5;
      ly = 0;
    }
    m.position.set(lx, ly, lz);
    atlantis.add(m);
    return { t, mesh: m, world: new THREE.Vector3(ATLANTIS.x + lx, ATLANTIS.depth + ly + 6, ATLANTIS.z + lz) };
  });
  // swirl on the surface above the ruins (shown once Tata Chema told the legend)
  const atlantisSwirl = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(rippleGeoShared(), new THREE.MeshBasicMaterial({ color: 0x7fffe0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    atlantisSwirl.add(r);
  }
  atlantisSwirl.position.set(ATLANTIS.x, 0, ATLANTIS.z);
  atlantisSwirl.visible = false;
  mainScene.add(atlantisSwirl);
  function rippleGeoShared() {
    const g = new THREE.RingGeometry(0.9, 1, 40);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  function updateDeepSea(dt) {
    const diving = state.mode === "dive";
    const cam = camera.position;
    seaChests.forEach((c) => {
      c.mesh.visible = diving && !state.seaChests.has(c.index) && Math.hypot(c.x - cam.x, c.z - cam.z) < 260;
    });
    wrecks.forEach((w) => (w.visible = diving && Math.hypot(w.position.x - cam.x, w.position.z - cam.z) < 320));
    atlantis.visible = diving && Math.hypot(ATLANTIS.x - cam.x, ATLANTIS.z - cam.z) < 650;
    mythics.forEach((m) => {
      m.mesh.visible = !state.mythics.has(m.t.id);
      m.mesh.userData.item.rotation.y += dt * 0.8;
      m.mesh.userData.item.position.y = 6 + Math.sin(state.time * 1.5) * 0.6;
    });
    atlantisSwirl.visible = state.atlantisKnown && !diving;
    atlantisSwirl.children.forEach((r, i) => {
      const k = (state.time * 0.25 + i / 3) % 1;
      r.scale.setScalar(10 + k * 60);
      r.material.opacity = 0.55 * (1 - k);
      r.position.y = waveHeight(ATLANTIS.x, ATLANTIS.z, state.time) + 0.3;
      r.rotation.y = state.time * 0.3;
    });
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
  const buildPirateShip = ZMModels.buildPirateShip;

  const pirates = [];
  for (let i = 0; i < PIRATE_COUNT; i++) {
    const group = ZMModels.bake(buildPirateShip());
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
    const rad = rand(PORT_SAFE_RADIUS + 80, PIRATE_PLAY_RADIUS);
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
  caveScene.fog = new THREE.FogExp2(0x02040a, 0.0065);
  const caveAmbient = new THREE.AmbientLight(0x3a4a6a, 1.1);
  caveScene.add(caveAmbient);

  // The flashlight rides on the camera, so the camera must be parented to caveScene
  // while diving in a cave (see enterCave/leaveCaveScene) or the light never renders.
  const flashlight = new THREE.SpotLight(0xdff4ff, 3.5, 260, Math.PI / 4.5, 0.45, 1.0);
  flashlight.position.set(0, 0, 0);
  camera.add(flashlight);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight.target);
  flashlight.intensity = 0;
  mainScene.add(camera); // camera is parented to the active scene so its flashlight renders

  const CAVE_SPAWN = new THREE.Vector3(0, -30, 30);
  const CAVE_CREATURE_POS = new THREE.Vector3(30, -45, -50);
  const CAVE_EXIT_POS = new THREE.Vector3(0, -30, 105);
  // rocky cavern inside the seamount (walls, stalactites, crystals tinted per sea)
  const cavern = ZMModels.buildCavern();
  caveScene.add(cavern.group);
  // crystal glow lights, tinted to the sea's accent on entry
  const caveGlows = [[-80, -70, 40], [70, -72, -60], [10, -75, 90]].map(([x, y, z]) => {
    const l = new THREE.PointLight(0x7fe0ff, 1.4, 140, 1.2);
    l.position.set(x, y, z);
    caveScene.add(l);
    return l;
  });

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
  const CAVE_TREASURE_POS = new THREE.Vector3(-55, -79, -15);
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
    mode: "boat", // 'boat' | 'walk' | 'dive' | 'cave'
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
    coins: 0,
    cooler: [], // fish waiting to be sold: { id, value }
    fishLog: {}, // species id -> how many caught
    missionIndex: 0,
    mission: null, // { status: 'active' | 'done', progress }
    upgrades: { rod: 0, cooler: 0, engine: 0, dive: 0 },
    chestsOpened: new Set(),
    seaChests: new Set(), // sunken chests already opened
    mythics: new Set(), // Atlantis treasures found
    whalesSeen: new Set(), // whale species sighted
    whaleBannerCooldown: 0,
    atlantisKnown: false,
    diveAnchor: { x: 0, z: 0 },
    fishing: null,
    mouseDown: false,
    island: null, // island the explorer is walking on
    landingPoint: null,
    lastRegion: null,
  };

  const dockPoint = new THREE.Vector3(0, 0, 0);

  // ---------------- Input ----------------
  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (!state.started) return;
    if (e.code === "Escape" && !dialogModal.classList.contains("hidden")) {
      closeDialog();
      return;
    }
    if (e.code === "Escape" && !state.modalOpen) openStartMenu();
    if (e.code === "KeyJ") toggleJournal();
    if (e.code === "KeyF" && !e.repeat) handleDiveKey();
    if (e.code === "KeyR" && !e.repeat) handleFishKey();
    if (e.code === "Space" && !e.repeat && state.mode === "boat") fireCannon();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // ---------------- Touch controls (phones / tablets) ----------------
  const touch = { up: false, down: false, reel: false };

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
  const btnFishEl = document.getElementById("btn-fish");
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
  btnFishEl.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      touch.reel = true;
      handleFishKey();
    },
    { passive: false }
  );
  ["touchend", "touchcancel"].forEach((ev) =>
    btnFishEl.addEventListener(ev, (e) => {
      e.preventDefault();
      touch.reel = false;
    }, { passive: false })
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
    if (e.button !== 0) return;
    state.mouseDown = true;
    if (state.fishing) handleFishKey(); // while fishing the mouse reels instead of firing
    else fireCannon();
  });
  window.addEventListener("mouseup", () => (state.mouseDown = false));

  function updateTouchUI() {
    const diving = state.mode === "dive" || state.mode === "cave";
    vertButtonsEl.classList.toggle("hidden", !diving);
    btnFireEl.classList.toggle("hidden", state.mode !== "boat");
    btnFishEl.classList.toggle("hidden", state.mode !== "boat");
    btnDiveEl.textContent = diving ? "⬆" : state.mode === "walk" ? "✋" : "🤿";
  }

  function handleDiveKey() {
    if (!state.started || state.modalOpen || state.journalOpen || state.won) return;
    if (state.mode === "walk") {
      walkInteract();
      return;
    }
    if (state.mode === "boat" && state.fishing) {
      stopFishing("Recoges la caña");
      return;
    }
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
      const shore = landingIsland();
      if (nearest >= 0 && nearestDist <= BUOY_INTERACT_RADIUS) {
        startDive(nearest);
      } else if (shore) {
        landOnIsland(shore);
      } else if (Math.abs(boatState.speed) > 20) {
        showBanner("Frena el barco para bucear");
      } else {
        startDiveAt(boat.position.x, boat.position.z);
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
  const coinCountEl = document.getElementById("coin-count");
  const coolerCountEl = document.getElementById("cooler-count");
  const coolerCapEl = document.getElementById("cooler-cap");
  const missionTrackerEl = document.getElementById("mission-tracker");
  const fishingUI = document.getElementById("fishing-ui");
  const fishingStatusEl = document.getElementById("fishing-status");
  const tensionFillEl = document.getElementById("tension-fill");
  const progressFillEl = document.getElementById("reel-progress-fill");
  const fishingBarsEl = document.getElementById("fishing-bars");
  const catchCard = document.getElementById("catch-card");
  const dialogModal = document.getElementById("dialog-modal");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogBody = document.getElementById("dialog-body");
  const dialogActions = document.getElementById("dialog-actions");
  const depthMeterEl = document.getElementById("depth-meter");

  totalCountEl.textContent = TOTAL;
  treasureTotalCountEl.textContent = TOTAL_TREASURE;

  const HINTS = {
    boat: "WASD: navegar · Ratón: apuntar · Clic: disparar · <b>R</b>: pescar · <b>F</b>: bucear aquí / desembarcar en isla · <b>J</b>: Bitácora",
    walk: "WASD / Flechas: caminar · Shift: correr · <b>F</b>: hablar, abrir cofres o subir al barco · <b>J</b>: Bitácora",
    dive: "WASD: nadar · Flechas: mirar · Espacio/Shift: subir/bajar · Busca cofres 🧰 y cuevas en las montañas · <b>F</b>: volver al barco · <b>J</b>: Bitácora",
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
    const heading = (text) => {
      const h = document.createElement("h3");
      h.className = "journal-section";
      h.textContent = text;
      journalList.appendChild(h);
    };
    heading("🎣 Peces pescados");
    FISH.forEach((f) => {
      const n = state.fishLog[f.id] || 0;
      const entry = document.createElement("div");
      entry.className = "journal-entry" + (n ? "" : " locked");
      const tag = f.special ? "⭐ Especial de misión" : `Vale ~${f.value} 🪙`;
      entry.innerHTML = n
        ? `<h4 style="color:${f.color}">${f.special ? "⭐ " : ""}${f.name}</h4><p>Pescados: ${n} · ${tag}${f.fact ? "<br>" + f.fact : ""}</p>`
        : `<h4>${f.special ? "⭐ ???" : "???"}</h4><p>${f.special ? "Pez legendario: aparece en una misión." : "Aún no pescado."}</p>`;
      journalList.appendChild(entry);
    });
    heading("🐋 Ballenas avistadas");
    WHALES.forEach((w) => {
      const seen = state.whalesSeen.has(w.id);
      const where = w.seas.map(regionName).join(" · ");
      const entry = document.createElement("div");
      entry.className = "journal-entry" + (seen ? "" : " locked");
      entry.innerHTML = seen
        ? `<h4 style="color:${w.color}">${w.name}</h4><p><em>${where}</em><br>${w.fact}</p>`
        : `<h4>???</h4><p><em>${where}</em><br>Busca su soplido en el horizonte.</p>`;
      journalList.appendChild(entry);
    });
    heading("🔱 Tesoros de la Atlántida");
    MYTHIC_TREASURES.forEach((t) => {
      const got = state.mythics.has(t.id);
      const entry = document.createElement("div");
      entry.className = "journal-entry" + (got ? "" : " locked");
      entry.innerHTML = got
        ? `<h4 style="color:${t.color}">${t.name}</h4><p>${t.fact}</p>`
        : `<h4>???</h4><p>${state.atlantisKnown ? "Escondido en las ruinas de la Atlántida." : "Tata Chema conoce una leyenda..."}</p>`;
      journalList.appendChild(entry);
    });
    heading("🐠 Criaturas de los siete mares");
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
  journalClose.addEventListener("click", () => {
    toggleJournal(false);
    // opened from the menu (phones): go back to the menu
    if (journalFromMenu) {
      journalFromMenu = false;
      startScreen.classList.remove("hidden");
    }
  });
  let journalFromMenu = false;
  document.getElementById("journal-menu-btn").addEventListener("click", () => {
    journalFromMenu = true;
    startScreen.classList.add("hidden");
    toggleJournal(true);
  });

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

  function openPuzzle(title, intro, onSolved) {
    state.modalOpen = true;
    puzzleTitle.textContent = title;
    puzzleIntro.textContent = intro;
    puzzleModal.classList.remove("hidden");
    const done = () => {
      puzzleModal.classList.add("hidden");
      state.modalOpen = false;
      onSolved();
    };
    if (Math.random() < 0.5) renderMathPuzzle(done);
    else renderSliderPuzzle(done);
  }

  function openMythic(m) {
    openPuzzle("🔱 " + m.t.name, "Un sello atlante protege este tesoro. Resuélvelo:", () => {
      state.mythics.add(m.t.id);
      state.coins += m.t.reward;
      state.oxygen = state.maxOxygen;
      refreshCounters();
      showCatchLike("🔱 Tesoro mítico", m.t.name, m.t.color, `+${m.t.reward} 🪙 · ${state.mythics.size}/${MYTHIC_TREASURES.length} tesoros de la Atlántida`, m.t.fact);
      saveGame();
    });
  }

  function openTreasure(zoneIndex) {
    if (state.treasureFound.has(zoneIndex)) return;
    openPuzzle("💎 Tesoro encontrado", "Resuelve esto para quedarte con el tesoro:", () => {
      state.treasureFound.add(zoneIndex);
      treasureFoundCountEl.textContent = state.treasureFound.size;
      state.oxygen = state.maxOxygen;
      state.health = Math.min(state.maxHealth, state.health + 30);
      state.coins += 50;
      refreshCounters();
      showBanner("¡Tesoro obtenido! +50 🪙, oxígeno y casco reforzados");
      saveGame();
    });
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
      version: 2,
      found: [...state.found],
      treasureFound: [...state.treasureFound],
      health: state.health,
      boat: { x: boat.position.x, z: boat.position.z, yaw: boatState.yaw },
      player: state.mode === "walk" && state.island ? { x: player.pos.x, z: player.pos.z, yaw: player.yaw, island: state.island.index, landing: state.landingPoint } : null,
      coins: state.coins,
      cooler: state.cooler,
      fishLog: state.fishLog,
      missionIndex: state.missionIndex,
      mission: state.mission,
      upgrades: state.upgrades,
      chestsOpened: [...state.chestsOpened],
      seaChests: [...state.seaChests],
      mythics: [...state.mythics],
      whalesSeen: [...state.whalesSeen],
      atlantisKnown: state.atlantisKnown,
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
    stopFishing();
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
    state.coins = 0;
    state.cooler = [];
    state.fishLog = {};
    state.missionIndex = 0;
    state.mission = null;
    state.upgrades = { rod: 0, cooler: 0, engine: 0, dive: 0 };
    state.chestsOpened.clear();
    state.seaChests.clear();
    state.mythics.clear();
    state.whalesSeen.clear();
    state.atlantisKnown = false;
    moorAtHome();
    camLookInit = false;
    pirates.forEach(spawnPirate);
  }

  function moorAtHome() {
    const m = homeIsland.mooring;
    boat.position.set(m.x, 0, m.z);
    boatState.yaw = m.yaw;
    boatState.speed = 0;
  }

  function applySave(data) {
    resetWorld();
    if (!data) {
      // new expedition: on foot in Puerto Limón, next to the pier
      const sp = homeIsland.spawn;
      enterWalk(homeIsland, sp.x, sp.z, sp.yaw, true);
      state.landingPoint = null; // start on land: board from the pier
      return;
    }
    (data.found || []).forEach((id) => state.found.add(id));
    (data.treasureFound || []).forEach((i) => state.treasureFound.add(i));
    state.health = Math.max(20, Math.min(state.maxHealth, data.health || state.maxHealth));
    state.playTime = data.playTime || 0;
    if (data.boat) {
      boat.position.set(data.boat.x || 0, 0, data.boat.z || 0);
      boatState.yaw = data.boat.yaw || 0;
      resolveIslandCollision(boat.position, BOAT_COLLIDE_RADIUS);
    }
    state.coins = data.coins || 0;
    state.cooler = Array.isArray(data.cooler) ? data.cooler.filter((f) => FISH_BY_ID[f.id]) : [];
    state.fishLog = data.fishLog || {};
    state.missionIndex = Math.min(MISSIONS.length, data.missionIndex || 0);
    state.mission = data.mission && MISSIONS[state.missionIndex] ? data.mission : null;
    state.upgrades = Object.assign({ rod: 0, cooler: 0, engine: 0, dive: 0 }, data.upgrades);
    (data.chestsOpened || []).forEach((i) => state.chestsOpened.add(i));
    (data.seaChests || []).forEach((i) => state.seaChests.add(i));
    (data.mythics || []).forEach((i) => state.mythics.add(i));
    (data.whalesSeen || []).forEach((i) => state.whalesSeen.add(i));
    state.atlantisKnown = !!data.atlantisKnown;
    if (!data.version || data.version < 2) moorAtHome(); // older saves: Puerto Limón now sits at the old start point
    const pl = data.player;
    if (pl && islands[pl.island]) {
      enterWalk(islands[pl.island], pl.x, pl.z, pl.yaw || 0, true);
      state.landingPoint = pl.landing || null;
    }
    else exitWalk(true);
  }

  function refreshCounters() {
    foundCountEl.textContent = state.found.size;
    treasureFoundCountEl.textContent = state.treasureFound.size;
    coinCountEl.textContent = state.coins;
    coolerCountEl.textContent = state.cooler.length;
    coolerCapEl.textContent = coolerCapacity();
    state.maxOxygen = UPGRADES.dive.oxygen[state.upgrades.dive];
    state.oxygen = Math.min(state.oxygen, state.maxOxygen);
    islands.forEach((isl) => {
      if (isl.chest) isl.chest.mesh.visible = !state.chestsOpened.has(isl.index);
    });
    updateMissionUI();
    syncMissionSchool();
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
    const fresh = !state.found.size && !state.missionIndex && !state.mission && !state.coins;
    showBanner(fresh ? "¡Bienvenido a Puerto Limón!" : "¡Bienvenido de vuelta, " + profile.name + "!");
    if (fresh && state.mode === "walk") setTimeout(() => showBanner("Habla con Doña Marisol ❗ para tu primera misión"), 2600);
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
    stopFishing();
    if (state.mode === "dive" || state.mode === "cave") returnToBoat(); // the menu backdrop is the surface
    toggleJournal(false);
    startScreen.classList.remove("hidden");
    loginForm.classList.add("hidden");
    startMenu.classList.remove("hidden");
    welcomeText.textContent = "Hola, " + profile.name + " 👋";
    const data = Profiles.loadSave(profile.key);
    if (data) {
      const date = new Date(data.savedAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
      saveSummary.innerHTML =
        `🐠 ${(data.found || []).length}/${TOTAL} criaturas · 💎 ${(data.treasureFound || []).length}/${TOTAL_TREASURE} tesoros · 🪙 ${data.coins || 0}<br>` +
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

  // Dive straight down from the boat, wherever it is.
  function startDiveAt(x, z) {
    stopFishing();
    state.mode = "dive";
    state.cooldown = 0.6;
    state.diveAnchor = { x: boat.position.x, z: boat.position.z };
    mainScene.add(camera);
    camera.position.set(x, -7, z);
    state.yaw = boatState.yaw;
    state.pitch = -0.35;
    state.zoneIndex = nearestZoneIndex(camera.position);
    setUnderwater();
    rebuildSeabed(Math.round(x / 20) * 20, Math.round(z / 20) * 20);
    const depth = Math.round(-seabedHeight(x, z));
    seaNameEl.textContent = regionName(regionAt(x, z));
    showBanner(`🤿 Fondo a ${depth} m · tu equipo llega a ${diveDepthLimit()} m`);
    updateHint();
    updateTouchUI();
  }

  function startDive(zoneIndex) {
    const z = zones[zoneIndex];
    startDiveAt(z.buoyWorld.x, z.buoyWorld.z);
    state.yaw = yawToward(camera.position, z.creatureWorld);
    state.pitch = -0.15;
    showBanner(z.sea.name);
  }

  function nearestZoneIndex(pos) {
    let best = -1, bd = 300;
    zones.forEach((z, i) => {
      const d = Math.hypot(pos.x - z.buoyWorld.x, pos.z - z.buoyWorld.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  function diveDepthLimit() {
    return UPGRADES.dive.depth[state.upgrades.dive];
  }

  function enterCave(zoneIndex) {
    state.mode = "cave";
    state.zoneIndex = zoneIndex;
    state.cooldown = 0.6;
    camera.position.copy(CAVE_SPAWN);
    state.yaw = yawToward(CAVE_SPAWN, CAVE_CREATURE_POS);
    state.pitch = 0;
    caveScene.add(camera);
    flashlight.intensity = 3.5;
    const z = zones[zoneIndex];
    caveCreatureMesh.userData.mainMaterial.color.set(hexColor(z.sea.cave.creature.color));
    caveCreatureMesh.userData.mainMaterial.emissive.set(hexColor(z.sea.cave.creature.color));
    caveCreatureMesh.visible = !state.found.has(z.sea.cave.creature.id);
    cavern.crystalMat.color.set(hexColor(z.sea.accent));
    cavern.crystalMat.emissive.set(hexColor(z.sea.accent));
    caveGlows.forEach((l) => l.color.set(hexColor(z.sea.accent)));
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
    mainScene.add(camera);
    camera.position.copy(z.entranceWorld).addScaledVector(z.outward, 36);
    camera.position.y += 4;
    state.yaw = yawToward(camera.position, z.buoyWorld);
    state.pitch = 0;
    setUnderwater();
    seaNameEl.textContent = z.sea.name;
    showBanner(z.sea.name);
    updateHint();
    updateTouchUI();
  }

  // Water colour, visibility and light fade with depth (called every dive frame).
  const SHALLOW_WATER = new THREE.Color(0x2a8fb0), DEEP_WATER = new THREE.Color(0x05233a);
  function setUnderwater() {
    const depth = Math.max(0, -camera.position.y);
    const k = Math.min(1, depth / 250);
    const fogColor = SHALLOW_WATER.clone().lerp(DEEP_WATER, Math.pow(k, 0.7));
    if (!mainScene.fog || !mainScene.fog.isFogExp2) mainScene.fog = new THREE.FogExp2(fogColor.getHex(), 0.01);
    mainScene.fog.color.copy(fogColor);
    mainScene.fog.density = 0.008 + k * 0.006;
    mainScene.background = fogColor;
    sky.visible = false;
    clouds.visible = false;
    hemiLight.intensity = 0.6 * (1 - k * 0.7);
    sunLight.intensity = 0.95 * (1 - k);
    flashlight.intensity = depth > 70 ? Math.min(3.5, (depth - 70) / 20) : 0;
  }

  function setSurface() {
    mainScene.fog = new THREE.Fog(daySky.getHex(), 250, SURFACE_FOG_FAR);
    sunLight.intensity = 0.95;
    flashlight.intensity = 0;
    mainScene.background = daySky.clone();
    sky.visible = true;
    clouds.visible = true;
    hemiLight.intensity = 0.62;
  }

  function returnToBoat() {
    state.mode = "boat";
    state.cooldown = 0.4;
    mainScene.add(camera);
    camLookInit = false;
    setSurface();
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
    let throttle = Math.max(-1, Math.min(1, kThrottle - moveAxis.dy));
    let turn = Math.max(-1, Math.min(1, kTurn - moveAxis.dx));
    if (state.fishing) {
      // any steering reels the line in; otherwise the boat drifts to a stop
      if (Math.abs(throttle) > 0.3 || Math.abs(turn) > 0.3) stopFishing("Recoges la caña");
      throttle = 0;
      turn = 0;
      boatState.speed *= Math.pow(0.2, dt);
    }

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

    const engine = UPGRADES.engine.speed[state.upgrades.engine];
    const topSpeed = (state.cruising ? BOAT_CRUISE_SPEED : BOAT_MAX_SPEED) * engine;
    boatState.speed += throttle * (state.cruising ? 60 : 46) * engine * dt;
    boatState.speed *= 0.985;
    // ease down (not snap) from cruise speed when it ends
    const cap = Math.max(topSpeed, Math.min(boatState.speed, BOAT_CRUISE_SPEED * engine) - 30 * dt);
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

    // context line: what the player can do right here
    let nearestDist = Infinity;
    zones.forEach((z) => {
      const d = Math.hypot(boat.position.x - z.buoyWorld.x, boat.position.z - z.buoyWorld.z);
      nearestDist = Math.min(nearestDist, d);
    });
    const region = regionAt(boat.position.x, boat.position.z);
    if (region !== state.lastRegion) {
      if (state.lastRegion !== null) showBanner(regionName(region));
      state.lastRegion = region;
    }
    const shore = landingIsland();
    const school = nearestSchool(FISH_CAST_RANGE);
    btnFishEl.classList.toggle("ready", !!school && !state.fishing);
    let ctx;
    if (state.fishing) ctx = "🎣 Pescando...";
    else if (nearestDist <= BUOY_INTERACT_RADIUS) ctx = "¡Pulsa F para bucear!";
    else if (school) ctx = Math.abs(boatState.speed) > FISH_MAX_BOAT_SPEED ? "🐟 Peces cerca: frena para pescar" : "🐟 Pulsa R para pescar";
    else if (shore) ctx = "F: desembarcar en " + shore.name;
    else ctx = regionName(region);
    seaNameEl.textContent = ctx;

    updateCannonAim(dt);
    updatePirates(dt);
    state.invuln = Math.max(0, state.invuln - dt);
  }

  // Boat left at anchor (menu backdrop or while exploring an island): bob on the swell.
  function floatBoat() {
    const t = state.time;
    boat.position.y = waveHeight(boat.position.x, boat.position.z, t) * 0.85 + 0.2;
    boat.rotation.set(Math.sin(t * 0.9) * 0.03, boatState.yaw, Math.sin(t * 1.1) * 0.05, "YXZ");
  }

  // Menu backdrop: slow orbit of the camera around the boat (or the explorer ashore).
  function updateBoatIdle(dt) {
    const t = state.time;
    floatBoat();
    const walking = state.mode === "walk";
    const f = walking ? player.pos : boat.position;
    const a = t * 0.08;
    const dist = walking ? 30 : 60;
    camera.position.set(f.x + Math.sin(a) * dist, f.y + (walking ? 12 : 22), f.z + Math.cos(a) * dist);
    if (walking) camera.position.y = Math.max(camera.position.y, ZMIslands.groundAt(state.island, camera.position.x, camera.position.z) + 4);
    camera.lookAt(f.x, f.y + (walking ? 2 : 4), f.z);
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
    const origin = cannonPivot.localToWorld(new THREE.Vector3(0, 0.5, -3.9));
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
      const boatInPort = Math.hypot(boat.position.x - HOME_PORT.x, boat.position.z - HOME_PORT.z) < PORT_SAFE_RADIUS;
      p.mode = toPlayer < PIRATE_AGGRO_RADIUS && state.mode === "boat" && !boatInPort ? "chase" : "patrol";
      if (p.mode === "patrol" && wasChasing) pickWanderTarget(p);
      const pirateInPort = Math.hypot(p.group.position.x - HOME_PORT.x, p.group.position.z - HOME_PORT.z) < PORT_SAFE_RADIUS;

      let desiredYaw;
      if (pirateInPort) {
        desiredYaw = yawToward(new THREE.Vector3(HOME_PORT.x, 0, HOME_PORT.z), p.group.position); // sail back out
      } else if (p.mode === "chase") {
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
      p.group.rotation.set(Math.sin(state.time * 1.1 + p.yaw) * 0.03, p.yaw, Math.sin(state.time * 0.9 + p.yaw) * 0.05, "YXZ");

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
      moorAtHome();
      stopFishing();
      state.health = state.maxHealth;
      state.invuln = 3;
      showBanner("¡Tu barco fue hundido! Regresas reparado a Puerto Limón.");
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

  const DIVE_ROAM_RADIUS = 420;
  const prevCam = new THREE.Vector3();
  function boundsForDive() {
    const c = camera.position;
    const a = state.diveAnchor;
    const dx = c.x - a.x, dz = c.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist > DIVE_ROAM_RADIUS) {
      c.x = a.x + (dx / dist) * DIVE_ROAM_RADIUS;
      c.z = a.z + (dz / dist) * DIVE_ROAM_RADIUS;
      nag("🪢 No te alejes tanto de tu barco");
    }
    // solid ground: the seabed and the underwater slopes of islands
    let floor = seabedHeight(c.x, c.z);
    for (const isl of islands) {
      if (Math.hypot(c.x - isl.x, c.z - isl.z) < isl.r * 1.3) floor = Math.max(floor, ZMIslands.heightAt(isl, c.x, c.z));
    }
    if (floor > -4) {
      // island shore: slide back instead of walking out of the water
      c.x = prevCam.x;
      c.z = prevCam.z;
      floor = Math.min(floor, prevCam.y - 2.5);
    }
    const limit = -diveDepthLimit();
    if (c.y < limit + 1 && floor < limit) nag(`🔒 Tu equipo llega a ${-limit} m: mejóralo en el Taller Náutico`);
    c.y = Math.max(floor + 2.5, limit, Math.min(-2.5, c.y));
    prevCam.copy(c);
  }

  function nag(text) {
    if (state.shoreBannerCooldown > 0) return;
    showBanner(text);
    state.shoreBannerCooldown = 4;
  }

  function boundsForCave() {
    ZMModels.cavernInside(camera.position, 0.86);
  }

  function updateDiveLogic(dt) {
    updateSwim(dt, boundsForDive);
    state.shoreBannerCooldown = Math.max(0, state.shoreBannerCooldown - dt);
    setUnderwater();
    const zi = nearestZoneIndex(camera.position);
    state.zoneIndex = zi;
    if (zi >= 0) {
      const z = zones[zi];
      if (!state.found.has(z.sea.creature.id) && camera.position.distanceTo(z.creatureWorld) < 14) collect(z.sea.creature);
      if (state.cooldown <= 0 && camera.position.distanceTo(z.entranceWorld) < CAVE_ENTER_RADIUS) {
        enterCave(zi);
        return;
      }
    }
    // sunken chests
    seaChests.forEach((c) => {
      if (state.seaChests.has(c.index)) return;
      if (Math.hypot(camera.position.x - c.x, camera.position.y - c.y, camera.position.z - c.z) < 8) {
        state.seaChests.add(c.index);
        state.coins += c.reward;
        refreshCounters();
        showBanner(`${c.wreck ? "⚓ ¡Tesoro del naufragio!" : "🧰 ¡Cofre hundido!"} +${c.reward} 🪙`);
        saveGame();
      }
    });
    // mythic treasures of Atlantis
    mythics.forEach((m) => {
      if (!state.mythics.has(m.t.id) && camera.position.distanceTo(m.world) < 10) openMythic(m);
    });
    if (state.cooldown <= 0 && camera.position.y >= -3) {
      const a = state.diveAnchor;
      if (Math.hypot(camera.position.x - a.x, camera.position.z - a.z) < 45) returnToBoat();
    }
    depthMeterEl.textContent = `⬇ ${Math.round(-camera.position.y)} m · límite ${diveDepthLimit()} m`;
  }

  function updateCaveLogic(dt) {
    updateSwim(dt, boundsForCave);
    const z = zones[state.zoneIndex];
    if (!state.found.has(z.sea.cave.creature.id)) {
      if (camera.position.distanceTo(caveCreatureMesh.position) < 14) collect(z.sea.cave.creature);
    }
    if (!state.treasureFound.has(state.zoneIndex)) {
      if (camera.position.distanceTo(CAVE_TREASURE_POS) < 14) openTreasure(state.zoneIndex);
    }
    if (state.cooldown <= 0 && camera.position.distanceTo(CAVE_EXIT_POS) < CAVE_EXIT_RADIUS) {
      exitCave();
    }
    depthMeterEl.textContent = "🕳 " + z.sea.cave.name;
  }

  function updateOxygen(dt) {
    if (state.mode === "boat" || state.mode === "walk") {
      state.oxygen = Math.min(state.maxOxygen, state.oxygen + 32 * dt);
    } else {
      const drain = state.mode === "cave" ? 8.5 : 4;
      state.oxygen -= drain * dt;
      if (state.oxygen <= 0) {
        state.oxygen = state.maxOxygen * 0.35;
        showBanner("¡Sin aire! Regresas al barco...");
        returnToBoat();
      }
    }
    oxygenFill.style.width = (state.oxygen / state.maxOxygen) * 100 + "%";
    oxygenFill.style.background =
      state.oxygen / state.maxOxygen < 0.25
        ? "linear-gradient(90deg, #ff5f5f, #ffb37c)"
        : "linear-gradient(90deg, #3fd0ff, #7cffcb)";
  }

  function updateBubbles(dt) {
    const activeScene = state.mode === "cave" ? caveScene : mainScene;
    const bubbles = state.mode === "cave" ? caveBubbles : diveBubbles;
    const inWater = state.mode === "dive" || state.mode === "cave";
    bubbles.forEach((b) => {
      b.visible = inWater;
      if (!inWater) return;
      b.position.y += b.userData.speed * dt;
      b.position.x += Math.sin(state.time + b.userData.drift) * 0.3 * dt;
      const tooHigh = state.mode === "cave" ? b.position.y > -6 : b.position.y > Math.min(-3, camera.position.y + 40);
      if (tooHigh || !bubblesInited) {
        if (state.mode === "cave") {
          resetBubble(b, new THREE.Vector3(0, 0, 0), 130, -84, -20);
        } else {
          resetBubble(b, camera.position, 70, camera.position.y - 40, Math.min(-4, camera.position.y + 20));
        }
      }
    });
  }

  // ---------------- Regions ----------------
  const FISH_BY_ID = {};
  FISH.forEach((f) => (FISH_BY_ID[f.id] = f));

  function regionAt(x, z) {
    if (Math.hypot(x - HOME_PORT.x, z - HOME_PORT.z) < HOME_REGION_RADIUS) return "limon";
    let best = 0, bd = Infinity;
    buoys.forEach((b, i) => {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  function regionName(r) {
    return r === "limon" ? "Aguas de Puerto Limón" : SEAS[r].name;
  }
  function regionCentre(r) {
    return r === "limon" ? { x: HOME_PORT.x, z: HOME_PORT.z } : { x: buoys[r].x, z: buoys[r].z };
  }

  // ---------------- Fish schools at the surface ----------------
  // Each school swims around its spot: fish circle under the water, the
  // surface ripples and now and then one leaps out. Legendary (mission) fish
  // glow gold under a beam of light so they can be spotted from far away.
  function pickSpecies(region) {
    const pool = FISH.filter((f) => !f.special && f.seas.includes(region));
    const w = pool.map((f) => 1 / Math.sqrt(f.value));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) return pool[i];
    }
    return pool[0];
  }

  function openWaterSpot(region, minD, maxD) {
    const c = regionCentre(region);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), d = rand(minD, maxD);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (islands.every((isl) => islandShoreDistance(isl, x, z) > 45)) return { x, z };
    }
    return { x: c.x + maxD, z: c.z };
  }

  const rippleGeo = new THREE.RingGeometry(0.85, 1, 28);
  rippleGeo.rotateX(-Math.PI / 2);
  const schools = [];

  function createSchool(region, special) {
    const group = new THREE.Group();
    mainScene.add(group);
    const s = {
      region, special: !!special, species: null, x: 0, z: 0, homeX: 0, homeZ: 0,
      heading: rand(0, Math.PI * 2), t: rand(0, 10), stock: 0, active: false, respawn: 0, hooked: false,
      group, fish: [], ripples: [], jump: null, jumpTimer: rand(1, 4), beam: null,
    };
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: special ? 0xffe38a : 0xeaf8ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
      group.add(r);
      s.ripples.push(r);
    }
    if (special) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 6, 110, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd76b, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })
      );
      beam.position.y = 55;
      group.add(beam);
      s.beam = beam;
    }
    schools.push(s);
    return s;
  }

  function stockSchool(s, species, pos) {
    s.species = species;
    s.x = s.homeX = pos.x;
    s.z = s.homeZ = pos.z;
    s.stock = s.special ? 1 : 3 + Math.floor(Math.random() * 3);
    s.active = true;
    s.hooked = false;
    s.jump = null;
    s.fish.forEach((f) => s.group.remove(f.mesh));
    s.fish = [];
    const n = s.special ? 3 : 5;
    const billed = ["pez_espada", "marlin_azul", "pez_vela"].includes(species.id);
    for (let i = 0; i < n; i++) {
      const mesh = ZMModels.buildFish(species.color, species.size * (s.special ? 2.2 : 1.6), {
        glow: s.special ? 0xffb020 : null,
        sail: species.id === "pez_vela" || species.id === "marlin_azul",
        bill: billed,
      });
      s.group.add(mesh);
      s.fish.push({ mesh, r: 3 + (i % 3) * 2.4, a: (i / n) * Math.PI * 2, dy: rand(0, 1) });
    }
  }

  function respawnSchool(s) {
    if (s.special) return;
    const home = s.region === "limon";
    stockSchool(s, pickSpecies(s.region), openWaterSpot(s.region, home ? 170 : 60, 430));
  }

  ["sardina", "pargo_rojo", "jurel", "robalo"].forEach((id) =>
    stockSchool(createSchool("limon"), FISH_BY_ID[id], openWaterSpot("limon", 170, 430))
  );
  SEAS.forEach((sea, i) => {
    for (let k = 0; k < SCHOOLS_PER_SEA; k++) respawnSchool(createSchool(i));
  });

  let missionSchool = null;
  function currentMission() {
    return MISSIONS[state.missionIndex] || null;
  }
  function missionWants(species) {
    const m = currentMission();
    return !!(m && state.mission && state.mission.status === "active" && m.fishId === species.id);
  }
  // Keeps the glowing legendary school in the world only while its mission is active.
  function syncMissionSchool() {
    const m = currentMission();
    const want = m && state.mission && state.mission.status === "active" && FISH_BY_ID[m.fishId].special ? FISH_BY_ID[m.fishId] : null;
    if (!want) {
      if (missionSchool) {
        missionSchool.active = false;
        missionSchool.group.visible = false;
      }
      return;
    }
    const region = want.seas[0];
    if (missionSchool && missionSchool.region !== region) {
      mainScene.remove(missionSchool.group);
      schools.splice(schools.indexOf(missionSchool), 1);
      missionSchool = null;
    }
    if (!missionSchool) missionSchool = createSchool(region, true);
    if (!missionSchool.active || missionSchool.species !== want) {
      const home = region === "limon";
      stockSchool(missionSchool, want, openWaterSpot(region, home ? 200 : 120, home ? 380 : 420));
    }
  }

  function nearestSchool(maxDist) {
    let best = null, bd = maxDist;
    schools.forEach((s) => {
      if (!s.active) return;
      const d = Math.hypot(s.x - boat.position.x, s.z - boat.position.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    });
    return best;
  }

  function updateSchools(dt) {
    const t = state.time;
    const surface = state.mode === "boat" || state.mode === "walk" || !state.started;
    schools.forEach((s) => {
      if (!s.active) {
        s.group.visible = false;
        if (!s.special && (s.respawn -= dt) <= 0) respawnSchool(s);
        return;
      }
      // wander, staying near home
      s.t += dt;
      s.heading += Math.sin(s.t * 0.3 + s.homeX) * 0.4 * dt;
      if (Math.hypot(s.homeX - s.x, s.homeZ - s.z) > (s.special ? 50 : 110)) {
        const want = Math.atan2(s.homeZ - s.z, s.homeX - s.x);
        s.heading += Math.sign(Math.sin(want - s.heading)) * 0.9 * dt;
      }
      const sp = s.hooked ? 0 : 3.2;
      s.x += Math.cos(s.heading) * sp * dt;
      s.z += Math.sin(s.heading) * sp * dt;
      s.group.position.set(s.x, 0, s.z);
      const far = Math.hypot(s.x - camera.position.x, s.z - camera.position.z) > (s.special ? 1600 : 700);
      s.group.visible = surface && !far;
      if (!s.group.visible) return;

      s.fish.forEach((f, i) => {
        if (s.jump && s.jump.fish === f) return;
        const a = f.a + t * (0.55 + (i % 2) * 0.15);
        const lx = Math.cos(a) * f.r, lz = Math.sin(a) * f.r;
        f.mesh.position.set(lx, waveHeight(s.x + lx, s.z + lz, t) - 1.3 - f.dy, lz);
        f.mesh.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0);
        ZMModels.swimFish(f.mesh, t, 1);
      });

      s.jumpTimer -= dt;
      if (!s.jump && s.jumpTimer <= 0 && s.fish.length) {
        const f = s.fish[Math.floor(Math.random() * s.fish.length)];
        s.jump = { fish: f, t: 0, dur: s.special ? 1.3 : 0.9, x0: f.mesh.position.x, z0: f.mesh.position.z, dir: rand(0, Math.PI * 2), h: s.special ? 7 : 4 };
        spawnSplash(new THREE.Vector3(s.x + f.mesh.position.x, 0, s.z + f.mesh.position.z));
      }
      if (s.jump) {
        const j = s.jump;
        j.t += dt;
        const k = Math.min(1, j.t / j.dur);
        const lx = j.x0 + Math.cos(j.dir) * 7 * k, lz = j.z0 + Math.sin(j.dir) * 7 * k;
        j.fish.mesh.position.set(lx, waveHeight(s.x + lx, s.z + lz, t) - 1 + Math.sin(Math.PI * k) * j.h, lz);
        j.fish.mesh.rotation.set(0, -j.dir, (0.5 - k) * 2.2);
        ZMModels.swimFish(j.fish.mesh, t, 2);
        if (k >= 1) {
          spawnSplash(new THREE.Vector3(s.x + lx, 0, s.z + lz));
          s.jump = null;
          s.jumpTimer = s.special ? rand(1.2, 2.5) : rand(2.5, 6);
        }
      }

      s.ripples.forEach((r, i) => {
        const k = (t * 0.45 + i * 0.5) % 1;
        r.scale.setScalar(2 + k * (s.special ? 12 : 8));
        r.material.opacity = (s.special ? 0.75 : 0.5) * (1 - k);
        r.position.y = waveHeight(s.x, s.z, t) + 0.25;
      });
      if (s.beam) s.beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.05;
    });
  }

  // ---------------- Whales ----------------
  // A pod per species and sea (humpbacks with a calf also visit Puerto Limón)
  // cruises around open water: they swim below the surface, come up to blow a
  // few times, sometimes breach, then dive again. The first sighting of each
  // species goes into the journal.
  const WHALE_SIGHT_RANGE = 130;
  const WHALE_ROAM = 150;
  const WHALE_VIEW_DIST = 1800;

  // spout and splash spray: a small pool of fading puffs
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  const puffs = [];
  for (let i = 0; i < 120; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    mainScene.add(m);
    puffs.push({ m, life: 0, max: 1, from: new THREE.Vector3(), move: new THREE.Vector3(), arc: false, size: 1 });
  }
  let puffCursor = 0;
  // The puff drifts by `move` over its life, easing out; with `arc` it rises
  // and falls back (splash spray) instead of hanging in the air (spout mist).
  function emitPuff(x, y, z, mx, my, mz, size, life, arc) {
    const p = puffs[puffCursor];
    puffCursor = (puffCursor + 1) % puffs.length;
    p.from.set(x, y, z);
    p.move.set(mx, my, mz);
    p.arc = !!arc;
    p.size = size;
    p.life = p.max = life;
    p.m.visible = true;
  }
  // column of mist from the blowhole; right whales blow a V
  function emitSpout(x, y, z, height, heading, vShape) {
    const sx = -Math.sin(heading), sz = Math.cos(heading);
    for (let i = 0; i < 9; i++) {
      const up = height * (0.3 + (i / 8) * 0.8);
      const lean = vShape ? (i % 2 ? 1 : -1) * up * 0.35 : rand(-0.08, 0.08) * up;
      emitPuff(x, y, z, sx * lean, up, sz * lean, height * (0.05 + (i / 8) * 0.07), rand(1.8, 2.4));
    }
  }
  function updatePuffs(dt) {
    puffs.forEach((p) => {
      if (!p.m.visible) return;
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        return;
      }
      const k = 1 - p.life / p.max;
      const ease = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
      p.m.position.copy(p.from).addScaledVector(p.move, p.arc ? k : ease);
      if (p.arc) p.m.position.y = p.from.y + p.move.y * 4 * k * (1 - k);
      p.m.scale.setScalar(p.size * (0.6 + k * 2));
      p.m.material.opacity = 0.9 * (1 - k * k);
    });
  }

  const whalePods = [];
  function createPod(species, region) {
    const limon = region === "limon";
    const home = openWaterSpot(region, limon ? 230 : 40, limon ? 330 : 180);
    const pod = {
      species, region, homeX: home.x, homeZ: home.z, x: home.x, z: home.z,
      heading: rand(0, Math.PI * 2), t: rand(0, 50), phaseT: 99,
      surfacing: Math.random() < 0.5, timer: rand(3, 10), members: [],
    };
    for (let i = 0; i < species.pod; i++) {
      const calf = !!species.calf && i === species.pod - 1 && i > 0;
      const sp = calf ? Object.assign({}, species, { length: species.length * 0.45 }) : species;
      const mesh = ZMModels.buildWhale(sp);
      mesh.rotation.order = "YZX"; // roll about the body, then pitch, then heading
      mainScene.add(mesh);
      const L = sp.length;
      pod.members.push({
        mesh, length: L, radius: mesh.userData.radius,
        // formation in the pod's frame: calves tuck in beside their mother
        fwd: calf ? species.length * 0.1 : -species.length * 0.35 * i,
        side: calf ? mesh.userData.radius * 1.4 + pod.members[0].radius : (i % 2 ? 1 : -1) * species.length * 0.4 * Math.ceil(i / 2),
        lag: i * 0.8, // members surface one after another
        depthK: pod.surfacing ? 1 : 0, pitch: 0, y: 0,
        spoutTimer: rand(0.5, 3), breach: null,
      });
    }
    whalePods.push(pod);
  }
  WHALES.forEach((w) => w.seas.forEach((r) => createPod(w, r)));

  function startBreach(m) {
    whaleSplash(m.mesh.position.x, m.mesh.position.z, m); // bursting out
    m.breach = { t: 0, dur: 1.6 + m.length * 0.04, h: m.length * 0.55, roll: m.mesh.userData.phase % 2 < 1 ? 1 : -1 };
  }
  function whaleSplash(x, z, m) {
    const r = m.radius;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), d = rand(0, m.length * 0.4);
      emitWake(x + Math.cos(a) * d, z + Math.sin(a) * d, r * rand(0.5, 1), rand(1.5, 2.5));
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2), d = rand(0.5, 1.5) * r;
      emitPuff(x, 0.5, z, Math.cos(a) * d, rand(0.8, 2) * r, Math.sin(a) * d, r * 0.3, rand(0.9, 1.4), true);
    }
    spawnSplash(new THREE.Vector3(x, 0, z));
  }

  function sightWhale(species) {
    if (!state.whalesSeen.has(species.id)) {
      state.whalesSeen.add(species.id);
      saveGame();
      openDiscovery({ name: "🐋 " + species.name, fact: species.fact, color: species.color });
    } else if (state.whaleBannerCooldown <= 0) {
      showBanner(`🐋 ¡${species.name} a la vista!`);
    }
    state.whaleBannerCooldown = 60;
  }

  // Pushes the boat out of a surfaced whale (the body as a capsule).
  function whaleBoatCollision(m, heading) {
    const hx = Math.cos(heading), hz = Math.sin(heading);
    const p = m.mesh.position;
    const dx = boat.position.x - p.x, dz = boat.position.z - p.z;
    const along = THREE.MathUtils.clamp(dx * hx + dz * hz, -m.length * 0.4, m.length * 0.4);
    const cx = p.x + hx * along, cz = p.z + hz * along;
    const ex = boat.position.x - cx, ez = boat.position.z - cz;
    const d = Math.hypot(ex, ez), min = m.radius + BOAT_COLLIDE_RADIUS;
    if (d < min && d > 0.001) {
      boat.position.x = cx + (ex / d) * min;
      boat.position.z = cz + (ez / d) * min;
      boatState.speed *= 0.6;
    }
  }

  function updateWhales(dt) {
    const t = state.time;
    state.whaleBannerCooldown = Math.max(0, state.whaleBannerCooldown - dt);
    const playing = state.started && !state.modalOpen && !state.journalOpen && !state.won;
    const viewer = state.mode === "walk" ? player.pos : state.mode === "boat" ? boat.position : camera.position;
    whalePods.forEach((pod) => {
      const sp = pod.species;
      pod.t += dt;
      pod.phaseT += dt;
      // surface / dive cycle
      pod.timer -= dt;
      if (pod.timer <= 0) {
        pod.surfacing = !pod.surfacing;
        pod.phaseT = 0;
        pod.timer = pod.surfacing ? rand(10, 16) : rand(12, 22);
        if (!pod.surfacing && sp.shape !== "beluga" && Math.random() < (sp.shape === "jorobada" ? 0.6 : 0.3)) {
          const m = pod.members[Math.floor(Math.random() * pod.members.length)];
          if (!m.breach && m.depthK > 0.9) startBreach(m);
        }
      }
      // wander near home, steering clear of islands
      pod.heading += Math.sin(pod.t * 0.13 + pod.homeX) * 0.12 * dt;
      if (Math.hypot(pod.homeX - pod.x, pod.homeZ - pod.z) > WHALE_ROAM) {
        const want = Math.atan2(pod.homeZ - pod.z, pod.homeX - pod.x);
        pod.heading += Math.sign(Math.sin(want - pod.heading)) * 0.25 * dt;
      }
      const ahead = sp.length + 50;
      const lx = pod.x + Math.cos(pod.heading) * ahead, lz = pod.z + Math.sin(pod.heading) * ahead;
      for (const isl of islands) {
        if (islandShoreDistance(isl, lx, lz) < 30) {
          const away = Math.atan2(pod.z - isl.z, pod.x - isl.x);
          pod.heading += Math.sign(Math.sin(away - pod.heading) || 1) * 0.6 * dt;
          break;
        }
      }
      const speed = pod.surfacing ? 4 : 6.5;
      pod.x += Math.cos(pod.heading) * speed * dt;
      pod.z += Math.sin(pod.heading) * speed * dt;

      const far = Math.hypot(pod.x - camera.position.x, pod.z - camera.position.z) > WHALE_VIEW_DIST;
      const hx = Math.cos(pod.heading), hz = Math.sin(pod.heading);
      pod.members.forEach((m) => {
        m.mesh.visible = !far && state.mode !== "cave";
        if (!m.mesh.visible) return;
        const p = m.mesh.position;
        p.x = pod.x + hx * m.fwd - hz * m.side;
        p.z = pod.z + hz * m.fwd + hx * m.side;
        const surfaceY = waveHeight(p.x, p.z, t) - m.radius * 0.15; // the back breaks the surface
        const deepY = -m.radius - (sp.shape === "beluga" ? 7 : 14);
        const want = (pod.phaseT > m.lag) === pod.surfacing ? 1 : 0; // members follow the leader up and down
        m.depthK += THREE.MathUtils.clamp(want - m.depthK, -0.18 * dt, 0.18 * dt);
        const prevY = m.y;
        let roll = 0;
        if (m.breach) {
          const b = m.breach;
          b.t += dt;
          const k = Math.min(1, b.t / b.dur);
          m.y = surfaceY - m.radius + Math.sin(Math.PI * k) * b.h;
          m.pitch = 1.25 * (1 - 2 * k);
          roll = b.roll * k * (sp.shape === "jorobada" ? 1.6 : 0.6);
          if (k >= 1) {
            whaleSplash(p.x + hx * m.length * 0.3, p.z + hz * m.length * 0.3, m);
            m.breach = null;
            m.depthK = 1;
          }
        } else {
          m.y = THREE.MathUtils.lerp(deepY, surfaceY, THREE.MathUtils.smoothstep(m.depthK, 0, 1));
          const target = THREE.MathUtils.clamp(((m.y - prevY) / Math.max(dt, 1e-3)) * 0.12, -0.45, 0.35);
          m.pitch += (target - m.pitch) * Math.min(1, dt * 2);
        }
        p.y = m.y;
        m.mesh.rotation.set(roll, -pod.heading, m.pitch);
        ZMModels.swimWhale(m.mesh, t, m.breach ? 2.5 : pod.surfacing ? 0.6 : 1.1);

        const atSurface = m.breach || m.depthK > 0.85;
        // blow while at the surface
        if (atSurface && !m.breach) {
          m.spoutTimer -= dt;
          if (m.spoutTimer <= 0) {
            m.spoutTimer = rand(3.5, 6);
            const bh = m.mesh.userData.blowhole * m.length * 0.5;
            emitSpout(p.x + hx * bh, surfaceY + m.radius * 0.8, p.z + hz * bh, Math.max(4, m.length * 0.35), pod.heading, sp.shape === "franca");
          }
        }
        if (atSurface && state.mode === "boat") whaleBoatCollision(m, pod.heading);

        if (playing && state.mode !== "cave") {
          const d = Math.hypot(p.x - viewer.x, p.z - viewer.z) - m.length * 0.5;
          const seen = state.mode === "dive" ? d < 70 && Math.abs(p.y - viewer.y) < 60 : atSurface && d < WHALE_SIGHT_RANGE;
          if (seen) sightWhale(sp);
        }
      });
    });
    updatePuffs(dt);
  }

  // ---------------- Fishing ----------------
  const bobber = new THREE.Group();
  bobber.add(
    new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8302c, roughness: 0.4 })),
    new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }))
  );
  bobber.visible = false;
  mainScene.add(bobber);
  const LINE_PTS = 16;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(LINE_PTS * 3), 3));
  const fishingLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.85 }));
  fishingLine.frustumCulled = false;
  fishingLine.visible = false;
  mainScene.add(fishingLine);
  const tipWorld = new THREE.Vector3();

  function coolerCapacity() {
    return UPGRADES.cooler.capacity[state.upgrades.cooler];
  }

  function handleFishKey() {
    if (!state.started || state.modalOpen || state.journalOpen || state.won || state.mode !== "boat") return;
    if (state.fishing) fishingPress();
    else startFishing();
  }

  function startFishing() {
    const s = nearestSchool(FISH_CAST_RANGE);
    if (!s) {
      showBanner("No hay peces cerca: busca agua que burbujea 🐟");
      return;
    }
    if (Math.abs(boatState.speed) > FISH_MAX_BOAT_SPEED) {
      showBanner("Frena el barco para lanzar la caña");
      return;
    }
    if (!missionWants(s.species) && state.cooler.length >= coolerCapacity()) {
      showBanner("🧊 ¡Nevera llena! Vende tu pesca en Puerto Limón");
      return;
    }
    const dx = s.x - boat.position.x, dz = s.z - boat.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const reach = Math.max(14, Math.min(d, 30));
    const target = new THREE.Vector3(boat.position.x + (dx / d) * reach, 0, boat.position.z + (dz / d) * reach);
    boatModel.fishingRod.visible = true;
    boat.updateMatrixWorld(true);
    boatModel.rodTip.getWorldPosition(tipWorld);
    state.fishing = { phase: "cast", timer: 0, school: s, target, pos: tipWorld.clone(), progress: 0, tension: 0, surge: 0, surgeTimer: 1 };
    state.cruising = false;
    state.cruiseTimer = 0;
    bobber.visible = fishingLine.visible = true;
    fishingUI.classList.remove("hidden");
    fishingBarsEl.classList.add("hidden");
    fishingStatusEl.textContent = "Lanzando la caña...";
  }

  function stopFishing(msg) {
    if (!state.fishing) return;
    state.fishing.school.hooked = false;
    state.fishing = null;
    boatModel.fishingRod.visible = false;
    bobber.visible = fishingLine.visible = false;
    fishingUI.classList.add("hidden");
    if (msg) showBanner(msg);
  }

  function fishingPress() {
    const f = state.fishing;
    if (f.phase === "wait") {
      f.timer += 1.2;
      fishingStatusEl.textContent = "¡Muy pronto! Espera a que se hunda el corcho...";
    } else if (f.phase === "bite") {
      f.phase = "reel";
      f.progress = 0.25;
      f.tension = 0.3;
      f.surge = 0;
      f.surgeTimer = 0.8;
      f.school.hooked = true;
      fishingBarsEl.classList.remove("hidden");
    }
  }

  function updateFishing(dt) {
    const f = state.fishing;
    if (!f) return;
    if (!f.school.active) {
      stopFishing("Los peces se fueron");
      return;
    }
    const t = state.time;
    const sp = f.school.species;
    boat.updateMatrixWorld(true);
    boatModel.rodTip.getWorldPosition(tipWorld);
    const waterAt = (x, z) => waveHeight(x, z, t);

    if (f.phase === "cast") {
      f.timer += dt;
      const k = Math.min(1, f.timer / 0.7);
      f.pos.lerpVectors(tipWorld, f.target, k);
      f.pos.y = THREE.MathUtils.lerp(tipWorld.y, waterAt(f.target.x, f.target.z), k) + Math.sin(Math.PI * k) * 6;
      if (k >= 1) {
        f.phase = "wait";
        f.timer = sp.special ? rand(2.5, 5) : rand(1.5, 4);
        fishingStatusEl.textContent = "Espera a que pique... 🤫";
        spawnSplash(f.target);
      }
    } else if (f.phase === "wait") {
      f.timer -= dt;
      f.pos.set(f.target.x, waterAt(f.target.x, f.target.z) + 0.1, f.target.z);
      if (f.timer <= 0) {
        f.phase = "bite";
        f.timer = 1.0 + state.upgrades.rod * 0.35;
        fishingStatusEl.textContent = "❗ ¡PICA! Pulsa R";
        spawnSplash(f.target);
      }
    } else if (f.phase === "bite") {
      f.timer -= dt;
      f.pos.set(f.target.x, waterAt(f.target.x, f.target.z) - 0.4 - Math.abs(Math.sin(t * 18)) * 0.5, f.target.z);
      if (f.timer <= 0) {
        f.phase = "wait";
        f.timer = rand(1.5, 3.5);
        fishingStatusEl.textContent = "Se soltó... espera otra picada";
      }
    } else if (f.phase === "reel") {
      const reeling = keys["KeyR"] || touch.reel || state.mouseDown;
      // the fish alternates calm moments with strong runs
      f.surgeTimer -= dt;
      if (f.surgeTimer <= 0) {
        if (f.surge > 0) {
          f.surge = 0;
          f.surgeTimer = rand(0.8, 2.0) - sp.pull * 0.5;
        } else {
          f.surge = rand(0.6, 1) * sp.pull;
          f.surgeTimer = rand(0.4, 0.9);
        }
      }
      const gain = [1, 0.8, 0.65][state.upgrades.rod];
      if (reeling) f.tension += (0.45 + f.surge * 1.2) * gain * dt;
      else f.tension -= (0.6 - f.surge * 0.5) * dt;
      f.tension = Math.max(0, f.tension);
      f.progress += reeling ? (0.26 - sp.pull * 0.1) * (1 - f.surge * 0.6) * dt : -(0.04 + f.surge * 0.12) * dt;
      tensionFillEl.style.width = Math.min(100, f.tension * 100) + "%";
      tensionFillEl.classList.toggle("danger", f.tension > 0.75);
      progressFillEl.style.width = Math.max(0, Math.min(1, f.progress)) * 100 + "%";
      fishingStatusEl.textContent =
        f.surge > 0.25 ? "¡Tira fuerte! Suelta un poco para no romper la línea" : reeling ? "Recogiendo..." : "Mantén R (o 🎣 / clic) para recoger";
      // the bobber is dragged around by the fish and pulled toward the boat
      const k = Math.max(0, Math.min(1, f.progress)) * 0.7;
      const px = THREE.MathUtils.lerp(f.target.x, boat.position.x, k) + Math.sin(t * 3.1) * 4 * (0.3 + f.surge);
      const pz = THREE.MathUtils.lerp(f.target.z, boat.position.z, k) + Math.cos(t * 2.3) * 4 * (0.3 + f.surge);
      f.pos.set(px, waterAt(px, pz) - 0.3, pz);
      if (f.tension >= 1) {
        stopFishing("💥 ¡Se rompió la línea! El pez escapó");
        return;
      }
      if (f.progress <= 0) {
        stopFishing("El pez se escapó 🐟💨");
        return;
      }
      if (f.progress >= 1) {
        landFish(f);
        return;
      }
    }

    // rod swings toward the bobber and bends back under tension
    const local = boat.worldToLocal(f.pos.clone());
    const rodEl = boatModel.fishingRod;
    rodEl.rotation.set(-f.tension * 0.35, Math.atan2(local.x - rodEl.position.x, local.z - rodEl.position.z), 0, "YXZ");
    rodEl.updateMatrixWorld(true);
    boatModel.rodTip.getWorldPosition(tipWorld);
    bobber.position.copy(f.pos);
    const sag = f.phase === "reel" ? (1 - Math.min(1, f.tension)) * 2 : f.phase === "cast" ? 0 : 3;
    const arr = lineGeo.attributes.position;
    for (let i = 0; i < LINE_PTS; i++) {
      const k = i / (LINE_PTS - 1);
      arr.setXYZ(
        i,
        THREE.MathUtils.lerp(tipWorld.x, f.pos.x, k),
        THREE.MathUtils.lerp(tipWorld.y, f.pos.y + 0.4, k) - Math.sin(Math.PI * k) * sag,
        THREE.MathUtils.lerp(tipWorld.z, f.pos.z, k)
      );
    }
    arr.needsUpdate = true;
  }

  function landFish(f) {
    const sp = f.school.species;
    const kg = (sp.size * sp.size * rand(1.2, 3.2) * (sp.special ? 12 : 1)).toFixed(1);
    state.fishLog[sp.id] = (state.fishLog[sp.id] || 0) + 1;
    let note;
    if (missionWants(sp)) {
      const m = currentMission();
      state.mission.progress = (state.mission.progress || 0) + 1;
      if (state.mission.progress >= m.count) {
        state.mission.status = "done";
        note = "🎯 ¡Misión cumplida! Llévaselo a Doña Marisol en Puerto Limón";
      } else {
        note = `🎯 Misión: ${state.mission.progress}/${m.count}`;
      }
    } else {
      const value = Math.round(sp.value * rand(0.85, 1.25));
      state.cooler.push({ id: sp.id, value });
      note = `🧊 A la nevera · vale ${value} 🪙 en el mercado`;
    }
    f.school.stock--;
    if (f.school.stock <= 0) {
      f.school.active = false;
      f.school.respawn = SCHOOL_RESPAWN;
    }
    stopFishing();
    showCatch(sp, kg, note);
    refreshCounters();
    saveGame();
  }

  function showCatch(sp, kg, note) {
    showCatchLike("🎣 ¡Buena pesca!", (sp.special ? "⭐ " : "") + sp.name, sp.color, kg + " kg<br>" + note, sp.fact);
  }

  function showCatchLike(title, name, color, detail, fact) {
    catchCard.innerHTML =
      `<div class="catch-title">${title}</div>` +
      `<div class="catch-name" style="color:${color}">${name}</div>` +
      `<div class="catch-note">${detail}</div>` +
      (fact ? `<div class="catch-fact">${fact}</div>` : "");
    catchCard.classList.add("show");
    clearTimeout(catchCard._t);
    catchCard._t = setTimeout(() => catchCard.classList.remove("show"), fact ? 7000 : 3500);
  }

  // ---------------- Walking on islands ----------------
  const player = {
    mesh: ZMModels.buildPerson({ shirt: 0x2f8fd8, bottom: "shorts", bottomColor: 0xc8b48a, skin: 0xc68a5e, hair: "short", hairColor: 0x3a2412, hat: 0xe8d28a }),
    pos: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
  };
  player.mesh.visible = false;
  mainScene.add(player.mesh);

  // ---------------- Puerto Limón's people ----------------
  // Everyone has a speech bubble. Folks at their posts greet you as you walk
  // up; strollers wander between spots and stop to chat with each other; the
  // kids play a mejenga (street football) you can join by kicking the ball.
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const people = [];
  function addPerson(look, x, z, ry, kind) {
    const m = ZMModels.buildPerson(look);
    m.position.set(x, ZMIslands.groundAt(homeIsland, x, z), z);
    m.rotation.y = ry;
    mainScene.add(m);
    const bubble = ZMModels.buildBubble();
    mainScene.add(bubble);
    const p = { m, kind, homeRy: ry, bubble, sayT: 0, greetCD: rand(0, 5), chatCD: rand(5, 15), busy: 0, speed: 0, faceYaw: null, scale: look.kid ? 0.6 : 1 };
    people.push(p);
    return p;
  }
  function say(p, text, time) {
    p.bubble.userData.setText(text);
    p.sayT = time || 3;
    p.m.userData.talk = Math.min(p.sayT, 2.2);
  }
  const yawTo = (from, x, z) => Math.atan2(-(x - from.x), -(z - from.z));

  const posts = {};
  homeIsland.npcs.forEach((n) => (posts[n.id] = addPerson(n.look, n.x, n.z, n.ry, "post")));
  const marisol = posts.marisol.m;
  const fishmonger = posts.fishmonger.m;

  homeIsland.walkers.forEach((look, i) => {
    const wp = homeIsland.waypoints[(i * 3) % homeIsland.waypoints.length];
    const p = addPerson(look, wp.x, wp.z, 0, "walker");
    p.target = homeIsland.waypoints[(i * 3 + 1) % homeIsland.waypoints.length];
    p.wait = 0;
  });

  const field = homeIsland.field;
  const ball = { mesh: ZMModels.buildBall(), x: field.cx, z: field.cz, vx: 0, vz: 0, pause: 0 };
  mainScene.add(ball.mesh);
  const kids = homeIsland.kids.map((k, i) => {
    const p = addPerson(k.look, field.cx + (k.team ? 4 : -4), field.cz + (i % 2 ? 3 : -3), k.team ? Math.PI / 2 : -Math.PI / 2, "kid");
    p.team = k.team;
    p.kickCD = 0;
    return p;
  });

  const markNew = ZMModels.label("!", "#ffd84a");
  const markDone = ZMModels.label("?", "#7cffcb");
  const markSell = ZMModels.label("$", "#7cffcb");
  mainScene.add(markNew, markDone, markSell);

  function turnToward(p, yaw, dt) {
    const d = ((yaw - p.m.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.m.rotation.y += d * Math.min(1, dt * 6);
  }

  function moveOnIsland(p, dx, dz, speed, dt) {
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const pos = p.m.position;
    pos.x += (dx / d) * speed * dt;
    pos.z += (dz / d) * speed * dt;
    pushOutOfColliders(homeIsland, pos, 0.5);
    pos.y = ZMIslands.groundAt(homeIsland, pos.x, pos.z);
  }

  function goal(team) {
    ball.pause = 2.2;
    kids.forEach((k) => say(k, k.team === team ? pick(TICO.goal) : "¡Diay, no!", 2.2));
  }

  function updateSoccer(dt) {
    const t = state.time;
    if (ball.pause > 0) {
      ball.pause -= dt;
      if (ball.pause <= 0) {
        ball.x = field.cx;
        ball.z = field.cz;
        ball.vx = ball.vz = 0;
      }
    } else {
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      const drag = Math.exp(-1.1 * dt);
      ball.vx *= drag;
      ball.vz *= drag;
      if (ball.z < field.minZ || ball.z > field.maxZ) {
        ball.z = Math.max(field.minZ, Math.min(field.maxZ, ball.z));
        ball.vz *= -0.7;
      }
      const inMouth = Math.abs(ball.z - field.cz) < field.goalHalf;
      if (ball.x > field.maxX) {
        if (inMouth) goal(0);
        ball.x = field.maxX;
        ball.vx *= -0.6;
      } else if (ball.x < field.minX) {
        if (inMouth) goal(1);
        ball.x = field.minX;
        ball.vx *= -0.6;
      }
    }
    ball.mesh.position.set(ball.x, field.y + 0.4, ball.z);
    ball.mesh.rotation.z -= (ball.vx / 0.4) * dt;
    ball.mesh.rotation.x += (ball.vz / 0.4) * dt;

    // each team: the kid closest to the ball chases it, the other holds back
    [0, 1].forEach((team) => {
      const mine = kids.filter((k) => k.team === team);
      const dist = (k) => Math.hypot(k.m.position.x - ball.x, k.m.position.z - ball.z);
      mine.sort((a, b) => dist(a) - dist(b));
      const attackX = team === 0 ? field.maxX : field.minX;
      const ownX = team === 0 ? field.minX : field.maxX;
      mine.forEach((k, idx) => {
        k.kickCD -= dt;
        if (k.busy > 0) {
          k.busy -= dt;
          k.speed = 0;
          return;
        }
        let tx, tz;
        if (idx === 0 && ball.pause <= 0) {
          // approach from behind the ball, relative to the goal being attacked
          const gx = attackX - ball.x, gz = field.cz - ball.z;
          const gl = Math.hypot(gx, gz) || 1;
          tx = ball.x - (gx / gl) * 0.7;
          tz = ball.z - (gz / gl) * 0.7;
        } else {
          tx = (ball.x + ownX) / 2;
          tz = field.cz + (ball.z - field.cz) * 0.5 + (idx ? 3 : 0);
        }
        const dx = tx - k.m.position.x, dz = tz - k.m.position.z;
        const d = Math.hypot(dx, dz);
        k.speed = d > 0.4 ? Math.min(5.5, d * 3) : 0;
        if (k.speed > 0) {
          moveOnIsland(k, dx, dz, k.speed, dt);
          turnToward(k, Math.atan2(-dx, -dz), dt);
        } else turnToward(k, yawTo(k.m.position, ball.x, ball.z), dt);
        if (idx === 0 && ball.pause <= 0 && k.kickCD <= 0 && dist(k) < 1.1) {
          const gx = attackX - ball.x, gz = field.cz + rand(-2.5, 2.5) - ball.z;
          const gl = Math.hypot(gx, gz) || 1;
          const power = rand(6, 11);
          ball.vx = (gx / gl) * power;
          ball.vz = (gz / gl) * power;
          k.kickCD = 0.7;
          k.m.userData.kick = 0.3;
          if (Math.random() < 0.3) say(k, pick(TICO.kids), 1.8);
        }
      });
    });

    // the explorer can join in
    if (state.mode === "walk" && state.island === homeIsland && ball.pause <= 0) {
      const dx = ball.x - player.pos.x, dz = ball.z - player.pos.z;
      if (Math.hypot(dx, dz) < 1.4) {
        const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
        const power = Math.max(8, Math.abs(player.speed) + 5);
        ball.vx = fx * power;
        ball.vz = fz * power;
        player.mesh.userData.kick = 0.3;
        if (Math.random() < 0.5) say(kids[Math.floor(Math.random() * kids.length)], pick(["¡Qué tuanis, señor!", "¡Pásela, mae!", "¡Juega bien!"]), 2);
      }
    }
  }

  function updateWalkers(dt) {
    const walkers = people.filter((p) => p.kind === "walker");
    walkers.forEach((p) => {
      p.chatCD -= dt;
      if (p.busy > 0) {
        p.busy -= dt;
        p.speed = 0;
        if (p.faceYaw !== null) turnToward(p, p.faceYaw, dt);
        return;
      }
      if (p.wait > 0) {
        p.wait -= dt;
        p.speed = 0;
        return;
      }
      const dx = p.target.x - p.m.position.x, dz = p.target.z - p.m.position.z;
      if (Math.hypot(dx, dz) < 1.5) {
        p.wait = rand(1, 4);
        p.target = pick(homeIsland.waypoints);
        return;
      }
      p.speed = 3.2;
      moveOnIsland(p, dx, dz, p.speed, dt);
      turnToward(p, Math.atan2(-dx, -dz), dt);
    });
    // two strollers meeting stop for a chat
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i], b = walkers[j];
        if (a.busy > 0 || b.busy > 0 || a.chatCD > 0 || b.chatCD > 0) continue;
        if (a.m.position.distanceTo(b.m.position) > 4) continue;
        const [lineA, lineB] = pick(TICO.chats);
        a.busy = b.busy = 6.5;
        a.chatCD = b.chatCD = rand(20, 35);
        a.faceYaw = yawTo(a.m.position, b.m.position.x, b.m.position.z);
        b.faceYaw = yawTo(b.m.position, a.m.position.x, a.m.position.z);
        say(a, lineA, 3);
        setTimeout(() => say(b, lineB, 3), 3000);
      }
    }
  }

  // Level of detail: far islands keep only their terrain; the town crowd sleeps when nobody is around.
  function updateDetail() {
    const c = camera.position;
    const diving = state.mode === "dive" || state.mode === "cave";
    islands.forEach((isl) => {
      const near = !diving && Math.hypot(c.x - isl.x, c.z - isl.z) < 650 + isl.r;
      const kids = isl.mesh.children;
      for (let i = 1; i < kids.length; i++) kids[i].visible = near;
    });
    const town = !diving && Math.hypot(c.x - homeIsland.x, c.z - homeIsland.z) < 450;
    people.forEach((p) => {
      p.m.visible = town;
      if (!town) p.bubble.visible = false;
    });
    ball.mesh.visible = town;
    return town;
  }

  function updateNpcs(dt) {
    const t = state.time;
    if (!updateDetail()) {
      markNew.visible = markDone.visible = markSell.visible = false;
      return;
    }
    const onHome = state.mode === "walk" && state.island === homeIsland;
    updateWalkers(dt);
    updateSoccer(dt);
    people.forEach((p) => {
      p.greetCD -= dt;
      if (p.sayT > 0) {
        p.sayT -= dt;
        if (p.sayT <= 0) p.bubble.userData.setText(null);
      }
      const near = onHome && p.m.position.distanceTo(player.pos) < 7;
      if (near && p.greetCD <= 0 && p.sayT <= 0 && !(p.kind === "walker" && p.busy > 0)) {
        say(p, pick(p.kind === "kid" ? TICO.kidGreetings : TICO.greetings), 3);
        p.m.userData.wave = 2;
        p.greetCD = rand(25, 40);
        if (p.kind === "walker") {
          p.busy = 3;
          p.faceYaw = yawTo(p.m.position, player.pos.x, player.pos.z);
        }
      }
      if (p.kind === "post") turnToward(p, near ? yawTo(p.m.position, player.pos.x, player.pos.z) : p.homeRy, dt);
      ZMModels.animatePerson(p.m, dt, p.speed / p.scale, t + p.homeRy);
      p.bubble.position.set(p.m.position.x, p.m.position.y + (p.kind === "kid" ? 2.6 : 3.7), p.m.position.z);
    });
    const bob = Math.sin(t * 3) * 0.3;
    markNew.position.set(marisol.position.x, marisol.position.y + 4.6 + bob, marisol.position.z);
    markDone.position.copy(markNew.position);
    markSell.position.set(fishmonger.position.x, fishmonger.position.y + 4.6 + bob, fishmonger.position.z);
    const talking = (p) => p.sayT > 0;
    markNew.visible = !!currentMission() && !state.mission && !talking(posts.marisol);
    markDone.visible = !!(state.mission && state.mission.status === "done") && !talking(posts.marisol);
    markSell.visible = state.cooler.length > 0 && !talking(posts.fishmonger);
  }

  // people are solid for the explorer too
  function pushOutOfPeople(pos) {
    if (state.island !== homeIsland) return;
    people.forEach((p) => {
      const dx = pos.x - p.m.position.x, dz = pos.z - p.m.position.z;
      const d = Math.hypot(dx, dz), min = 0.5 + 0.5 * p.scale;
      if (d < min && d > 0.001) {
        pos.x = p.m.position.x + (dx / d) * min;
        pos.z = p.m.position.z + (dz / d) * min;
      }
    });
  }

  function talkChema() {
    const who = "👴🏿 Tata Chema, pescador de toda la vida";
    const found = state.mythics.size;
    if (!state.atlantisKnown) {
      openDialog(
        who,
        "<p>¡Upe, mae! Venga, siéntese un ratito. <i>Mekatelyu</i> una historia que me contaba mi abuelo...</p>" +
          "<p>Al este, pasando el Atlántico, el fondo se hunde en una fosa muy honda. Allá duerme la <b>Atlántida</b>, una ciudad de mármol con tesoros míticos: el tridente de Poseidón, una corona de oricalco...</p>" +
          "<p>Pero ojo: está a más de <b>260 metros</b>. Con equipo básico ni lo intente; en el Taller le venden un <b>traje abisal</b>.</p>" +
          "<p class='dialog-tip'>Y diay, en todo el fondo del mar hay cofres hundidos y hasta barcos piratas naufragados. ¡Bucee donde quiera!</p>",
        [
          {
            label: "¡Qué chiva! Voy a buscarla",
            primary: true,
            onClick: () => {
              state.atlantisKnown = true;
              saveGame();
              showBanner("🔱 La Atlántida quedó marcada en tu radar");
            },
          },
        ]
      );
    } else {
      const done = found >= MYTHIC_TREASURES.length;
      openDialog(
        who,
        done
          ? "<p>¡Diay, mae! ¡Encontró todos los tesoros de la Atlántida! Ni mi abuelo lo creería. ¡Pura vida!</p>"
          : `<p>¿Cómo le va con la Atlántida? Lleva <b>${found}/${MYTHIC_TREASURES.length}</b> tesoros míticos.</p><p>Busque el remolino verde en el mar (🔱 en el radar) y bucee bien hondo. Los sellos atlantes se abren con la cabeza, no con fuerza.</p>`,
        [{ label: "¡Pura vida, Tata!", primary: true }]
      );
    }
  }

  function landingIsland() {
    if (Math.abs(boatState.speed) > 14) return null;
    let best = null, bd = LAND_RANGE;
    islands.forEach((isl) => {
      let d = islandShoreDistance(isl, boat.position.x, boat.position.z);
      isl.platforms.forEach((p) => {
        if (p.solid) d = Math.min(d, rectDistance(p, boat.position.x, boat.position.z) - 4);
      });
      if (d < bd) {
        bd = d;
        best = isl;
      }
    });
    return best;
  }

  function rectDistance(p, x, z) {
    const dx = Math.max(p.minX - x, 0, x - p.maxX);
    const dz = Math.max(p.minZ - z, 0, z - p.maxZ);
    return Math.hypot(dx, dz);
  }

  function walkable(isl, x, z) {
    if (ZMIslands.groundAt(isl, x, z) < 0.6) return false;
    if (isl.lava && Math.hypot(x - isl.lava.x, z - isl.lava.z) < isl.lava.r + 1) return false;
    return true;
  }

  function pushOutOfColliders(isl, pos, r) {
    for (const c of isl.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 0.001) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  function landOnIsland(isl) {
    const b = boat.position;
    let x, z;
    const pier = isl.platforms.find((p) => p.solid && rectDistance(p, b.x, b.z) < 20);
    if (pier) {
      x = Math.max(pier.minX + 1, Math.min(pier.maxX - 1, b.x));
      z = Math.max(pier.minZ + 3, Math.min(pier.maxZ - 1, b.z));
    } else {
      const dir = new THREE.Vector3(isl.x - b.x, 0, isl.z - b.z).normalize();
      const p = b.clone();
      for (let i = 0; i < 400; i++) {
        p.addScaledVector(dir, 0.5);
        if (walkable(isl, p.x, p.z) && ZMIslands.groundAt(isl, p.x, p.z) > 0.9) break;
      }
      p.addScaledVector(dir, 1.5);
      x = p.x;
      z = p.z;
    }
    state.cruising = false;
    state.cruiseTimer = 0;
    enterWalk(isl, x, z, yawToward(b, new THREE.Vector3(isl.x, 0, isl.z)));
  }

  function enterWalk(isl, x, z, yaw, silent) {
    stopFishing();
    state.mode = "walk";
    state.island = isl;
    state.landingPoint = { x, z };
    player.pos.set(x, ZMIslands.groundAt(isl, x, z), z);
    player.yaw = yaw;
    player.speed = 0;
    player.mesh.visible = true;
    captain.visible = false;
    boatState.speed = 0;
    camLookInit = false;
    setSurface();
    updateHint();
    updateTouchUI();
    if (!silent) showBanner("🏝 " + isl.name);
  }

  // Back aboard the boat.
  function exitWalk(silent) {
    state.mode = "boat";
    state.island = null;
    state.landingPoint = null;
    state.cooldown = 0.4;
    player.mesh.visible = false;
    captain.visible = true;
    camLookInit = false;
    setSurface();
    updateHint();
    updateTouchUI();
    if (!silent) showBanner("⚓ ¡A navegar!");
  }

  function walkTarget() {
    const isl = state.island, p = player.pos;
    const lp = state.landingPoint;
    if (Math.hypot(p.x - boat.position.x, p.z - boat.position.z) < EMBARK_RANGE || (lp && Math.hypot(p.x - lp.x, p.z - lp.z) < 5)) {
      return { kind: "boat", label: "subir al barco", icon: "🚤" };
    }
    if (isl.chest && !state.chestsOpened.has(isl.index) && Math.hypot(p.x - isl.chest.x, p.z - isl.chest.z) < 4) {
      return { kind: "chest", label: "abrir el cofre", icon: "🧰" };
    }
    for (const poi of isl.pois) {
      if (Math.hypot(p.x - poi.x, p.z - poi.z) < poi.r) return { kind: poi.id, label: poi.label, icon: "💬" };
    }
    return null;
  }

  function walkInteract() {
    const t = walkTarget();
    if (!t) showBanner(state.island.home ? "Busca a Doña Marisol, el mercado o el taller" : "Explora la isla: hay un cofre escondido 🧰");
    else if (t.kind === "boat") exitWalk();
    else if (t.kind === "chest") openIslandChest(state.island);
    else if (t.kind === "missions") talkMarisol();
    else if (t.kind === "market") talkMarket();
    else if (t.kind === "shop") talkShop();
    else if (t.kind === "legend") talkChema();
  }

  function openIslandChest(isl) {
    const reward = 25 + Math.round(hash(isl.index, 5) * 35);
    state.chestsOpened.add(isl.index);
    state.coins += reward;
    refreshCounters();
    showBanner(`🧰 ¡Cofre del explorador! +${reward} 🪙`);
    saveGame();
  }

  function updateWalk(dt) {
    const isl = state.island;
    const kThrottle = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const kTurn = (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0) - (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0);
    const throttle = Math.max(-1, Math.min(1, kThrottle - moveAxis.dy));
    const turn = Math.max(-1, Math.min(1, kTurn - moveAxis.dx));
    const run = keys["ShiftLeft"] || keys["ShiftRight"] || Math.hypot(moveAxis.dx, moveAxis.dy) > 0.92;
    const target = throttle * (run ? RUN_SPEED : WALK_SPEED) * (throttle < 0 ? 0.6 : 1);
    player.speed += (target - player.speed) * Math.min(1, dt * 8);
    player.yaw += turn * 2.6 * dt;

    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const nx = player.pos.x + fx * player.speed * dt, nz = player.pos.z + fz * player.speed * dt;
    if (walkable(isl, nx, nz)) {
      player.pos.x = nx;
      player.pos.z = nz;
    } else if (walkable(isl, nx, player.pos.z)) player.pos.x = nx;
    else if (walkable(isl, player.pos.x, nz)) player.pos.z = nz;
    else if (Math.abs(player.speed) > 1 && state.shoreBannerCooldown <= 0) {
      showBanner("🌊 Aquí empieza el mar: vuelve a tu barco para navegar");
      state.shoreBannerCooldown = 6;
    }
    const before = player.pos.clone();
    pushOutOfColliders(isl, player.pos, 0.6);
    pushOutOfPeople(player.pos);
    if (!walkable(isl, player.pos.x, player.pos.z)) player.pos.copy(before);
    state.shoreBannerCooldown = Math.max(0, state.shoreBannerCooldown - dt);

    const gy = ZMIslands.groundAt(isl, player.pos.x, player.pos.z);
    player.pos.y += (gy - player.pos.y) * Math.min(1, dt * 15);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.yaw;
    ZMModels.animatePerson(player.mesh, dt, player.speed, state.time);

    // third-person camera, kept above the ground
    if (Math.abs(camera.fov - BASE_FOV) > 0.05) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    }
    // pull the camera in when a building stands between it and the explorer
    let back = 12;
    for (; back > 3; back -= 1) {
      const cx = player.pos.x - fx * back, cz = player.pos.z - fz * back;
      if (!isl.colliders.some((c) => c.r >= 2 && Math.hypot(cx - c.x, cz - c.z) < c.r + 1.5)) break;
    }
    camDesired.set(player.pos.x - fx * back, player.pos.y + 6 * (back / 12) + 1.5, player.pos.z - fz * back);
    camDesired.y = Math.max(camDesired.y, ZMIslands.groundAt(isl, camDesired.x, camDesired.z) + 2.5, waveHeight(camDesired.x, camDesired.z, state.time) + 2);
    if (!camLookInit) {
      camera.position.copy(camDesired);
      camLookTarget.copy(player.pos);
      camLookInit = true;
    } else {
      camera.position.lerp(camDesired, 1 - Math.pow(0.002, dt));
    }
    camLookTarget.lerp(new THREE.Vector3(player.pos.x + fx * 4, player.pos.y + 2.2, player.pos.z + fz * 4), 1 - Math.pow(0.001, dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(camLookTarget);

    const t = walkTarget();
    const chestLeft = isl.chest && !state.chestsOpened.has(isl.index);
    seaNameEl.textContent = t ? "F: " + t.label : isl.name + (chestLeft ? " · 🧰 hay un cofre escondido" : "");
    if (btnDiveEl.textContent !== (t ? t.icon : "✋")) btnDiveEl.textContent = t ? t.icon : "✋";

    floatBoat();
    updatePirates(dt);
  }

  // ---------------- Dialogs: missions, market, workshop ----------------
  function openDialog(title, html, actions) {
    state.modalOpen = true;
    dialogTitle.textContent = title;
    dialogBody.innerHTML = html;
    dialogActions.innerHTML = "";
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "dialog-btn" + (a.primary ? " primary" : "");
      b.textContent = a.label;
      b.addEventListener("click", () => {
        closeDialog();
        if (a.onClick) a.onClick();
      });
      dialogActions.appendChild(b);
    });
    dialogModal.classList.remove("hidden");
  }

  function closeDialog() {
    dialogModal.classList.add("hidden");
    state.modalOpen = false;
  }

  function talkMarisol() {
    const m = currentMission();
    const who = "👵🏾 Doña Marisol";
    if (!m) {
      openDialog(who, "<p>¡Eres una leyenda de Puerto Limón! Pescaste todos los peces legendarios de los siete mares. 🏆</p><p>Sigue pescando y vendiendo en el mercado cuando quieras.</p>", [{ label: "¡Gracias!", primary: true }]);
      return;
    }
    const fish = FISH_BY_ID[m.fishId];
    const info = `<p class="mission-meta">🎯 ${fish.special ? "⭐ " : ""}${fish.name}${m.count > 1 ? " × " + m.count : ""}<br>📍 ${m.where}<br>💰 ${m.reward} 🪙</p>`;
    if (!state.mission) {
      const tip = fish.special
        ? "Los peces legendarios brillan dorado bajo un rayo de luz y salen como ⭐ en el radar."
        : "Busca bancos de peces (el agua burbujea y saltan peces) y pesca con R.";
      openDialog(who + " · " + m.title, `<p>${m.text}</p>${info}<p class="dialog-tip">${tip}</p>`, [
        {
          label: "Aceptar misión",
          primary: true,
          onClick: () => {
            state.mission = { status: "active", progress: 0 };
            refreshCounters();
            saveGame();
            showBanner("🎯 Nueva misión: " + m.title);
          },
        },
        { label: "Ahora no" },
      ]);
    } else if (state.mission.status === "active") {
      openDialog(who + " · " + m.title, `<p>¿Cómo va la pesca? Llevas ${state.mission.progress} de ${m.count}.</p>${info}`, [
        { label: "¡Voy para allá!", primary: true },
        {
          label: "Abandonar misión",
          onClick: () => {
            state.mission = null;
            refreshCounters();
            saveGame();
          },
        },
      ]);
    } else {
      openDialog(who + " · ¡Misión cumplida!", `<p>¡Increíble! Justo lo que necesitaba. Aquí tienes tu recompensa.</p><p class="mission-meta">💰 +${m.reward} 🪙</p>`, [
        {
          label: `Cobrar ${m.reward} 🪙`,
          primary: true,
          onClick: () => {
            state.coins += m.reward;
            state.missionIndex++;
            state.mission = null;
            refreshCounters();
            saveGame();
            showBanner(`+${m.reward} 🪙 · ¡Misión completada!`);
          },
        },
      ]);
    }
  }

  function talkMarket() {
    const who = "🧑🏿‍🍳 Don Ernesto, el pescadero";
    if (!state.cooler.length) {
      openDialog(who, "<p>¡Pura vida! Tu nevera está vacía. Sal al mar, busca agua que burbujea y pesca con <b>R</b>. Yo te compro todo lo que traigas.</p>", [{ label: "¡Voy a pescar!", primary: true }]);
      return;
    }
    const groups = {};
    state.cooler.forEach((f) => {
      const g = groups[f.id] || (groups[f.id] = { n: 0, total: 0 });
      g.n++;
      g.total += f.value;
    });
    const total = state.cooler.reduce((a, f) => a + f.value, 0);
    const rows = Object.keys(groups)
      .map((id) => `<tr><td>${FISH_BY_ID[id].name}</td><td>× ${groups[id].n}</td><td>${groups[id].total} 🪙</td></tr>`)
      .join("");
    openDialog(who, `<p>¡Qué buena pesca! Te ofrezco:</p><table class="sell-table">${rows}<tr class="total"><td>Total</td><td></td><td>${total} 🪙</td></tr></table>`, [
      {
        label: `Vender todo (+${total} 🪙)`,
        primary: true,
        onClick: () => {
          state.coins += total;
          state.cooler = [];
          refreshCounters();
          saveGame();
          showBanner(`💰 +${total} 🪙 en el mercado`);
        },
      },
      { label: "Luego" },
    ]);
  }

  function talkShop() {
    const rows = Object.keys(UPGRADES)
      .map((key) => {
        const u = UPGRADES[key];
        const lvl = state.upgrades[key];
        const next = lvl + 1;
        const buy =
          next < u.levels.length
            ? `<button class="shop-buy" data-key="${key}" ${state.coins < u.cost[next] ? "disabled" : ""}>${u.levels[next]}<br>${u.cost[next]} 🪙</button>`
            : `<span class="shop-max">Al máximo ✔</span>`;
        return `<div class="shop-row"><div><b>${u.name}:</b> ${u.levels[lvl]}<br><small>${u.desc}</small></div>${buy}</div>`;
      })
      .join("");
    const hurt = state.health < state.maxHealth;
    const repair = `<div class="shop-row"><div><b>Casco:</b> ${Math.round(state.health)}%<br><small>Deja el barco como nuevo.</small></div>${
      hurt ? `<button class="shop-buy" data-key="repair" ${state.coins < REPAIR_COST ? "disabled" : ""}>Reparar<br>${REPAIR_COST} 🪙</button>` : `<span class="shop-max">Perfecto ✔</span>`
    }</div>`;
    openDialog("🧑🏽‍🔧 Taller Náutico", `<p>Tienes <b>${state.coins} 🪙</b>. ¿Qué mejoramos hoy?</p>${rows}${repair}`, [{ label: "Salir", primary: true }]);
    dialogBody.querySelectorAll(".shop-buy").forEach((b) => b.addEventListener("click", () => buyUpgrade(b.dataset.key)));
  }

  function buyUpgrade(key) {
    if (key === "repair") {
      if (state.coins < REPAIR_COST) return;
      state.coins -= REPAIR_COST;
      state.health = state.maxHealth;
      showBanner("🔧 ¡Casco reparado!");
    } else {
      const u = UPGRADES[key];
      const next = state.upgrades[key] + 1;
      if (next >= u.levels.length || state.coins < u.cost[next]) return;
      state.coins -= u.cost[next];
      state.upgrades[key] = next;
      showBanner("🔧 " + u.levels[next] + " instalado");
    }
    refreshCounters();
    saveGame();
    talkShop();
  }

  function updateMissionUI() {
    const m = currentMission();
    let html = "";
    if (m && !state.mission) html = "📜 Doña Marisol tiene una misión para ti en <b>Puerto Limón</b>";
    else if (m) {
      const fish = FISH_BY_ID[m.fishId];
      html =
        state.mission.status === "done"
          ? `✅ <b>${m.title}</b>: ¡vuelve a Puerto Limón a cobrar ${m.reward} 🪙!`
          : `🎯 <b>${m.title}</b>: ${fish.special ? "⭐ " : ""}${fish.name} ${state.mission.progress}/${m.count} · ${m.where}`;
    }
    missionTrackerEl.innerHTML = html;
    missionTrackerEl.classList.toggle("hidden", !html);
  }

  // ---------------- Life in the dive zones ----------------
  function updateZoneLife(dt) {
    const t = state.time;
    zones.forEach((z, zi) => {
      z.life.visible = state.mode === "dive" && state.zoneIndex === zi;
    });
    if (state.mode === "cave") {
      const a = t * 0.35;
      caveCreatureMesh.position.set(CAVE_CREATURE_POS.x + Math.cos(a) * 10, CAVE_CREATURE_POS.y + Math.sin(t) * 2, CAVE_CREATURE_POS.z + Math.sin(a) * 10);
      caveCreatureMesh.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      ZMModels.swimFish(caveCreatureMesh, t, 0.5);
    }
    if (state.mode !== "dive" || state.zoneIndex < 0) return;
    const z = zones[state.zoneIndex];
    z.fishSchools.forEach((s) => {
      const a = t * s.speed + s.phase;
      const dir = Math.sign(s.speed);
      const vx = -Math.sin(a) * dir, vz = Math.cos(a) * dir;
      const ry = Math.atan2(-vz, vx);
      s.fishes.forEach((f, i) => {
        f.mesh.position.set(Math.cos(a) * s.radius + f.off.x + Math.sin(t + i) * 1.2, s.depth + f.off.y + Math.sin(t * 1.3 + i) * 0.8, Math.sin(a) * s.radius + f.off.z);
        f.mesh.rotation.y = ry;
        ZMModels.swimFish(f.mesh, t, 1);
      });
    });
    // the zone's creature cruises a lazy circle (collect() follows it)
    const c = z.creatureMesh;
    const a = t * 0.22;
    c.position.set(z.creatureLocalPos.x + Math.cos(a) * 24, z.creatureLocalPos.y + Math.sin(t * 0.8) * 3, z.creatureLocalPos.z + Math.sin(a) * 24);
    c.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    ZMModels.swimFish(c, t, 0.5);
    z.creatureWorld.set(z.buoy.x + c.position.x, c.position.y, z.buoy.z + c.position.z);
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

    const walking = state.mode === "walk";
    const diving = state.mode === "dive";
    const scale = walking ? R / 140 : diving ? R / 260 : R / (BUOY_RADIUS + 250);
    let originX, originZ;
    if (walking) {
      originX = player.pos.x;
      originZ = player.pos.z;
    } else if (diving) {
      originX = camera.position.x;
      originZ = camera.position.z;
    } else {
      originX = boat.position.x;
      originZ = boat.position.z;
    }
    const toRadar = (x, z) => [cx + (x - originX) * scale, cy + (z - originZ) * scale];

    islands.forEach((isl) => {
      const [px, py] = toRadar(isl.x, isl.z);
      radarCtx.fillStyle = isl.home ? "rgba(140,230,120,0.85)" : "rgba(233,215,160,0.75)";
      radarCtx.beginPath();
      radarCtx.arc(px, py, Math.max(2, isl.r * scale), 0, Math.PI * 2);
      radarCtx.fill();
    });

    if (walking) {
      // points of interest and the boat
      state.island.pois.forEach((poi) => {
        const [px, py] = toRadar(poi.x, poi.z);
        radarCtx.fillStyle = poi.id === "missions" ? "#ffd84a" : poi.id === "market" ? "#7cffcb" : "#7fb8ff";
        radarCtx.beginPath();
        radarCtx.arc(px, py, 4, 0, Math.PI * 2);
        radarCtx.fill();
      });
      const [bx, by] = toRadar(boat.position.x, boat.position.z);
      radarCtx.fillStyle = "#ffffff";
      radarCtx.fillRect(bx - 4, by - 4, 8, 8);
    } else if (diving) {
      // sonar: boat above, nearby chests, cave mouths, the zone's creature
      const [bx, by] = toRadar(state.diveAnchor.x, state.diveAnchor.z);
      radarCtx.fillStyle = "#ffffff";
      radarCtx.fillRect(bx - 4, by - 4, 8, 8);
      seaChests.forEach((c) => {
        if (state.seaChests.has(c.index) || Math.hypot(c.x - originX, c.z - originZ) > 120) return;
        const [px, py] = toRadar(c.x, c.z);
        radarCtx.fillStyle = "#ffd76b";
        radarCtx.beginPath();
        radarCtx.arc(px, py, 3 + Math.sin(state.time * 6) * 0.8, 0, Math.PI * 2);
        radarCtx.fill();
      });
      zones.forEach((z) => {
        const [px, py] = toRadar(z.entranceWorld.x, z.entranceWorld.z);
        radarCtx.strokeStyle = "#8fd8ff";
        radarCtx.lineWidth = 2;
        radarCtx.beginPath();
        radarCtx.arc(px, py, 5, 0, Math.PI * 2);
        radarCtx.stroke();
        if (!state.found.has(z.sea.creature.id)) {
          const [cx2, cy2] = toRadar(z.creatureWorld.x, z.creatureWorld.z);
          radarCtx.fillStyle = z.sea.creature.color;
          radarCtx.beginPath();
          radarCtx.arc(cx2, cy2, 4 + Math.sin(state.time * 5) * 1.2, 0, Math.PI * 2);
          radarCtx.fill();
        }
      });
      mythics.forEach((m) => {
        if (state.mythics.has(m.t.id) || Math.hypot(m.world.x - originX, m.world.z - originZ) > 400) return;
        const [px, py] = toRadar(m.world.x, m.world.z);
        drawStar(px, py, 6, m.t.color);
      });
    } else {
      zones.forEach((z) => {
        const [px, py] = toRadar(z.buoyWorld.x, z.buoyWorld.z);
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
    }

    if (state.mode === "boat") {
      radarCtx.fillStyle = "rgba(127,224,255,0.9)";
      schools.forEach((sc) => {
        if (!sc.active || sc.special || Math.hypot(sc.x - originX, sc.z - originZ) > 450) return;
        const [px, py] = toRadar(sc.x, sc.z);
        radarCtx.beginPath();
        radarCtx.arc(px, py, 2, 0, Math.PI * 2);
        radarCtx.fill();
      });
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

    // Atlantis, once Tata Chema has told the legend
    if (state.atlantisKnown && !diving) {
      let dx = (ATLANTIS.x - originX) * scale, dz = (ATLANTIS.z - originZ) * scale;
      const d = Math.hypot(dx, dz);
      if (d > R - 9) {
        dx *= (R - 9) / d;
        dz *= (R - 9) / d;
      }
      radarCtx.fillStyle = "#7fffe0";
      radarCtx.font = "bold 15px sans-serif";
      radarCtx.textAlign = "center";
      radarCtx.textBaseline = "middle";
      radarCtx.fillText("🔱", cx + dx, cy + dz);
    }

    // legendary fish of the active mission: gold star, pinned to the rim when far
    if (missionSchool && missionSchool.active && !diving) {
      let dx = (missionSchool.x - originX) * scale, dz = (missionSchool.z - originZ) * scale;
      const d = Math.hypot(dx, dz);
      if (d > R - 8) {
        dx *= (R - 8) / d;
        dz *= (R - 8) / d;
      }
      drawStar(cx + dx, cy + dz, 6 + Math.sin(state.time * 5), "#ffd84a");
    }

    // player marker with heading
    const heading = walking ? player.yaw : state.mode === "boat" ? boatState.yaw : state.yaw;
    radarCtx.fillStyle = "#ffffff";
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    radarCtx.fill();
    radarCtx.strokeStyle = "#ffffff";
    radarCtx.lineWidth = 2;
    radarCtx.beginPath();
    radarCtx.moveTo(cx, cy);
    radarCtx.lineTo(cx - Math.sin(heading) * 11, cy - Math.cos(heading) * 11);
    radarCtx.stroke();
    radarCtx.restore();
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, R, 0, Math.PI * 2);
    radarCtx.strokeStyle = "rgba(127,224,255,0.5)";
    radarCtx.lineWidth = 1;
    radarCtx.stroke();
  }

  function drawStar(x, y, r, color) {
    radarCtx.fillStyle = color;
    radarCtx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      radarCtx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    radarCtx.closePath();
    radarCtx.fill();
    radarCtx.strokeStyle = "rgba(0,0,0,0.5)";
    radarCtx.lineWidth = 1;
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
      blip(caveCreatureMesh.position, "#" + z.sea.cave.creature.color.replace("#", ""), pulse);
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
      updateGulls(state.time);
      updateSchools(dt);
      updateWhales(dt);
      clouds.rotation.y += dt * 0.002;
      boatModel.radar.rotation.y += dt * 2.5;

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
        if (state.mode === "boat") {
          updateBoat(dt);
          updateFishing(dt);
        } else if (state.mode === "walk") updateWalk(dt);
        else if (state.mode === "dive") updateDiveLogic(dt);
        else if (state.mode === "cave") updateCaveLogic(dt);
        updateOxygen(dt);
        updateCannonballs(dt);
      }
      updateHealthUI();
      cruiseFillEl.style.width = (state.cruiseTimer / CRUISE_DELAY) * 100 + "%";
      cruiseRowEl.classList.toggle("active", state.cruising);
      cruiseRowEl.classList.toggle("hidden", state.mode !== "boat");
      updateNpcs(dt);
      updateZoneLife(dt);
      updateSeabed(state.mode === "dive");
      updateDeepSea(dt);
      depthMeterEl.classList.toggle("hidden", state.mode !== "dive" && state.mode !== "cave");
      updateBubbles(dt);
      drawRadar();
      sky.position.copy(camera.position);
      updateSun(state.mode === "walk" ? player.pos : state.mode === "dive" ? camera.position : boat.position);

      crosshairEl.classList.toggle("hidden", state.mode !== "dive" && state.mode !== "cave");

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
