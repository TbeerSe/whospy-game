/* =========================================================
   core/utils.js — общие утилиты (не зависят от feature-модулей)
========================================================= */
// @ts-nocheck
"use strict";

import { elements } from "./dom.js";

/* ---------- Пауза ---------- */
export function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/* ---------- HTML-экранирование ---------- */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Тост ---------- */
export function showToast(message) {
  if (!elements.toast) return;

  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeout);

  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

/* ---------- Форматирование времени ---------- */
export function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(remainingSeconds).padStart(2, "0")
  };
}

/* ---------- FNV-1a — из строки в 32-битный сид ---------- */
export function stringToSeed(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/* ---------- xorshift32 PRNG ---------- */
export function createRandomGenerator(seed) {
  let currentSeed = seed >>> 0;

  return function random() {
    currentSeed ^= currentSeed << 13;
    currentSeed ^= currentSeed >>> 17;
    currentSeed ^= currentSeed << 5;
    currentSeed >>>= 0;

    return currentSeed / 4294967296;
  };
}

/* ---------- Перемешивание Фишера–Йетса ---------- */
export function shuffleArray(array, random) {
  const result = [...array];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));

    [result[index], result[targetIndex]] = [
      result[targetIndex],
      result[index]
    ];
  }

  return result;
}
