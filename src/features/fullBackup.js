/* =========================================================
   features/fullBackup.js — полный экспорт/импорт игры
   PATCH 0.6.7

   PATCH 0.7.1:
   - Добавлены Верификаторы (мирный/шпионский) в экспорт
     и импорт. Раньше терялись при полном бэкапе.

   PATCH 0.7.2:
   - Удалены режимы шпионов p75 / p100. При импорте старых
     бэкапов с этими значениями они откатываются к p50.
========================================================= */
// @ts-nocheck
"use strict";

import { state, STORAGE_KEYS, MIN_BALANCE } from "../core/state.js";
import { elements } from "../core/dom.js";
import {
  saveToStorage,
  saveSettings
} from "../core/storage.js";
import { downloadJsonFile, isReservedName } from "../core/utils.js";
import {
  createEmptyInventory,
  normalizeGadgets,
  saveGadgets
} from "./gadgets.js";
import { normalizeBalances } from "./economy.js";
import {
  saveCustomLocations,
  renderDefaultLocations,
  renderCustomLocations,
  updateLocationHint,
  saveSelectedLocations
} from "./locations.js";
import { renderPlayers } from "./players.js";

/* =========================================================
   ЭКСПОРТ
========================================================= */

function collectPlayersPayload() {
  return state.players.map((name) => {
    const balance = Number(state.balances[name]);
    const gadgets = state.gadgets[name] || createEmptyInventory();

    return {
      name,
      balance: Number.isFinite(balance)
        ? Math.floor(balance)
        : 0,
      gadgets: {
        radar: Number(gadgets.radar) || 0,
        jammer: Number(gadgets.jammer) || 0,
        fakeId: Number(gadgets.fakeId) || 0,
        fakeIdUsed: Boolean(gadgets.fakeIdUsed),
        extraInterrogation: Number(gadgets.extraInterrogation) || 0,
        insurance: Number(gadgets.insurance) || 0,
        verificatorCivilian: Number(gadgets.verificatorCivilian) || 0,
        verificatorSpy: Number(gadgets.verificatorSpy) || 0
      }
    };
  });
}

function collectCustomLocationsPayload() {
  return state.customLocations.map((loc) => ({
    id: typeof loc.id === "string" ? loc.id : "",
    name: String(loc.name || ""),
    roles: Array.isArray(loc.roles) ? [...loc.roles] : [],
    history: Array.isArray(loc.history)
      ? loc.history.map((e) => ({
          name: String(e?.name || ""),
          roles: Array.isArray(e?.roles) ? [...e.roles] : [],
          savedAt: Number(e?.savedAt) || Date.now()
        }))
      : [],
    future: Array.isArray(loc.future)
      ? loc.future.map((e) => ({
          name: String(e?.name || ""),
          roles: Array.isArray(e?.roles) ? [...e.roles] : [],
          savedAt: Number(e?.savedAt) || Date.now()
        }))
      : []
  }));
}

/* ---------- Главный экспорт: собирает весь слепок ---------- */
export function exportFullBackup() {
  const payload = {
    spyfall: "full",
    version: 1,
    exportedAt: new Date().toISOString(),
    players: collectPlayersPayload(),
    customLocations: collectCustomLocationsPayload(),
    selectedLocations: state.selectedLocations.map((loc) => ({
      name: String(loc.name || ""),
      roles: Array.isArray(loc.roles) ? [...loc.roles] : []
    })),
    selectedPack:
      state.selectedPack === "custom" ? "custom" : "default",
    settings: {
      durationMinutes: Number(state.durationMinutes) || 10,
      announceSpies: state.announceSpies !== false,
      spiesSetting: state.spiesSetting || "p25",
      soundEnabled: state.soundEnabled !== false
    },
    roundHistory: Array.isArray(state.roundHistory)
      ? state.roundHistory.slice(-50)
      : []
  };

  const timestamp = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  downloadJsonFile(
    "spyfall-backup-" + timestamp + ".json",
    payload
  );

  return {
    ok: true,
    players: payload.players.length,
    locations: payload.customLocations.length,
    rounds: payload.roundHistory.length
  };
}

/* =========================================================
   ВАЛИДАЦИЯ И НОРМАЛИЗАЦИЯ
========================================================= */

