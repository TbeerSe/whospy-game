/* =========================================================
   features/gadgets.js — инвентарь игроков и активация гаджетов

   v0.8.5:
   - Добавлен кэп на суммарный модификатор таймера
     (TIMER_MODIFIER_CAP_SECONDS = ±120 с). Раньше 8 мирных
     с Допросом давали +8 минут.
   - activateGadgets больше НЕ вызывает renderPlayers.
     Это делает вызывающий код (handlers.startMission), чтобы
     избежать циклического импорта gadgets → players.

   PATCH 0.7.0:
   - Добавлены Верификаторы (мирный/шпионский).
   - 30% Верификаторов активируются каждый раунд через TRNG.
   - Страховка сгорает СРАЗУ при активации (в любой игре),
     независимо от того, сработает она или нет.
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  STORAGE_KEYS,
  RADAR_MIN_POOL_SIZE,
  VERIFICATOR_ACTIVATION_CHANCE,
  VERIFICATOR_SEED_CONSTANT,
  TIMER_NOISE_STEPS,
  TIMER_NOISE_SEED_CONSTANT,
  TIMER_MODIFIER_CAP_SECONDS
} from "../core/state.js";
import { readFromStorage, saveToStorage } from "../core/storage.js";
import {
  createRandomGenerator,
  shuffleArray
} from "../core/utils.js";
import { getCurrentLocations } from "./locations.js";

/* ---------- Пустой инвентарь ---------- */
export function createEmptyInventory() {
  return {
    radar: 0,
    jammer: 0,
    fakeId: 0,
    fakeIdUsed: false,
    extraInterrogation: 0,
    insurance: 0,
    verificatorCivilian: 0,
    verificatorSpy: 0
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
      fakeIdUsed: Boolean(stored.fakeIdUsed),
      extraInterrogation: stored.extraInterrogation ? 1 : 0,
      insurance: stored.insurance ? 1 : 0,
      verificatorCivilian: stored.verificatorCivilian ? 1 : 0,
      verificatorSpy: stored.verificatorSpy ? 1 : 0
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

/* =========================================================
   РОЛЛ ВЕРИФИКАТОРОВ
========================================================= */
export function rollVerificators() {
  state.verificatorActive = {};
  state.verificatorRolledPlayers = new Set();
  state.verificatorUsedThisRound = new Set();

  const candidates = [];

  state.assignments.forEach((assignment) => {
    const player = assignment.player;
    const inventory = state.gadgets[player];

    if (!inventory) return;

    if (assignment.roleType === "spy" && inventory.verificatorSpy) {
      candidates.push(player);
      return;
    }

    if (
      assignment.roleType === "civilian" &&
      inventory.verificatorCivilian
    ) {
      candidates.push(player);
    }
  });

  if (!candidates.length) return;

  const random = createRandomGenerator(
    (state.entropySeed ^ VERIFICATOR_SEED_CONSTANT) >>> 0
  );

  candidates
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .forEach((player) => {
      if (random() < VERIFICATOR_ACTIVATION_CHANCE) {
        state.verificatorActive[player] = true;
        state.verificatorRolledPlayers.add(player);
      }
    });
}

/* ---------- Скрытая добавка к таймеру ---------- */
export function rollTimerNoise() {
  const steps =
    Array.isArray(TIMER_NOISE_STEPS) && TIMER_NOISE_STEPS.length
      ? TIMER_NOISE_STEPS
      : [0];

  const random = createRandomGenerator(
    (state.entropySeed ^ TIMER_NOISE_SEED_CONSTANT) >>> 0
  );

  return steps[Math.floor(random() * steps.length)] || 0;
}

/* ---------- Активация гаджетов после распределения ролей ---------- */
export function activateGadgets() {
  state.activeGadgets = {};
  state.timerModifierSeconds = 0;
  state.timerNoiseSeconds = rollTimerNoise();

  const bonusRadarPlayer = state.bonusRadar;

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

    if (inventory.radar && isSpy) {
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
      if (poolSize >= RADAR_MIN_POOL_SIZE) {
        active.radar = 1;
      } else {
        active.radarFailed = true;
      }
    }

    state.activeGadgets[player] = active;
  });

  state.bonusRadar = null;

  // PATCH 0.8.5 — кэп на суммарный модификатор таймера.
  // Раньше 8 мирных с Допросом давали +8 минут. Теперь
  // суммарно не больше ±TIMER_MODIFIER_CAP_SECONDS.
  state.timerModifierSeconds = Math.max(
    -TIMER_MODIFIER_CAP_SECONDS,
    Math.min(
      TIMER_MODIFIER_CAP_SECONDS,
      state.timerModifierSeconds
    )
  );

  rollVerificators();

  saveGadgets();
}