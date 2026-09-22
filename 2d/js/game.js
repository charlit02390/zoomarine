// Zoomarine — demo jugable
// Biólogo marino explorando los 7 mares y sus cuevas submarinas.

(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const CANVAS_W = canvas.width;
  const CANVAS_H = canvas.height;

  const fogCanvas = document.createElement("canvas");
  fogCanvas.width = CANVAS_W;
  fogCanvas.height = CANVAS_H;
  const fogCtx = fogCanvas.getContext("2d");

  const WORLD_W = ZONE_W * SEAS.length;
  const WORLD_H = CANVAS_H;

  // ---------- DOM refs ----------
  const seaNameEl = document.getElementById("sea-name");
  const foundCountEl = document.getElementById("found-count");
  const totalCountEl = document.getElementById("total-count");
  const oxygenFill = document.getElementById("oxygen-fill");
  const zoneBanner = document.getElementById("zone-banner");
  const minimapEl = document.getElementById("minimap");

  const discoveryModal = document.getElementById("discovery-modal");
  const discoveryName = document.getElementById("discovery-name");
  const discoveryFact = document.getElementById("discovery-fact");
  const discoverySwatch = document.getElementById("discovery-swatch");

  const journalModal = document.getElementById("journal-modal");
  const journalList = document.getElementById("journal-list");
  const journalBtn = document.getElementById("journal-btn");
  const journalClose = document.getElementById("journal-close");

  const winModal = document.getElementById("win-modal");
  const restartBtn = document.getElementById("restart-btn");

  totalCountEl.textContent = TOTAL_CREATURES;

  // ---------- Game state ----------
  const state = {
    scene: "world", // 'world' | 'cave'
    zoneIndex: 0,
    camX: 0,
    time: 0,
    oxygen: 100,
    maxOxygen: 100,
    found: new Set(),
    modalOpen: false,
    journalOpen: false,
    won: false,
    bannerTimeout: null,
  };

  const player = {
    x: 150,
    y: 300,
    vx: 0,
    vy: 0,
    facing: 1,
    speed: 220, // px/sec
  };

  const keys = {};

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;

    if (e.code === "KeyJ") toggleJournal();

    if (state.modalOpen && discoveryModal.classList.contains("shown-flag")) {
      // handled via closeDiscovery listener below
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // ---------- Zone / cave geometry ----------
  function zoneStartX(i) {
    return i * ZONE_W;
  }

  // Fixed layout inside each zone (deterministic, no randomness needed for a demo)
  function zoneCreaturePos(i) {
    return { x: zoneStartX(i) + 640, y: 420 };
  }
  function zoneCaveEntrancePos(i) {
    return { x: zoneStartX(i) + 980, y: 470 };
  }
  function zoneAirPocketPos(i) {
    return { x: zoneStartX(i) + 300, y: 140 };
  }

  const CAVE_CREATURE_POS = { x: 760, y: 300 };
  const CAVE_EXIT_POS = { x: 60, y: 300 };

  // ---------- Helpers ----------
  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function clamp(v, a, b) {
    return Math.max(a, b < a ? a : Math.min(v, b));
  }

  function showBanner(text) {
    zoneBanner.textContent = text;
    zoneBanner.classList.add("show");
    clearTimeout(state.bannerTimeout);
    state.bannerTimeout = setTimeout(() => zoneBanner.classList.remove("show"), 2200);
  }

  // ---------- Minimap ----------
  function buildMinimap() {
    minimapEl.innerHTML = "";
    SEAS.forEach((sea, i) => {
      const cell = document.createElement("div");
      cell.className = "mm-cell";
      cell.title = sea.name;
      cell.style.background = sea.accent + "33";
      cell.dataset.zone = i;

      const pipTop = document.createElement("div");
      pipTop.style.cssText =
        "position:absolute;top:2px;left:2px;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.25);";
      const pipBottom = document.createElement("div");
      pipBottom.style.cssText =
        "position:absolute;bottom:2px;right:2px;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.25);";
      pipTop.dataset.role = "surface";
      pipBottom.dataset.role = "cave";
      cell.appendChild(pipTop);
      cell.appendChild(pipBottom);

      minimapEl.appendChild(cell);
    });
  }
  buildMinimap();

  function updateMinimap() {
    const cells = minimapEl.querySelectorAll(".mm-cell");
    cells.forEach((cell, i) => {
      const sea = SEAS[i];
      cell.classList.toggle("active", i === state.zoneIndex);
      const surfacePip = cell.querySelector('[data-role="surface"]');
      const cavePip = cell.querySelector('[data-role="cave"]');
      surfacePip.style.background = state.found.has(sea.creature.id)
        ? "#ffe9a8"
        : "rgba(255,255,255,0.25)";
      cavePip.style.background = state.found.has(sea.cave.creature.id)
        ? "#7fe0ff"
        : "rgba(255,255,255,0.25)";
    });
  }

  // ---------- Journal ----------
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

  // ---------- Discovery modal ----------
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
      canvas.removeEventListener("click", close);
      checkWin();
    };
    setTimeout(() => {
      window.addEventListener("keydown", close);
      canvas.addEventListener("click", close);
      discoveryModal.addEventListener("click", close, { once: true });
    }, 150);
  }

  function checkWin() {
    if (state.found.size >= TOTAL_CREATURES && !state.won) {
      state.won = true;
      setTimeout(() => winModal.classList.remove("hidden"), 300);
    }
  }

  restartBtn.addEventListener("click", () => location.reload());

  function collect(creature) {
    if (state.found.has(creature.id)) return;
    state.found.add(creature.id);
    foundCountEl.textContent = state.found.size;
    updateMinimap();
    openDiscovery(creature);
  }

  // ---------- Scene transitions ----------
  function enterCave(zoneIndex) {
    state.scene = "cave";
    state.zoneIndex = zoneIndex;
    player.x = CAVE_EXIT_POS.x + 40;
    player.y = CAVE_EXIT_POS.y;
    showBanner(SEAS[zoneIndex].cave.name);
  }

  function exitCave() {
    const entrance = zoneCaveEntrancePos(state.zoneIndex);
    state.scene = "world";
    player.x = entrance.x - 60;
    player.y = entrance.y;
    showBanner(SEAS[state.zoneIndex].name);
  }

  let lastAnnouncedZone = -1;

  // ---------- Update ----------
  function update(dt) {
    if (state.modalOpen || state.journalOpen || state.won) return;

    let dx = 0,
      dy = 0;
    if (keys["ArrowLeft"] || keys["KeyA"]) dx -= 1;
    if (keys["ArrowRight"] || keys["KeyD"]) dx += 1;
    if (keys["ArrowUp"] || keys["KeyW"]) dy -= 1;
    if (keys["ArrowDown"] || keys["KeyS"]) dy += 1;

    const len = Math.hypot(dx, dy) || 1;
    player.vx = (dx / len) * player.speed;
    player.vy = (dy / len) * player.speed;
    if (dx !== 0) player.facing = dx > 0 ? 1 : -1;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (state.scene === "world") {
      player.x = clamp(player.x, 20, WORLD_W - 20);
      player.y = clamp(player.y, 40, WORLD_H - 40);

      const newZone = clamp(Math.floor(player.x / ZONE_W), 0, SEAS.length - 1);
      if (newZone !== state.zoneIndex) {
        state.zoneIndex = newZone;
        updateMinimap();
      }
      if (newZone !== lastAnnouncedZone) {
        lastAnnouncedZone = newZone;
        seaNameEl.textContent = SEAS[newZone].name;
        showBanner(SEAS[newZone].name);
      }

      state.camX = clamp(player.x - CANVAS_W / 2, 0, WORLD_W - CANVAS_W);

      // creature discovery
      const sea = SEAS[state.zoneIndex];
      const cPos = zoneCreaturePos(state.zoneIndex);
      if (dist(player.x, player.y, cPos.x, cPos.y) < 42) {
        collect(sea.creature);
      }

      // cave entrance
      const cavePos = zoneCaveEntrancePos(state.zoneIndex);
      if (dist(player.x, player.y, cavePos.x, cavePos.y) < 38) {
        enterCave(state.zoneIndex);
      }

      // air pocket refills oxygen faster
      const air = zoneAirPocketPos(state.zoneIndex);
      const nearAir = dist(player.x, player.y, air.x, air.y) < 90;
      state.oxygen += (nearAir ? 22 : 3) * dt;
      state.oxygen = clamp(state.oxygen, 0, state.maxOxygen);
    } else {
      // cave scene, fixed bounds = canvas size
      player.x = clamp(player.x, 20, CANVAS_W - 20);
      player.y = clamp(player.y, 40, CANVAS_H - 40);
      state.camX = 0;

      const sea = SEAS[state.zoneIndex];
      if (dist(player.x, player.y, CAVE_CREATURE_POS.x, CAVE_CREATURE_POS.y) < 42) {
        collect(sea.cave.creature);
      }
      if (player.x < CAVE_EXIT_POS.x + 25 && Math.abs(player.y - CAVE_EXIT_POS.y) < 90) {
        exitCave();
      }

      state.oxygen -= 10 * dt; // caves consume air faster
      state.oxygen = clamp(state.oxygen, 0, state.maxOxygen);
      if (state.oxygen <= 0) {
        showBanner("¡Sin aire! Regresas a la superficie...");
        exitCave();
        state.oxygen = state.maxOxygen * 0.6;
      }
    }

    oxygenFill.style.width = state.oxygen + "%";
    oxygenFill.style.background =
      state.oxygen < 25
        ? "linear-gradient(90deg, #ff5f5f, #ffb37c)"
        : "linear-gradient(90deg, #3fd0ff, #7cffcb)";
  }

  // ---------- Drawing helpers ----------
  function drawBackgroundZone(sea, screenX, screenW) {
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, sea.skyTop);
    grad.addColorStop(1, sea.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(screenX, 0, screenW, CANVAS_H);

    // sandy floor
    ctx.fillStyle = sea.floor;
    ctx.fillRect(screenX, CANVAS_H - 46, screenW, 46);

    // decorative light rays
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i++) {
      const rx = screenX + ((i * 300 + (state.time * 10)) % (screenW + 300)) - 150;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 60, 0);
      ctx.lineTo(rx - 40, CANVAS_H);
      ctx.lineTo(rx - 100, CANVAS_H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSeaweed(x, y, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 10, y);
      const sway = Math.sin(state.time * 2 + i) * 8;
      ctx.quadraticCurveTo(x + i * 10 + sway, y - 25, x + i * 10, y - 50);
      ctx.stroke();
    }
  }

  function drawCreature(x, y, creature, found) {
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(state.time * 2 + x) * 4;
    ctx.translate(0, bob);

    ctx.globalAlpha = found ? 0.35 : 1;

    // body
    ctx.fillStyle = creature.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-38, -12);
    ctx.lineTo(-38, 12);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.arc(12, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();

    if (!found) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("?", 0, -28);
    }

    ctx.restore();
  }

  function drawCaveEntrance(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#1b1622";
    ctx.beginPath();
    ctx.ellipse(0, 20, 46, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 10, 34, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cfeaff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("cueva", 0, -32);
    ctx.restore();
  }

  function drawAirPocket(x, y) {
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(state.time * 3) * 0.15;
    ctx.fillStyle = "#eafcff";
    for (let i = 0; i < 5; i++) {
      const by = y + ((state.time * 60 + i * 30) % 260) - 130;
      ctx.beginPath();
      ctx.arc(x + Math.sin(state.time + i) * 8, by, 5 - i * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#cfeaff";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.globalAlpha = 1;
    ctx.fillText("aire", x, y - 20);
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(player.facing, 1);
    const bob = Math.sin(state.time * 4) * 3;
    ctx.translate(0, bob);

    // fins (kicking animation)
    const kick = Math.sin(state.time * 8) * 6;
    ctx.fillStyle = "#1c7fae";
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(-26, 10 + kick);
    ctx.lineTo(-14, 16);
    ctx.closePath();
    ctx.fill();

    // body / wetsuit
    ctx.fillStyle = "#0d5a86";
    ctx.beginPath();
    ctx.ellipse(0, 6, 15, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // tank
    ctx.fillStyle = "#c8d6dc";
    ctx.fillRect(-6, -6, 10, 22);

    // head + mask
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(6, -14, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2c2c2c";
    ctx.beginPath();
    ctx.ellipse(9, -14, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8fe8ff";
    ctx.beginPath();
    ctx.ellipse(10, -14, 3.4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // arms
    ctx.strokeStyle = "#0d5a86";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(20, -4 + Math.sin(state.time * 5) * 4);
    ctx.stroke();

    ctx.restore();
  }

  function drawWorld() {
    const startZone = Math.floor(state.camX / ZONE_W);
    const endZone = Math.floor((state.camX + CANVAS_W) / ZONE_W);

    for (let i = Math.max(0, startZone); i <= Math.min(SEAS.length - 1, endZone); i++) {
      const sea = SEAS[i];
      const worldX = zoneStartX(i);
      const screenX = worldX - state.camX;
      drawBackgroundZone(sea, screenX, ZONE_W);

      drawSeaweed(screenX + 120, CANVAS_H - 46, sea.accent);
      drawSeaweed(screenX + 900, CANVAS_H - 46, sea.accent);

      const air = zoneAirPocketPos(i);
      drawAirPocket(air.x - state.camX, air.y);

      const cPos = zoneCreaturePos(i);
      drawCreature(cPos.x - state.camX, cPos.y, sea.creature, state.found.has(sea.creature.id));

      const cavePos = zoneCaveEntrancePos(i);
      drawCaveEntrance(cavePos.x - state.camX, cavePos.y);
    }

    drawPlayer(player.x - state.camX, player.y);
  }

  function drawCave() {
    const sea = SEAS[state.zoneIndex];
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, "#050810");
    grad.addColorStop(1, "#0a1220");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // rock silhouettes
    ctx.fillStyle = "#0f1622";
    for (let i = 0; i < 6; i++) {
      const rx = (i * 170) % CANVAS_W;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 40, 60 + (i % 3) * 20);
      ctx.lineTo(rx + 80, 0);
      ctx.fill();
    }

    // exit glow
    ctx.save();
    const exitGrad = ctx.createRadialGradient(
      CAVE_EXIT_POS.x, CAVE_EXIT_POS.y, 5,
      CAVE_EXIT_POS.x, CAVE_EXIT_POS.y, 90
    );
    exitGrad.addColorStop(0, "rgba(140,220,255,0.55)");
    exitGrad.addColorStop(1, "rgba(140,220,255,0)");
    ctx.fillStyle = exitGrad;
    ctx.fillRect(CAVE_EXIT_POS.x - 90, CAVE_EXIT_POS.y - 90, 180, 180);
    ctx.fillStyle = "#cfeaff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("salida", CAVE_EXIT_POS.x, CAVE_EXIT_POS.y - 60);
    ctx.restore();

    drawCreature(
      CAVE_CREATURE_POS.x,
      CAVE_CREATURE_POS.y,
      sea.cave.creature,
      state.found.has(sea.cave.creature.id)
    );

    drawPlayer(player.x, player.y);

    // flashlight fog-of-war overlay, built on an offscreen layer so the
    // punched-out hole reveals the scene instead of erasing it
    fogCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fogCtx.fillStyle = "rgba(2,4,10,0.94)";
    fogCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    fogCtx.globalCompositeOperation = "destination-out";
    const fog = fogCtx.createRadialGradient(player.x, player.y, 15, player.x, player.y, 150);
    fog.addColorStop(0, "rgba(255,255,255,1)");
    fog.addColorStop(0.7, "rgba(255,255,255,0.75)");
    fog.addColorStop(1, "rgba(255,255,255,0)");
    fogCtx.fillStyle = fog;
    fogCtx.beginPath();
    fogCtx.arc(player.x, player.y, 150, 0, Math.PI * 2);
    fogCtx.fill();
    fogCtx.globalCompositeOperation = "source-over";

    ctx.drawImage(fogCanvas, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (state.scene === "world") drawWorld();
    else drawCave();
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    state.time += dt;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  updateMinimap();
  showBanner(SEAS[0].name);
  requestAnimationFrame(loop);
})();