function normalizeImportedPlayer(raw) {
  if (!raw || typeof raw !== "object") return null;

  const name =
    typeof raw.name === "string" ? raw.name.trim() : "";

  if (!name || isReservedName(name)) return null;

  const balanceRaw = Number(raw.balance);
  const balance = Number.isFinite(balanceRaw)
    ? Math.max(MIN_BALANCE, Math.floor(balanceRaw))
    : 0;

  const g = raw.gadgets && typeof raw.gadgets === "object"
    ? raw.gadgets
    : {};

  const radarLevel = Number(g.radar);

  const gadgets = {
    radar: [1, 2].includes(radarLevel) ? radarLevel : 0,
    jammer: g.jammer ? 1 : 0,
    fakeId: g.fakeId ? 1 : 0,
    fakeIdUsed: Boolean(g.fakeIdUsed),
    extraInterrogation: g.extraInterrogation ? 1 : 0,
    insurance: g.insurance ? 1 : 0,
    verificatorCivilian: g.verificatorCivilian ? 1 : 0,
    verificatorSpy: g.verificatorSpy ? 1 : 0
  };

  return { name, balance, gadgets };
}

function normalizeImportedLocation(raw) {
  if (!raw || typeof raw !== "object") return null;

  const name =
    typeof raw.name === "string" ? raw.name.trim() : "";

  const roles = Array.isArray(raw.roles)
    ? raw.roles.map((r) => String(r).trim()).filter(Boolean)
    : [];

  if (!name || roles.length < 5) return null;

  const trimSnapshots = (arr) =>
    Array.isArray(arr)
      ? arr
          .filter((e) => e && typeof e === "object")
          .map((e) => ({
            name: String(e.name || "").trim(),
            roles: Array.isArray(e.roles)
              ? e.roles
                  .map((r) => String(r).trim())
                  .filter(Boolean)
              : [],
            savedAt: Number(e.savedAt) || Date.now()
          }))
          .filter((e) => e.name && e.roles.length >= 5)
          .slice(-10)
      : [];

  return {
    id:
      typeof raw.id === "string" && raw.id
        ? raw.id
        : "loc_" + Date.now() + "_" +
          Math.random().toString(36).slice(2, 10),
    name,
    roles,
    history: trimSnapshots(raw.history),
    future: trimSnapshots(raw.future)
  };
}

function normalizeImportedSelectedLocations(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (loc) =>
        loc &&
        typeof loc.name === "string" &&
        Array.isArray(loc.roles)
    )
    .map((loc) => ({
      name: String(loc.name).trim(),
      roles: loc.roles
        .map((r) => String(r).trim())
        .filter(Boolean)
    }))
    .filter((loc) => loc.name && loc.roles.length >= 3);
}

function normalizeImportedSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};

  const durationRaw = Number(src.durationMinutes);
  const durationMinutes = Number.isFinite(durationRaw)
    ? Math.max(1, Math.min(120, Math.floor(durationRaw)))
    : 10;

  // PATCH 0.7.2 — только "1" / "p25" / "p50".
  // Старые бэкапы с "p75" / "p100" откатываются к "p50",
  // синонимы ("random", "all", "2".."5") тоже поддержаны.
  const allowedSpies = ["1", "p25", "p50"];

  let spiesSetting = "p25";

  if (allowedSpies.includes(src.spiesSetting)) {
    spiesSetting = src.spiesSetting;
  } else if (
    src.spiesSetting === "p75" ||
    src.spiesSetting === "p100" ||
    src.spiesSetting === "all" ||
    src.spiesSetting === "3" ||
    src.spiesSetting === "4" ||
    src.spiesSetting === "5"
  ) {
    spiesSetting = "p50";
  } else if (src.spiesSetting === "2") {
    spiesSetting = "p25";
  }

  return {
    durationMinutes,
    announceSpies: src.announceSpies !== false,
    spiesSetting,
    soundEnabled: src.soundEnabled !== false
  };
}

/* =========================================================
   ПАРСИНГ ФАЙЛА (без применения)
========================================================= */

export async function parseFullBackupFile(file) {
  if (!file) {
    return { ok: false, error: "Файл не выбран" };
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "Не удалось прочитать JSON" };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.spyfall !== "full"
  ) {
    return {
      ok: false,
      error: "Файл не является резервной копией игры"
    };
  }

  if (Number(parsed.version) !== 1) {
    return {
      ok: false,
      error: "Неподдерживаемая версия резервной копии"
    };
  }

  const preview = {
    players: Array.isArray(parsed.players)
      ? parsed.players.length
      : 0,
    customLocations: Array.isArray(parsed.customLocations)
      ? parsed.customLocations.length
      : 0,
    selectedLocations: Array.isArray(parsed.selectedLocations)
      ? parsed.selectedLocations.length
      : 0,
    roundHistory: Array.isArray(parsed.roundHistory)
      ? parsed.roundHistory.length
      : 0
  };

  return { ok: true, payload: parsed, preview };
}

