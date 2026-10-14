/* =========================================================
   main.js — точка входа приложения
   v0.8.5 — нулевая сумма экономики, отмена голосования, кэп таймера
   (до этого: v0.8.4 — криптослучайность ролей, PWA, блокировка кодов)
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "./core/state.js";
import { showScreen } from "./core/dom.js";
import {
  loadSettings,
  loadRoundHistory,
  saveToStorage
} from "./core/storage.js";
import { toggleSound, initAudioLifecycle } from "./core/audio.js";
import { STORAGE_KEYS } from "./core/state.js";

import { loadPlayers } from "./features/players.js";
import {
  loadCustomLocations,
  loadSelectedLocations,
  renderDefaultLocations,
  renderCustomLocations,
  updateLocationHint
} from "./features/locations.js";

import {
  setupPlayerHandlers,
  setupSettingsHandlers,
  setupDealingHandlers,
  setupTimerHandlers,
  setupCustomPackHandlers,
  setupPointerEntropyTracking,
  setupRoundPersistence,
  setupRulesHandlers,
  setupStatisticsHandlers,
  setupFullBackupHandlers,
  setupRoundDetailHandlers
} from "./features/handlers.js";

import { setOnTimerExpired } from "./features/timer.js";
import { finishTimer } from "./features/rounds.js";
import { offerResumeIfNeeded } from "./features/resume.js";

// PATCH 0.7.0 — перехват перерисовывает интерфейс судейства
// через колбэк, чтобы не было циклического импорта
// intercept.js → judging.js → intercept.js.
import { setOnInterceptFinished } from "./features/intercept.js";
import { setOnVerificatorUsed } from "./features/verificator.js";
import { renderJudgingInterface } from "./features/judging.js";

/* =========================================================
   Тумблер звука в шапке
========================================================= */

function setupSoundToggle() {
  const container = document.querySelector(".header-status");

  if (!container) return;

  if (document.querySelector(".sound-toggle")) return;

  const button = document.createElement("button");

  button.type = "button";
  button.className = "sound-toggle";
  button.setAttribute("aria-label", "Звук");
  button.title = "Включить/выключить звук";
  button.classList.toggle("is-muted", !state.soundEnabled);

  button.addEventListener("click", () => {
    const enabled = window.__spyfall.toggleSound();
    button.classList.toggle("is-muted", !enabled);
  });

  container.insertAdjacentElement("afterend", button);
}

/* =========================================================
   Инициализация
========================================================= */

async function init() {
  // 1. Загрузка из localStorage.
  loadPlayers();
  loadCustomLocations();
  loadSettings();
  loadSelectedLocations();
  loadRoundHistory();

  renderDefaultLocations();
  renderCustomLocations();
  updateLocationHint();

  // 2. Обработчики событий.
  setupPlayerHandlers();
  setupSettingsHandlers();
  setupDealingHandlers();
  setupTimerHandlers();
  setupCustomPackHandlers();
  setupRulesHandlers();
  setupStatisticsHandlers();
  setupFullBackupHandlers();
  setupRoundDetailHandlers();
  setupPointerEntropyTracking();

  // 3. Lifecycle — звук останавливается при потере фокуса.
  initAudioLifecycle();

  // 4. Снимок раунда при сворачивании / закрытии вкладки.
  setupRoundPersistence();

  // 5. Тумблер звука в шапке.
  setupSoundToggle();

  // 6. Разрываем цикл timer → rounds через колбэк.
  setOnTimerExpired(() => finishTimer());

  // 7. PATCH 0.7.0 — разрываем цикл intercept → judging.
  // После завершения перехвата (успех/провал/отказ) нужно
  // перерисовать интерфейс судейства: обновить состояние
  // кнопки перехвата, метки исключённых, кнопки Верификатора.
  setOnInterceptFinished(() => renderJudgingInterface());

  // 8. PATCH 0.7.0 — разрываем цикл verificator → judging.
  // После использования Верификатора его кнопка должна
  // исчезнуть из списка доступных.
  setOnVerificatorUsed(() => renderJudgingInterface());

  // 9. Показать экран настроек (стартовый).
  showScreen("settings");

  // 10. Незавершённый раунд: продолжить или отменить с возвратом
  // предметов.
  offerResumeIfNeeded();
}

/* =========================================================
   Публичный API
========================================================= */

window.__spyfall = {
  toggleSound,
  getSoundEnabled: () => state.soundEnabled
};

/* =========================================================
   PWA: офлайн-режим и установка на экран «Домой».
   Только по http(s) — на file:// service worker недоступен.
========================================================= */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* офлайн-режим необязателен — игра работает и без него */
    });
  });
}

registerServiceWorker();

/* =========================================================
   Автозапуск после готовности DOM
========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
