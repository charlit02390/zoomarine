// Perfiles de explorador y partidas guardadas.
// Todo vive en localStorage de este navegador: no hay servidor. El PIN solo
// separa perfiles de quienes comparten el mismo equipo; NO es seguridad real.

const Profiles = (function () {
  const PROFILES_KEY = "zoomarine.profiles";
  const SESSION_KEY = "zoomarine.session";
  const SAVE_PREFIX = "zoomarine.save.";

  function readJSON(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function normalize(name) {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  // FNV-1a salted with the profile name — enough to avoid storing the PIN in plain text.
  function hashPin(key, pin) {
    let h = 0x811c9dc5;
    const str = key + ":" + pin;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function login(rawName, pin) {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length < 2) return { ok: false, error: "El nombre debe tener al menos 2 letras." };
    if (!/^\d{4}$/.test(pin)) return { ok: false, error: "El PIN debe tener 4 números." };

    const key = normalize(name);
    const profiles = readJSON(localStorage, PROFILES_KEY, {});
    const existing = profiles[key];
    if (existing) {
      if (existing.pinHash !== hashPin(key, pin)) return { ok: false, error: "PIN incorrecto para ese explorador." };
    } else {
      profiles[key] = { name, pinHash: hashPin(key, pin), created: Date.now() };
      if (!writeJSON(localStorage, PROFILES_KEY, profiles)) {
        return { ok: false, error: "Este navegador no permite guardar datos (¿modo privado?)." };
      }
    }
    writeJSON(sessionStorage, SESSION_KEY, { key });
    return { ok: true, isNew: !existing, name: profiles[key].name, key };
  }

  function current() {
    const session = readJSON(sessionStorage, SESSION_KEY, null);
    if (!session) return null;
    const profile = readJSON(localStorage, PROFILES_KEY, {})[session.key];
    return profile ? { key: session.key, name: profile.name } : null;
  }

  function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function loadSave(key) {
    return readJSON(localStorage, SAVE_PREFIX + key, null);
  }

  function writeSave(key, data) {
    return writeJSON(localStorage, SAVE_PREFIX + key, data);
  }

  function clearSave(key) {
    try {
      localStorage.removeItem(SAVE_PREFIX + key);
    } catch (e) {}
  }

  return { login, current, logout, loadSave, writeSave, clearSave };
})();
