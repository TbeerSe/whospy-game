/* =========================================================
   features/assignments.js — распределение ролей
   PATCH 0.7.2 — удалены режимы p75 / p100.
   Поддерживаются только: "1", "p25", "p50".
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "../core/state.js";
import {
  shuffleArray,
  createCryptoRandom
} from "../core/utils.js";
import { getCurrentLocations } from "./locations.js";
import { generateAccessCodes } from "./accessCode.js";

/* ---------- Список шпионов текущего раунда ---------- */
export function getSpies() {
  return state.assignments.filter(
    (assignment) =>
      assignment.roleType === "spy" && !assignment.excluded
  );
}

/* ---------- Расчёт количества шпионов ----------
   Значения настройки: "1", "p25", "p50".
   Любое неизвестное значение (включая старые "p75"/"p100"
   из localStorage) откатывается к p25.

   Верхняя граница: мирные обязаны оставаться в такой численности,
   чтобы вообще можно было набрать большинство голосов
   (floor(N/2) + 1). Отсюда: шпионов не больше ceil(N/2) − 1
   (N=4 → 1, N=5 → 2, N=6 → 2, N=8 → 3, N=10 → 4). */
export function getMaxSpies(playerCount) {
  return Math.max(1, Math.ceil(Math.max(1, playerCount) / 2) - 1);
}

export function getSpiesCount(playerCount, setting, random) {
  const total = Math.max(1, playerCount);
  const maxSpies = getMaxSpies(total);

  if (setting === "1") {
    return 1;
  }

  // Только p25 и p50. Всё остальное — p25.
  const ratio = setting === "p50" ? 0.5 : 0.25;

  const maximum = Math.max(1, Math.floor(total * ratio));
  const capped = Math.min(maximum, maxSpies);

  return 1 + Math.floor(random() * capped);
}

/* ---------- Создание распределения ролей ----------
   Кто шпион и какая локация выпала — самое важное случайное решение
   игры, поэтому оно берётся напрямую из crypto.getRandomValues, а не
   из 32-битного сида раунда (из 32 бит нельзя получить все
   перестановки игроков, да и сам сид — лишь хэш). Сид раунда
   (state.entropySeed) остаётся для воспроизводимых потоков: радар,
   Верификаторы, шум таймера.
   Второй аргумент — подмена генератора (для тестов). */
export function createAssignments(entropy, randomSource) {
  const random =
    typeof randomSource === "function"
      ? randomSource
      : createCryptoRandom();

  const players = shuffleArray(state.players, random);

  const pool = state.selectedLocations.length
    ? state.selectedLocations
    : getCurrentLocations();

  const location =
    pool[Math.floor(random() * pool.length)] || pool[0];

  // PATCH 0.4 — сохраняем реальную локацию раунда для перехвата.
  state.currentRoundLocation = location.name;

  const roles = shuffleArray(location.roles, random);

  const spiesCount = getSpiesCount(
    players.length,
    state.spiesSetting,
    random
  );

  // Личные коды — тоже из crypto.
  const codes = generateAccessCodes(players.length);

  const assignments = players.map((player, index) => ({
    player,
    roleType: "civilian",
    role: roles[index % roles.length],
    location: location.name,
    excluded: false,
    accessCode: codes[index]
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

  return assignments;
}