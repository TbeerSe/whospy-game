/* =========================================================
   main.js — точка входа приложения
   Patch 0.4.4
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "./core/state.js";
import { showScreen } from "./core/dom.js";
import { loadSettings } from "./core/storage.js";
import { toggleSound } from "./core/audio.js";

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
  setupBeforeUnloadSnapshot,
  setupRulesHandlers
} from "./features/handlers.js";

import { setOnTimerExpired } from "./features/timer.js";
import { finishTimer } from "./features/rounds.js";

/* =========================================================
   Тумблер звука в шапке
========================================================= */

// PATCH 0.4.3 — fix: кнопка тумблера звука создаётся здесь
// и вставляется после .header-status. Класс .sound-toggle
// и модификатор .is-muted уже описаны в css/components.css.
function setupSoundToggle() {
  const container = document.querySelector(".header-status");

  if (!container) return;

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

function init() {
  loadPlayers();
  loadCustomLocations();
  loadSettings();

  // PATCH 0.4.2 — загружаем пул выбранных локаций
  // после customLocations, чтобы можно было валидировать.
  loadSelectedLocations();

  renderDefaultLocations();
  renderCustomLocations();

  // PATCH 0.4 — актуализируем текст хинта выбора локаций.
  updateLocationHint();

  setupPlayerHandlers();
  setupSettingsHandlers();
  setupDealingHandlers();
  setupTimerHandlers();
  setupCustomPackHandlers();

  // PATCH 0.4.4 — модалка правил игры.
  setupRulesHandlers();

  setupPointerEntropyTracking();
  setupBeforeUnloadSnapshot();

  // PATCH 0.4.3 — fix: создаём кнопку тумблера звука.
  setupSoundToggle();

  // Разрываем цикл timer → rounds через колбэк.
  // Когда таймер дойдёт до нуля, он вызовет finishTimer() из rounds.js.
  setOnTimerExpired(() => finishTimer());

  showScreen("settings");
}

/* =========================================================
   Публичный API
========================================================= */

// PATCH 0.4.2 — экспортируем тумблер звука для внешнего UI.
window.__spyfall = {
  toggleSound,
  getSoundEnabled: () => state.soundEnabled
};

/* =========================================================
   Автозапуск после готовности DOM
========================================================= */

document.addEventListener("DOMContentLoaded", init);