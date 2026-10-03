/* =========================================================
   features/gadgets.js — инвентарь игроков и активация гаджетов
   ВАЖНО: activateGadgets больше НЕ вызывает renderPlayers.
   Это делает вызывающий код (handlers.startMission), чтобы
   избежать циклического импорта gadgets → players.
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  STORAGE_KEYS,
  RADAR_MIN_POOL_SIZE
} from "../core/state.js";
import { readFromStorage, saveToStorage } from "../core/storage.js";
import { getCurrentLocations } from "./locations.js";

/* ---------- Пустой инвентарь ---------- */
export function createEmptyInventory() {
  return {
    radar: 0,
    jammer: 0,
    fakeId: 0,
    // PATCH 0.4.2 — флаг «удостоверение уже сработало».
    fakeIdUsed: false,
    lieDetector: 0,
    extraInterrogation: 0,
    insurance: 0
  };
}

/* ---------- Приведение инвентаря к валидному виду ---------- */
export function normalizeGadgets() {
  const result = {};

  state.players.forEach((player) => {
    const stored = state.gadgets[player] || {};

    const radarLevel = Number(stored.radar);

    result[player] = {
      radar: [1, 2].includes(radarLevel) ? radarLevel : 0,
      jammer: stored.jammer ? 1 : 0,
      fakeId: stored.fakeId ? 1 : 0,
      // PATCH 0.4.2 — сохраняем флаг использования удостоверения.
      fakeIdUsed: Boolean(stored.fakeIdUsed),
      lieDetector: stored.lieDetector ? 1 : 0,
      extraInterrogation: stored.extraInterrogation ? 1 : 0,
      insurance: stored.insurance ? 1 : 0
    };
  });

  state.gadgets = result;
  saveGadgets();
}

/* ---------- Сохранение инвентаря ---------- */
export function saveGadgets() {
  saveToStorage(STORAGE_KEYS.gadgets, state.gadgets);
}

/* ---------- Миграция старых покупок радара ---------- */
export function migrateOldRadarPurchases() {
  const oldRadar = readFromStorage(STORAGE_KEYS.radar, {});

  if (!oldRadar || typeof oldRadar !== "object") return;

  Object.entries(oldRadar).forEach(([player, level]) => {
    if (!state.gadgets[player]) {
      state.gadgets[player] = createEmptyInventory();
    }

    const numericLevel = Number(level);

    if (
      [1, 2].includes(numericLevel) &&
      !state.gadgets[player].radar
    ) {
      state.gadgets[player].radar = numericLevel;
    }
  });

  saveGadgets();
}

/* ---------- Активация гаджетов после распределения ролей ---------- */
export function activateGadgets() {
  state.activeGadgets = {};
  state.timerModifierSeconds = 0;

  const bonusRadarPlayer = state.bonusRadar;

  // PATCH 0.4.2 — размер пула локаций для проверки радара.
  const poolSize = state.selectedLocations.length
    ? state.selectedLocations.length
    : getCurrentLocations().length;

  state.assignments.forEach((assignment) => {
    const player = assignment.player;

    if (!state.gadgets[player]) {
      state.gadgets[player] = createEmptyInventory();
    }

    const inventory = state.gadgets[player];
    const active = {};

    const isSpy = assignment.roleType === "spy";
    const isCivilian = assignment.roleType === "civilian";

    // ВАЖНО: сгорают только предметы, подходящие роли игрока.
    // Если радар купил мирный — он остаётся в инвентаре до следующей игры
    // (замораживается). То же касается остальных «не тех» предметов.

    if (inventory.radar && isSpy) {
      // PATCH 0.4.2 — если пул локаций меньше 3, радар не активируется
      // и НЕ сгорает: предмет остаётся в инвентаре до следующего раунда.
      if (poolSize < RADAR_MIN_POOL_SIZE) {
        active.radarFailed = true;
      } else {
        active.radar = inventory.radar;
        inventory.radar = 0;
      }
    }

    if (inventory.jammer && isSpy) {
      active.jammer = true;
      state.timerModifierSeconds -= 60;
      inventory.jammer = 0;
    }

    if (inventory.fakeId && isSpy) {
      active.fakeId = true;
      inventory.fakeId = 0;
    }

    if (inventory.lieDetector && isCivilian) {
      active.lieDetector = true;
      inventory.lieDetector = 0;
    }

    if (inventory.extraInterrogation && isCivilian) {
      active.extraInterrogation = true;
      state.timerModifierSeconds += 60;
      inventory.extraInterrogation = 0;
    }

    if (inventory.insurance && isCivilian) {
      active.insurance = true;
      inventory.insurance = 0;
    }

    if (
      bonusRadarPlayer === player &&
      isSpy &&
      !active.radar &&
      !active.radarFailed
    ) {
      // Бонусный радар от «филантропа» тоже не срабатывает, если пул мал.
      if (poolSize >= RADAR_MIN_POOL_SIZE) {
        active.radar = 1;
      } else {
        active.radarFailed = true;
      }
    }

    state.activeGadgets[player] = active;
  });

  state.bonusRadar = null;

  saveGadgets();
  // renderPlayers() вызывается снаружи, чтобы не тянуть
  // зависимость gadgets → players (цикл).
}
