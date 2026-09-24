// Datos de los 7 mares, sus cuevas y las 14 criaturas a descubrir.

const SEAS = [
  {
    id: 0,
    name: "Océano Ártico",
    island: "hielo", // estilo de las islas de este mar
    skyTop: "#bfe9ff", skyBottom: "#5fb3d9",
    floor: "#dfeff5",
    accent: "#eafcff",
    creature: {
      id: "narval", name: "Narval", color: "#dfeef2",
      fact: "El narval usa su largo colmillo, en realidad un diente sensorial, para detectar cambios de presión y temperatura en el agua."
    },
    cave: {
      name: "Gruta Helada",
      creature: {
        id: "anguila_artica", name: "Anguila Ártica Luminiscente", color: "#8be9ff",
        fact: "Produce su propia luz en la más completa oscuridad para atraer presas bajo el hielo."
      }
    }
  },
  {
    id: 1,
    name: "Océano Atlántico Norte",
    island: "rocoso", // estilo de las islas de este mar
    skyTop: "#2f6fa8", skyBottom: "#0d3a63",
    floor: "#d8c9a3",
    accent: "#9fd8ff",
    creature: {
      id: "delfin", name: "Delfín Mular", color: "#8ea9b8",
      fact: "Los delfines mulares tienen nombres propios: un silbido único que los identifica ante el resto del grupo."
    },
    cave: {
      name: "Abismo del Norte",
      creature: {
        id: "rape_abisal", name: "Rape Abisal", color: "#4a3b52",
        fact: "Usa un señuelo bioluminiscente sobre su cabeza para atraer presas en la oscuridad total de las profundidades."
      }
    }
  },
  {
    id: 2,
    name: "Océano Atlántico Sur",
    island: "tropical", // estilo de las islas de este mar
    skyTop: "#2a8f9c", skyBottom: "#0a4a55",
    floor: "#e0d2a0",
    accent: "#9df0e0",
    creature: {
      id: "tortuga", name: "Tortuga Boba", color: "#a97c50",
      fact: "Puede recorrer miles de kilómetros y siempre regresa a la misma playa donde nació para anidar."
    },
    cave: {
      name: "Cueva del Kraken",
      creature: {
        id: "calamar_gigante", name: "Calamar Gigante", color: "#b23a48",
        fact: "Tiene los ojos más grandes del reino animal, del tamaño de un balón de baloncesto, ideales para ver en la oscuridad."
      }
    }
  },
  {
    id: 3,
    name: "Océano Pacífico Norte",
    island: "volcanico", // estilo de las islas de este mar
    skyTop: "#1fb6c9", skyBottom: "#0a5a68",
    floor: "#e8dfae",
    accent: "#7cffcb",
    creature: {
      id: "pulpo", name: "Pulpo Gigante del Pacífico", color: "#c0546f",
      fact: "Tiene tres corazones y su sangre es azul debido a un pigmento llamado hemocianina."
    },
    cave: {
      name: "Cueva Fantasma",
      creature: {
        id: "pulpo_dumbo", name: "Pulpo Fantasma (Dumbo)", color: "#e6c6e0",
        fact: "Vive a más de 4000 metros de profundidad y aletea con dos aletas que parecen orejas para desplazarse."
      }
    }
  },
  {
    id: 4,
    name: "Océano Pacífico Sur",
    island: "tropical", // estilo de las islas de este mar
    skyTop: "#28c2b0", skyBottom: "#0a5c58",
    floor: "#f0e6b8",
    accent: "#ffe9a8",
    creature: {
      id: "pez_payaso", name: "Pez Payaso", color: "#ff8c3f",
      fact: "Vive protegido entre los tentáculos urticantes de la anémona gracias a una capa de mucosidad especial."
    },
    cave: {
      name: "Gruta de Coral",
      creature: {
        id: "caballito_pigmeo", name: "Caballito de Mar Pigmeo", color: "#e07fb0",
        fact: "Mide menos de 2 centímetros y se camufla tan bien en el coral que fue descubierto por accidente."
      }
    }
  },
  {
    id: 5,
    name: "Océano Índico",
    island: "tropical", // estilo de las islas de este mar
    skyTop: "#1f9e8f", skyBottom: "#0a4a48",
    floor: "#e4d9a8",
    accent: "#7fe0ff",
    creature: {
      id: "manta", name: "Manta Raya", color: "#3c4a55",
      fact: "Tiene el cerebro más grande de todos los peces en relación con su cuerpo y puede reconocerse en un espejo."
    },
    cave: {
      name: "Cueva Cristalina",
      creature: {
        id: "camaron_mantis", name: "Camarón Mantis", color: "#4fd6a0",
        fact: "Golpea con tal fuerza y velocidad que puede romper el cristal de un acuario de un solo golpe."
      }
    }
  },
  {
    id: 6,
    name: "Océano Antártico (Austral)",
    island: "hielo", // estilo de las islas de este mar
    skyTop: "#3a5f8a", skyBottom: "#0a1f38",
    floor: "#eef4f7",
    accent: "#bfe9ff",
    creature: {
      id: "orca", name: "Orca", color: "#1c1c22",
      fact: "Cada manada de orcas tiene su propio dialecto de sonidos, transmitido de generación en generación."
    },
    cave: {
      name: "Fosa Abisal Austral",
      creature: {
        id: "pez_dragon", name: "Pez Dragón Negro", color: "#161616",
        fact: "Su piel absorbe casi el 99.9% de la luz que la toca, haciéndolo casi invisible en la oscuridad de la fosa."
      }
    }
  }
];

