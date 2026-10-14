/* =========================================================
   features/intercept.js — персональный перехват локации

   v0.8.5:
   - Убран флаг votingInProgress из isInterceptAvailable и
     isInterceptBlocked. Раньше достаточно было нажать на
     подозреваемого, чтобы заблокировать перехват навсегда
     (кнопки отмены голосования не было).
   - Победа по истощению мирных считается через
     getActiveCounts() (единая точка в rounds.js).
========================================================= */
// @ts-nocheck
"use strict";

import { state, pushRoundEvent } from "../core/state.js";
import { $, openDialog, closeDialog } from "../core/dom.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { playTone } from "../core/audio.js";
import { requestAccessCode } from "./accessCode.js";
import {
  finishBySpyLocation,
  finishByShutdown,
  finishByAllSpiesFailed,
  getActiveCounts
} from "./rounds.js";
import { saveRoundSnapshot } from "./roundStore.js";

/* =========================================================
   Колбэк окончания перехвата
========================================================= */

let onInterceptFinished = null;

export function setOnInterceptFinished(callback) {
  onInterceptFinished = callback;
}

function notifyInterceptFinished() {
  if (typeof onInterceptFinished === "function") {
    onInterceptFinished();
  }
}

/* =========================================================
   Проверки доступности
========================================================= */

export function isInterceptAvailable(player) {
  if (state.gameEnded) return false;
  if (state.interceptInProgress) return false;

  const assignment = state.assignments.find(
    (item) => item.player === player
  );

  if (!assignment) return false;
  if (assignment.roleType !== "spy") return false;
  if (assignment.excluded) return false;

  if (state.interceptAttempts.has(player)) return false;

  return true;
}

export function getAvailableInterceptors() {
  return state.assignments
    .filter((assignment) =>
      isInterceptAvailable(assignment.player)
    )
    .map((assignment) => assignment.player);
}

export function isInterceptBlocked() {
  if (state.gameEnded) return true;
  if (state.interceptInProgress) return true;
  return false;
}

/* =========================================================
   Шаг 1: ввод кода
========================================================= */

export async function openInterceptWindow() {
  if (state.gameEnded) return;

  if (state.interceptInProgress) {
    showToast("Перехват уже выполняется");
    return;
  }

  const assignment = await requestAccessCode({
    title: "Перехват локации",
    hint:
      "Введите личный код с вашей карты роли. " +
      "Его знает только шпион.",
    validate(found) {
      if (!found) {
        return { ok: false, message: "Код не принят" };
      }

      if (!isInterceptAvailable(found.player)) {
        return { ok: false, message: "Код не принят" };
      }

      return { ok: true };
    }
  });

  if (!assignment) return;

  if (state.gameEnded || !isInterceptAvailable(assignment.player)) {
    return;
  }

  const modal = createInterceptWindowModal();

  resetInterceptModal(modal, assignment.player);

  openDialog(modal);
}

/* =========================================================
   Шаг 2: выбор локации
========================================================= */

function resetInterceptModal(modal, player) {
  modal.dataset.selectedPlayer = player;
  modal.dataset.selectedLocation = "";

  const locationsContainer = modal.querySelector(
    ".intercept-window__locations"
  );

  if (locationsContainer) {
    const locations = state.roundPool.length
      ? state.roundPool
      : state.selectedLocations;

    locationsContainer.innerHTML = locations
      .map(
        (location) => `
          <button
            type="button"
            class="judging-location-button"
            data-intercept-location="${escapeHtml(location.name)}"
          >
            ${escapeHtml(location.name)}
          </button>
        `
      )
      .join("");
  }

  updateConfirmButtonState(modal);
}

function updateConfirmButtonState(modal) {
  const confirmBtn = modal.querySelector(
    "[data-intercept-confirm]"
  );

  if (!confirmBtn) return;

  confirmBtn.disabled = !(
    modal.dataset.selectedPlayer && modal.dataset.selectedLocation
  );
}

/* =========================================================
   Создание модалки
========================================================= */

