/* =========================================================
   core/storage.js — localStorage + настройки
   PATCH 0.7.1:
   - Удалён мёртвый блок scheduleCloudSync / pendingCloudSyncTimer,
     который ссылался на несуществующие isCloudAvailable,
     collectLocalSnapshot и forceCloudSync.
   PATCH 0.7.2:
   - Удалены режимы 1–75% и 1–100%. Старые сохранённые
     значения "p75" / "p100" (и их синонимы) откатываются
     к "p50", чтобы селект не остался пустым.
========================================================= */
// @ts-nocheck
"use strict";

import { STORAGE_KEYS, state, MAX_ROUND_HISTORY } from "./state.js";
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
// PATCH 0.7.2 — поддержка только "1" / "p25" / "p50".
// Любое устаревшее значение (random, all, 2–5, p75, p100)
// откатывается к ближайшему допустимому режиму.
export function migrateSpiesSetting(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return "p25";
  }

  const value = String(rawValue);

  if (value === "random") return "p25";

  // «all» раньше соответствовал p100. Теперь p100 убран —
  // откатываем к максимально допустимому режиму p50.
  if (value === "all") return "p50";

  // Старое «2–5 шпионов» мапим в вероятностные режимы.
  if (value === "2") return "p25";
  if (value === "3" || value === "4" || value === "5") return "p50";

  // Старые сохранённые p75 / p100 откатываем к p50.
  if (value === "p75" || value === "p100") return "p50";

  if (["1", "p25", "p50"].includes(value)) {
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

  state.announceSpies = savedSettings.announceSpies !== false;

  if (elements.announceSpies) {
    elements.announceSpies.checked = state.announceSpies;
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
    announceSpies: state.announceSpies,
    spiesSetting: state.spiesSetting,
    soundEnabled: state.soundEnabled
  });
}

export function readSettingsFromForm() {
  state.durationMinutes = Number(elements.duration.value);

  if (elements.announceSpies) {
    state.announceSpies = elements.announceSpies.checked;
  }

  state.spiesSetting = migrateSpiesSetting(elements.spiesCount.value);

  if (elements.spiesCount.value !== state.spiesSetting) {
    elements.spiesCount.value = state.spiesSetting;
  }

  saveSettings();
}

/* =========================================================
   PATCH 0.6.7 — История раундов (статистика)
========================================================= */

/* ---------- Загрузка истории раундов из localStorage ---------- */
export function loadRoundHistory() {
  const saved = readFromStorage(STORAGE_KEYS.roundHistory, []);

  state.roundHistory = Array.isArray(saved)
    ? saved.filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof entry.id === "string" &&
          Array.isArray(entry.players)
      )
    : [];

  return state.roundHistory;
}

/* ---------- Сохранение истории раундов ---------- */
export function saveRoundHistory() {
  if (state.roundHistory.length > MAX_ROUND_HISTORY) {
    state.roundHistory = state.roundHistory.slice(
      -MAX_ROUND_HISTORY
    );
  }

  saveToStorage(STORAGE_KEYS.roundHistory, state.roundHistory);
}

/* ---------- Добавление записи о раунде ---------- */
export function appendRoundHistory(entry) {
  if (!entry || typeof entry !== "object") return;

  state.roundHistory.push(entry);

  if (state.roundHistory.length > MAX_ROUND_HISTORY) {
    state.roundHistory = state.roundHistory.slice(
      -MAX_ROUND_HISTORY
    );
  }

  saveRoundHistory();
}

/* ---------- Полная очистка истории ---------- */
export function clearRoundHistory() {
  state.roundHistory = [];
  saveRoundHistory();
}