const TOTAL_CREATURES = SEAS.length * 2; // una de mar abierto + una de cueva por zona

// ---------------- Puerto Limón, peces y misiones ----------------

// Isla de inicio en el centro del mapa: pueblo, muelle, mercado y misiones.
const HOME_PORT = { name: "Puerto Limón", x: 0, z: 0, r: 95 };

// Nombres para las islas que se pueden explorar, por estilo.
const ISLAND_NAMES = {
  hielo: ["Isla Escarcha", "Cayo Glaciar", "Isla del Oso Blanco", "Peñón Nevado", "Isla Aurora", "Islote Témpano"],
  rocoso: ["Isla del Faro", "Peñasco Gris", "Isla de las Gaviotas", "Roca del Vigía", "Isla Brumosa", "Cabo Pinar"],
  tropical: ["Cayo Coral", "Isla Tortuga", "Isla Palmera", "Cayo Pelícano", "Isla Mango", "Isla Arena Blanca", "Cayo Caracol", "Isla Colibrí", "Isla Coco", "Cayo Estrella"],
  volcanico: ["Isla Brasa", "Monte Ceniza", "Isla del Dragón", "Cráter Rojo", "Isla Humo", "Isla Obsidiana"],
};

// Especies que se pueden pescar. seas: índices de SEAS donde viven, "limon"
// para las aguas cercanas a Puerto Limón. pull (0-1): cuánto tira el pez al
// recogerlo. Las especiales solo aparecen durante su misión.
const FISH = [
  { id: "sardina", name: "Sardina", color: "#9fb8c8", size: 0.55, value: 6, pull: 0.15, seas: ["limon", 0, 1, 2, 3, 4, 5, 6] },
  { id: "jurel", name: "Jurel", color: "#7f9fb0", size: 0.8, value: 12, pull: 0.3, seas: ["limon", 1, 2] },
  { id: "pargo_rojo", name: "Pargo Rojo", color: "#e0564a", size: 0.9, value: 22, pull: 0.35, seas: ["limon", 3, 4] },
  { id: "robalo", name: "Róbalo", color: "#b8c2a0", size: 1.0, value: 28, pull: 0.4, seas: ["limon", 2] },
  { id: "bacalao", name: "Bacalao", color: "#8a8060", size: 1.1, value: 30, pull: 0.4, seas: [0, 1, 6] },
  { id: "salmon", name: "Salmón", color: "#d88f78", size: 1.0, value: 34, pull: 0.5, seas: [0, 3] },
  { id: "dorado", name: "Dorado", color: "#4fcf6a", size: 1.2, value: 40, pull: 0.55, seas: [2, 4, 5] },
  { id: "atun", name: "Atún Aleta Amarilla", color: "#3a5f9a", size: 1.3, value: 52, pull: 0.65, seas: [3, 4, 5] },
  { id: "merluza", name: "Merluza Negra", color: "#3b3f47", size: 1.2, value: 46, pull: 0.55, seas: [6] },
  // --- especiales (misiones) ---
  { id: "sabalo_real", name: "Sábalo Real", color: "#d9e6f0", size: 1.6, value: 0, pull: 0.55, seas: ["limon"], special: true,
    fact: "El sábalo o tarpón es famoso en el Caribe de Limón: salta fuera del agua con escamas plateadas grandes como monedas." },
  { id: "pez_vela", name: "Pez Vela Dorado", color: "#ffcf4a", size: 1.8, value: 0, pull: 0.7, seas: [4], special: true,
    fact: "El pez vela es de los peces más rápidos del mundo y despliega su aleta dorsal como una vela para cazar." },
  { id: "pez_luna", name: "Pez Luna Gigante", color: "#c8cdd6", size: 2.2, value: 0, pull: 0.6, seas: [3], special: true,
    fact: "El pez luna (Mola mola) es el pez óseo más pesado: puede superar las dos toneladas y le encanta tomar el sol en la superficie." },
  { id: "atun_rojo", name: "Atún Rojo Gigante", color: "#2e3f7a", size: 2.0, value: 0, pull: 0.8, seas: [1], special: true,
    fact: "El atún rojo mantiene su cuerpo más caliente que el agua, lo que le permite cruzar océanos enteros." },
  { id: "marlin_azul", name: "Marlín Azul", color: "#2f78d6", size: 2.0, value: 0, pull: 0.85, seas: [5], special: true,
    fact: "El marlín azul cambia de color cuando se emociona: sus franjas se iluminan de azul eléctrico al cazar." },
  { id: "salvelino", name: "Salvelino Ártico", color: "#ff7a4a", size: 1.4, value: 0, pull: 0.6, seas: [0], special: true,
    fact: "El salvelino ártico vive más al norte que cualquier otro pez de agua dulce y se tiñe de naranja en época de cría." },
  { id: "pez_espada", name: "Pez Espada Plateado", color: "#b9c6d4", size: 2.0, value: 0, pull: 0.85, seas: [2], special: true,
    fact: "El pez espada calienta sus ojos y su cerebro con un órgano especial para ver mejor en aguas frías y profundas." },
  { id: "pez_hielo", name: "Pez de Hielo Cristalino", color: "#dff6ff", size: 1.3, value: 0, pull: 0.7, seas: [6], special: true,
    fact: "Su sangre es transparente: no tiene glóbulos rojos y sobrevive en el agua helada gracias a proteínas anticongelantes." },
];