function createInterceptWindowModal() {
  let modal = $("#intercept-window-modal");

  if (modal) return modal;

  modal = document.createElement("dialog");
  modal.id = "intercept-window-modal";
  modal.className = "intercept-window-modal";

  modal.innerHTML = `
    <div class="intercept-window-modal__content">
      <p class="intercept-window-modal__eyebrow">
        СПЕЦОПЕРАЦИЯ // ПЕРЕХВАТ ЛОКАЦИИ
      </p>

      <h2 class="intercept-window-modal__title">
        Код принят
      </h2>

      <p class="intercept-window__hint">
        Выберите локацию, которую считаете настоящей.
        Выбор увидят все, кто смотрит на экран.
      </p>

      <h3 class="intercept-window__section-title">
        Какая локация
      </h3>

      <div class="intercept-window__locations judging-location-list"></div>

      <p class="intercept-window__warning">
        Отмены нет. После подтверждения выбор финален.
        Провал — выбывание из раунда.
      </p>

      <div class="intercept-window-modal__actions">
        <button
          type="button"
          class="button button--secondary"
          data-intercept-cancel
        >
          Отмена
        </button>

        <button
          type="button"
          class="button button--danger"
          data-intercept-confirm
          disabled
        >
          Проверить
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (
      event.target === modal ||
      event.target.closest("[data-intercept-cancel]")
    ) {
      modal.dataset.selectedPlayer = "";
      closeDialog(modal);
      return;
    }

    const locationBtn = event.target.closest(
      "[data-intercept-location]"
    );

    if (locationBtn) {
      modal.dataset.selectedLocation =
        locationBtn.dataset.interceptLocation;

      modal
        .querySelectorAll("[data-intercept-location]")
        .forEach((button) => {
          button.classList.toggle(
            "is-selected",
            button === locationBtn
          );
        });

      updateConfirmButtonState(modal);
      return;
    }

    const confirmBtn = event.target.closest(
      "[data-intercept-confirm]"
    );

    if (!confirmBtn || confirmBtn.disabled) return;

    const selectedPlayer = modal.dataset.selectedPlayer;
    const location = modal.dataset.selectedLocation;

    modal.dataset.selectedPlayer = "";
    modal.dataset.selectedLocation = "";

    closeDialog(modal);

    executeIntercept(selectedPlayer, location);
  });

  return modal;
}

/* =========================================================
   Выполнение перехвата
========================================================= */

function executeIntercept(player, location) {
  if (state.gameEnded) return;
  if (state.interceptInProgress) return;
  if (!player || !location) return;

  if (!isInterceptAvailable(player)) return;

  const assignment = state.assignments.find(
    (item) => item.player === player
  );

  pushRoundEvent("intercept_public_started", { player });

  state.interceptAttempts.add(player);
  state.interceptInProgress = true;

  const isCorrect = location === state.currentRoundLocation;
  const priorFailures = state.priorInterceptFailures;

  if (isCorrect) {
    state.interceptResults.push({
      player,
      location,
      success: true,
      priorFailures,
      reward: 0
    });

    pushRoundEvent("intercept_success", {
      player,
      location,
      priorFailures
    });

    playInterceptSuccess();
    flashScreen("green");

    state.interceptInProgress = false;

    finishBySpyLocation(player, location);
    return;
  }

  state.interceptResults.push({
    player,
    location,
    success: false,
    priorFailures,
    reward: 0
  });

  pushRoundEvent("intercept_failure", {
    player,
    location,
    priorFailures
  });

  state.priorInterceptFailures += 1;

  assignment.excluded = true;

  playInterceptFailure();
  flashScreen("red");

  showToast(
    `${player} провалил перехват и выбывает. ` +
    `Локация скрыта.`
  );

  state.interceptInProgress = false;

  const { spies: activeSpies, civilians: activeCivilians } =
    getActiveCounts();

  if (activeSpies === 0) {
    finishByAllSpiesFailed();
    return;
  }

  if (activeCivilians <= activeSpies) {
    finishByShutdown();
    return;
  }

  saveRoundSnapshot();
  notifyInterceptFinished();
}

/* =========================================================
   Звук и визуал
========================================================= */

function playInterceptSuccess() {
  playTone({
    frequency: 523.25,
    duration: 0.1,
    type: "square",
    volume: 0.054
  });

  playTone({
    frequency: 783.99,
    duration: 0.18,
    type: "square",
    volume: 0.054,
    delay: 0.11
  });
}

function playInterceptFailure() {
  playTone({
    frequency: 230,
    duration: 0.16,
    type: "sawtooth",
    volume: 0.066
  });

  playTone({
    frequency: 130,
    duration: 0.24,
    type: "sawtooth",
    volume: 0.066,
    delay: 0.17
  });
}

function flashScreen(color) {
  const flash = document.createElement("div");

  flash.className = "intercept-flash intercept-flash--" + color;

  document.body.appendChild(flash);

  window.setTimeout(() => {
    if (flash.parentNode) {
      flash.parentNode.removeChild(flash);
    }
  }, 700);
}