/* =========================================================
   ПРИМЕНЕНИЕ
========================================================= */

export function applyFullBackup(payload) {
  try {
    applyFullBackupInternal(payload);
  } catch (e) {
    return { ok: false, error: "Ошибка при применении резервной копии" };
  }

  return {
    ok: true,
    players: state.players.length,
    locations: state.customLocations.length,
    rounds: state.roundHistory.length
  };
}

function applyFullBackupInternal(payload) {
  // 1. Игроки + балансы + гаджеты
  const players = [];
  const balances = {};
  const gadgets = {};

  (Array.isArray(payload.players) ? payload.players : [])
    .forEach((raw) => {
      const p = normalizeImportedPlayer(raw);
      if (!p) return;

      const exists = players.some(
        (name) => name.toLowerCase() === p.name.toLowerCase()
      );
      if (exists) return;

      players.push(p.name);
      balances[p.name] = p.balance;
      gadgets[p.name] = p.gadgets;
    });

  state.players = players;
  state.balances = balances;
  state.gadgets = gadgets;

  // 2. Кастомные локации
  const customLocations = [];
  (Array.isArray(payload.customLocations)
    ? payload.customLocations
    : []
  ).forEach((raw) => {
    const loc = normalizeImportedLocation(raw);
    if (!loc) return;

    const exists = customLocations.some(
      (l) => l.name.toLowerCase() === loc.name.toLowerCase()
    );
    if (exists) return;

    customLocations.push(loc);
  });

  state.customLocations = customLocations;

  // 3. Selected locations
  state.selectedLocations = normalizeImportedSelectedLocations(
    payload.selectedLocations
  );

  // 4. Selected pack
  state.selectedPack =
    payload.selectedPack === "custom" ? "custom" : "default";

  // 5. Настройки
  const s = normalizeImportedSettings(payload.settings);

  state.durationMinutes = s.durationMinutes;
  state.announceSpies = s.announceSpies;
  state.spiesSetting = s.spiesSetting;
  state.soundEnabled = s.soundEnabled;

  // 6. История раундов
  state.roundHistory = Array.isArray(payload.roundHistory)
    ? payload.roundHistory
        .filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.id === "string" &&
            Array.isArray(entry.players)
        )
        .slice(-50)
    : [];

  // 7. Пересчёт
  normalizeBalances();
  normalizeGadgets();

  // 8. Запись в localStorage
  saveToStorage(STORAGE_KEYS.players, state.players);
  saveToStorage(STORAGE_KEYS.balances, state.balances);
  saveGadgets();
  saveCustomLocations();
  saveSelectedLocations();
  saveToStorage(STORAGE_KEYS.roundHistory, state.roundHistory);
  saveSettings();

  // 9. Синхронизация UI
  syncUIAfterImport();
}

/* ---------- Обновление UI после импорта ---------- */
function syncUIAfterImport() {
  if (elements.duration) {
    elements.duration.value = String(state.durationMinutes);
  }

  if (elements.announceSpies) {
    elements.announceSpies.checked = state.announceSpies;
  }

  if (elements.spiesCount) {
    elements.spiesCount.value = state.spiesSetting;
  }

  elements.locationTabs.forEach((tab) => {
    const isActive = tab.dataset.pack === state.selectedPack;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  if (elements.defaultLocations) {
    elements.defaultLocations.classList.toggle(
      "is-hidden",
      state.selectedPack !== "default"
    );
  }

  if (elements.customLocations) {
    elements.customLocations.classList.toggle(
      "is-hidden",
      state.selectedPack !== "custom"
    );
  }

  renderPlayers();
  renderDefaultLocations();
  renderCustomLocations();
  updateLocationHint();

  const soundBtn = document.querySelector(".sound-toggle");
  if (soundBtn) {
    soundBtn.classList.toggle("is-muted", !state.soundEnabled);
  }
}

/* =========================================================
   Совместимость: старый API одним вызовом (parse + apply)
========================================================= */

export async function importFullBackupFromFile(file) {
  const r = await parseFullBackupFile(file);
  if (!r.ok) return r;
  return applyFullBackup(r.payload);
}