// Misiones de Doña Marisol en Puerto Limón, en orden.
const MISSIONS = [
  { id: "m_sabalo", title: "El rey del Caribe", fishId: "sabalo_real", count: 1, reward: 60, where: "cerca de Puerto Limón",
    text: "Dicen que un Sábalo Real enorme salta en las aguas de Puerto Limón. ¿Me lo traes? Busca el banco de peces que brilla dorado." },
  { id: "m_pargos", title: "Fiesta en el pueblo", fishId: "pargo_rojo", count: 3, reward: 90, where: "cerca de Puerto Limón o en el Pacífico",
    text: "¡Hay fiesta en el pueblo y queremos preparar rice and beans con pescado! Tráeme 3 Pargos Rojos." },
  { id: "m_vela", title: "La vela dorada", fishId: "pez_vela", count: 1, reward: 150, where: "en el Océano Pacífico Sur",
    text: "Un pescador vio un Pez Vela Dorado en el Pacífico Sur. Nadie lo ha podido atrapar... ¿serás tú?" },
  { id: "m_luna", title: "Gigante de luna", fishId: "pez_luna", count: 1, reward: 180, where: "en el Océano Pacífico Norte",
    text: "En el Pacífico Norte flota un Pez Luna Gigante tomando el sol. Los biólogos del puerto quieren estudiarlo." },
  { id: "m_atun", title: "El atún de las tormentas", fishId: "atun_rojo", count: 1, reward: 200, where: "en el Océano Atlántico Norte",
    text: "El Atún Rojo Gigante cruza el Atlántico Norte. Tira muy fuerte: ¡no dejes que se rompa la línea!" },
  { id: "m_marlin", title: "Relámpago azul", fishId: "marlin_azul", count: 1, reward: 220, where: "en el Océano Índico",
    text: "En el Índico vive un Marlín Azul que brilla como un relámpago. Es el reto de cualquier pescador." },
  { id: "m_salvelino", title: "Fuego bajo el hielo", fishId: "salvelino", count: 1, reward: 240, where: "en el Océano Ártico",
    text: "Entre los hielos del Ártico nada un Salvelino naranja como el fuego. Abrígate bien." },
  { id: "m_espada", title: "La espada del sur", fishId: "pez_espada", count: 1, reward: 260, where: "en el Océano Atlántico Sur",
    text: "El Pez Espada Plateado del Atlántico Sur es rápido y listo. Ten paciencia con la caña." },
  { id: "m_hielo", title: "El pez de cristal", fishId: "pez_hielo", count: 1, reward: 300, where: "en el Océano Antártico",
    text: "La última leyenda: en el Antártico vive un pez con sangre transparente. ¡Tráelo y serás leyenda de Puerto Limón!" },
];

