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
