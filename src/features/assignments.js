/* =========================================================
   features/assignments.js — распределение ролей
========================================================= */
// @ts-nocheck
"use strict";

import { state, LOCATION_SEED_CONSTANT } from "../core/state.js";
import {
  shuffleArray,
  createRandomGenerator
} from "../core/utils.js";
import { getCurrentLocations } from "./locations.js";

/* ---------- Список шпионов текущего раунда ---------- */
export function getSpies() {
  return state.assignments.filter(
    (assignment) => assignment.roleType === "spy"
  );
}

/* ---------- Расчёт количества шпионов ---------- */
// PATCH 0.4 — новые значения настройки: 1, p25, p50, p75, p100.
// Любое неизвестное значение откатывается к p25.
//
// PATCH 0.4.2 — уточнение по p25/p50/p75:
//   - p25 для 3–4 игроков всегда даёт 1 шпиона (Math.floor(3..4 * 0.25) = 0/1).
//     Это соответствует формуле, хотя может вводить в заблуждение.
//   - p100 даёт равномерное [1..N], а не «все шпионы».
function getSpiesCount(playerCount, setting, random) {
  const total = Math.max(1, playerCount);

  if (setting === "1") {
    return 1;
  }

  if (setting === "p100") {
    // PATCH 0.4.1 — p100 означает «случайно от 1 до N шпионов»,
    // а не «все шпионы». Возвращаем равномерный диапазон [1..N].
    return 1 + Math.floor(random() * total);
  }

  let ratio;

  if (setting === "p50") {
    ratio = 0.5;
  } else if (setting === "p75") {
    ratio = 0.75;
  } else {
    // "p25" + безопасный откат для неизвестных значений.
    ratio = 0.25;
  }

  const maximum = Math.max(1, Math.floor(total * ratio));

  return 1 + Math.floor(random() * maximum);
}

/* ---------- Создание распределения ролей ---------- */
export function createAssignments(entropy) {
  const random = createRandomGenerator(entropy.seed);
  const players = shuffleArray(state.players, random);

  // PATCH 0.4 — выбор локации из пула отдельным TRNG, чтобы
  // этот выбор не «съедал» первые броски у shuffle игроков
  // (и был детерминирован тем же сидом игры).
  const locationRandom = createRandomGenerator(
    (entropy.seed ^ LOCATION_SEED_CONSTANT) >>> 0
  );

  const pool = state.selectedLocations.length
    ? state.selectedLocations
    : getCurrentLocations();

  const location =
    pool[Math.floor(locationRandom() * pool.length)] || pool[0];

  // PATCH 0.4 — сохраняем реальную локацию раунда для перехвата.
  state.currentRoundLocation = location.name;

  const roles = shuffleArray(location.roles, random);

  const spiesCount = getSpiesCount(
    players.length,
    state.spiesSetting,
    random
  );

  const assignments = players.map((player, index) => ({
    player,
    roleType: "civilian",
    role: roles[index % roles.length],
    location: location.name
  }));

  const availableIndexes = shuffleArray(
    assignments.map((_, index) => index),
    random
  );

  const spyIndexes = availableIndexes.slice(0, spiesCount);

  spyIndexes.forEach((index) => {
    assignments[index].roleType = "spy";
    assignments[index].role = null;
  });

  if (state.roleMode === "accomplice") {
    // PATCH 0.4.2 — если все игроки стали шпионами (p100), приходится
    // превратить одного шпиона в accomplice, чтобы режим не отключился молча.
    const accompliceIndex = availableIndexes.find(
      (index) => !spyIndexes.includes(index)
    );

    if (accompliceIndex !== undefined) {
      assignments[accompliceIndex].roleType = "accomplice";

      assignments[accompliceIndex].role =
        "Сообщник шпиона";
    } else if (spyIndexes.length > 0) {
      const removeIdx = Math.floor(random() * spyIndexes.length);

      const convertedIndex = spyIndexes.splice(removeIdx, 1)[0];

      if (convertedIndex !== undefined) {
        assignments[convertedIndex].roleType = "accomplice";

        assignments[convertedIndex].role =
          "Сообщник шпиона";
      }
    }
  }

  return assignments;
}