// Mejoras que se compran en el Taller Náutico de Puerto Limón.
const UPGRADES = {
  rod: { name: "Caña de pescar", levels: ["Caña de bambú", "Caña de fibra", "Caña de carbono"], cost: [0, 80, 200],
    desc: "Aguanta más tensión y te da más tiempo cuando pica." },
  cooler: { name: "Nevera", levels: ["Nevera pequeña (6)", "Nevera mediana (10)", "Nevera grande (16)"], cost: [0, 60, 150], capacity: [6, 10, 16],
    desc: "Guarda más peces antes de volver al mercado." },
  dive: { name: "Equipo de buceo", levels: ["Equipo básico (130 m)", "Equipo profesional (200 m)", "Traje abisal (300 m)"], cost: [0, 150, 350],
    depth: [130, 200, 300], oxygen: [100, 150, 220],
    desc: "Bajas más profundo y aguantas más tiempo sin aire." },
  engine: { name: "Motor", levels: ["Motor de serie", "Motor turbo", "Motor de regata"], cost: [0, 120, 260], speed: [1, 1.12, 1.25],
    desc: "El barco navega más rápido." },
};
const REPAIR_COST = 25;

// ---------------- Habla tica ----------------
// Saludos y charlas de la gente de Puerto Limón: español costarricense
// (pura vida, mae, tuanis, diay, upe, qué chiva...) y un poco de mekatelyu,
// el criollo inglés limonense ("wah gwaan" = ¿qué pasa?).
const TICO = {
  greetings: [
    "¡Pura vida, mae!", "¡Upe! ¿Todo bien?", "¡Diay, qué me cuenta!", "¡Tuanis verle por aquí!",
    "¡Qué dicha verle!", "¡Wah gwaan, bredda!", "¡Buenas, mae! ¿Qué más?", "¡Idiay, pura vida!",
    "¡Mekatelyu: el mar está tuanis hoy!", "¡Qué chiva su barco, mae!",
  ],
  chats: [
    ["¿Diay mae, qué se cuenta?", "Aquí, pura vida, mae."],
    ["¡Qué calor más rajado!", "¡Demasiado! Vamos por un fresco."],
    ["¿Ya comió rice and beans?", "¡Claro! Con patí y todo."],
    ["Esa pesca estuvo tuanis.", "¡Qué chiva, mae!"],
    ["¿Va para la mejenga?", "¡Jale, de una!"],
    ["¡Wah gwaan!", "Aal right, man. Pura vida."],
    ["Mae, se me olvidó el chunche.", "Diay, qué pereza..."],
    ["¿Cómo va el brete?", "Pura vida, gracias a Dios."],
    ["¡Upe, se me fue el bus!", "¡Qué sal, mae!"],
    ["Hoy hay que ir a la playa.", "¡A cachete!"],
    ["¿Vio al sábalo saltar?", "¡Diay sí! Estaba enorme."],
    ["Dicen que hay una ciudad hundida...", "¿La Atlántida? ¡Qué miedo, mae!"],
  ],
  kids: ["¡Pásela, mae!", "¡Mía, mía!", "¡Qué golazo!", "¡Tuanis!", "¡Jale, jale!", "¡Al palo!", "¡Tire, tire!"],
  kidGreetings: ["¡Hola! ¿Juega mejenga?", "¡Pura vida, señor!", "¡Tuanis su sombrero!"],
  goal: ["¡GOOOOOL!", "¡Qué golazo, mae!", "¡Gol, gol, gol!"],
};

// ---------------- La Atlántida ----------------
// Ciudad hundida en una fosa profunda al este: hace falta el traje abisal.
const ATLANTIS = { x: 1600, z: -360, depth: -265, radius: 190 };

const MYTHIC_TREASURES = [
  { id: "tridente", name: "Tridente de Poseidón", color: "#ffd76b", reward: 300,
    fact: "Según la leyenda, con su tridente Poseidón levantaba olas y calmaba tormentas." },
  { id: "corona", name: "Corona de Oricalco", color: "#ff9f43", reward: 250,
    fact: "El oricalco era el metal legendario de la Atlántida, que brillaba como el fuego." },
  { id: "perla", name: "Perla de la Luna", color: "#f4f8ff", reward: 250,
    fact: "Una perla tan grande que decían que guardaba la luz de la luna llena." },
  { id: "cristal", name: "Cristal de Atlas", color: "#7fe0ff", reward: 250,
    fact: "Los atlantes usaban cristales para guiar sus barcos en la oscuridad." },
  { id: "escudo", name: "Escudo del Rey Atlas", color: "#c0c8d8", reward: 250,
    fact: "Atlas, el primer rey de la Atlántida, da nombre al océano Atlántico." },
];
