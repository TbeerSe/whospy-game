/* =========================================================
   core/storage.js — localStorage + настройки
========================================================= */
// @ts-nocheck
"use strict";

import { STORAGE_KEYS, state } from "./state.js";
import { elements } from "./dom.js";
import { showToast } from "./utils.js";

/* =========================================================
   Обёртки над localStorage
========================================================= */

// PATCH 0.4.2 — обработка QuotaExceededError.
export function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    const isQuota =
      error &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error.code === 22 ||
        error.code === 1014);

    if (isQuota) {
      showToast("Хранилище переполнено");

      try {
        localStorage.removeItem(STORAGE_KEYS.lastRound);
        localStorage.setItem(key, JSON.stringify(value));
      } catch (retryError) {
        console.warn(
          "Не удалось сохранить даже после очистки:",
          retryError
        );
      }
    } else {
      console.warn("Не удалось сохранить данные:", error);
    }
  }
}

export function readFromStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn("Не удалось прочитать данные:", error);
    return fallback;
  }
}

/* =========================================================
   Настройки
========================================================= */

// PATCH 0.4 — миграция старых значений настройки количества шпионов.
export function migrateSpiesSetting(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return "p25";
  }

  const value = String(rawValue);

  if (value === "random") return "p25";
  if (value === "all") return "p100";
  if (["2", "3", "4", "5"].includes(value)) return "1";

  if (["1", "p25", "p50", "p75", "p100"].includes(value)) {
    return value;
  }

  return "p25";
}

function ensureSpiesVisibility() {
  if (elements.spiesSettings) {
    elements.spiesSettings.hidden = false;
  }
}

export function loadSettings() {
  const savedSettings = readFromStorage(STORAGE_KEYS.settings, {});

  if (savedSettings.durationMinutes) {
    state.durationMinutes = Number(savedSettings.durationMinutes);

    elements.duration.value = String(state.durationMinutes);
  }

  if (savedSettings.roleMode) {
    state.roleMode = savedSettings.roleMode;

    elements.roleModeInputs.forEach((input) => {
      input.checked = input.value === state.roleMode;
    });
  }

  state.spiesSetting = migrateSpiesSetting(savedSettings.spiesSetting);

  if (elements.spiesCount) {
    elements.spiesCount.value = state.spiesSetting;
  }

  if (typeof savedSettings.soundEnabled === "boolean") {
    state.soundEnabled = savedSettings.soundEnabled;
  }

  ensureSpiesVisibility();
}

export function saveSettings() {
  saveToStorage(STORAGE_KEYS.settings, {
    durationMinutes: state.durationMinutes,
    roleMode: state.roleMode,
    spiesSetting: state.spiesSetting,
    soundEnabled: state.soundEnabled
  });
}

export function readSettingsFromForm() {
  state.durationMinutes = Number(elements.duration.value);

  state.roleMode =
    document.querySelector('input[name="role-mode"]:checked')?.value ||
    "classic";

  state.spiesSetting = migrateSpiesSetting(elements.spiesCount.value);

  if (elements.spiesCount.value !== state.spiesSetting) {
    elements.spiesCount.value = state.spiesSetting;
  }

  saveSettings();
}
