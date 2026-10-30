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

import {
  state,
  pushRoundEvent,
  INTERCEPT_WINDOW_SECONDS
} from "../core/state.js";
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
import {
  suspendTimerForIntercept,
  resumeTimerAfterIntercept
} from "./timer.js";

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
   15 секунд на выбор локации
========================================================= */

let interceptCountdownInterval = null;
let interceptCountdownDeadline = 0;
let interceptCountdownPlayer = "";
let interceptLastSecond = null;
let interceptCountdownTotal = INTERCEPT_WINDOW_SECONDS;

function stopInterceptCountdown() {
  if (interceptCountdownInterval !== null) {
    window.clearInterval(interceptCountdownInterval);
    interceptCountdownInterval = null;
  }

  interceptCountdownDeadline = 0;
  interceptCountdownPlayer = "";
  interceptLastSecond = null;

  // Отсчёт закончился (выбор, провал или закрытие окна): общий таймер идёт дальше.
  resumeTimerAfterIntercept();
}

function renderInterceptCountdown(modal) {
  if (state.gameEnded) {
    stopInterceptCountdown();
    if (modal.open) closeDialog(modal);
    return;
  }

  const remaining = Math.max(
    0,
    Math.ceil((interceptCountdownDeadline - Date.now()) / 1000)
  );

  if (remaining !== interceptLastSecond) {
    interceptLastSecond = remaining;

    const value = modal.querySelector("[data-intercept-countdown-value]");
    const ring = modal.querySelector("[data-intercept-countdown]");
    const progress = Math.max(
      0,
      Math.min(100, (remaining / interceptCountdownTotal) * 100)
    );

    if (value) value.textContent = String(remaining).padStart(2, "0");
    if (ring) {
      ring.style.setProperty("--intercept-progress", `${progress}%`);
      ring.classList.toggle("is-danger", remaining <= 5);
      ring.setAttribute("aria-label", `Осталось ${remaining} секунд`);
    }
  }

  if (remaining <= 0) {
    const player = interceptCountdownPlayer;
    stopInterceptCountdown();
    modal.dataset.selectedPlayer = "";
    modal.dataset.selectedLocation = "";
    closeDialog(modal);
    executeIntercept(player, null, { timedOut: true });
  }
}

function startInterceptCountdown(
  modal,
  player,
  seconds = INTERCEPT_WINDOW_SECONDS
) {
  stopInterceptCountdown();
  interceptCountdownPlayer = player;
  interceptCountdownTotal = seconds;
  interceptCountdownDeadline = Date.now() + seconds * 1000;

  // Пока идёт выбор локации, общий таймер раунда стоит.
  suspendTimerForIntercept();
  renderInterceptCountdown(modal);
  interceptCountdownInterval = window.setInterval(
    () => renderInterceptCountdown(modal),
    100
  );
}

/* Общий таймер истёк, пока шпион был в окне выбора:
   это провал перехвата, а не победа ожиданием. */
export function expireActiveIntercept() {
  const modal = $("#intercept-window-modal");
  if (!modal?.open || !interceptCountdownPlayer) return false;

  const player = interceptCountdownPlayer;
  stopInterceptCountdown();
  modal.dataset.selectedPlayer = "";
  modal.dataset.selectedLocation = "";
  closeDialog(modal);
  executeIntercept(player, null, { timedOut: true });
  return true;
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
  setInterceptModalMode(modal, {
    fakeId: false,
    seconds: INTERCEPT_WINDOW_SECONDS
  });

  openDialog(modal);
  startInterceptCountdown(modal, assignment.player);
}

/* =========================================================
   Перехват после фальшивого удостоверения
   Код вводить не нужно: окно открывается само, только для
   спасённого шпиона, на 10 секунд. Общий таймер на паузе.
========================================================= */

export const FAKE_ID_INTERCEPT_SECONDS = 10;

export function startFakeIdIntercept(player) {
  if (state.gameEnded || !isInterceptAvailable(player)) return false;

  const modal = createInterceptWindowModal();

  resetInterceptModal(modal, player);
  setInterceptModalMode(modal, {
    fakeId: true,
    seconds: FAKE_ID_INTERCEPT_SECONDS
  });

  openDialog(modal);
  startInterceptCountdown(modal, player, FAKE_ID_INTERCEPT_SECONDS);
  return true;
}

/* =========================================================
   Шаг 2: выбор локации
========================================================= */

function setInterceptModalMode(modal, { fakeId, seconds }) {
  const set = (selector, text) => {
    const node = modal.querySelector(selector);
    if (node) node.textContent = text;
  };

  set(
    ".intercept-window-modal__title",
    fakeId ? "Шпион, выбирайте локацию" : "Код принят"
  );

  set(
    ".intercept-window__hint",
    fakeId
      ? "Фальшивое удостоверение сработало. Шпион берёт телефон и " +
        "выбирает локацию. Выбор увидят все, кто смотрит на экран."
      : "Выберите локацию, которую считаете настоящей. " +
        "Выбор увидят все, кто смотрит на экран."
  );

  set(
    ".intercept-window__countdown-copy strong",
    `Решение за ${seconds} секунд`
  );

  const value = modal.querySelector("[data-intercept-countdown-value]");
  if (value) value.textContent = String(seconds).padStart(2, "0");
}

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

      <div
        class="intercept-window__countdown"
        data-intercept-countdown
        role="timer"
        aria-live="off"
      >
        <span class="intercept-window__countdown-ring" aria-hidden="true">
          <strong data-intercept-countdown-value>15</strong>
        </span>
        <span class="intercept-window__countdown-copy">
          <strong>Решение за 15 секунд</strong>
          <span>Не успеете подтвердить или закроете окно — перехват провален.</span>
        </span>
      </div>

      <h3 class="intercept-window__section-title">
        Какая локация
      </h3>

      <div class="intercept-window__locations judging-location-list"></div>

      <p class="intercept-window__warning">
        Выбор финален. Ошибка, истечение времени или закрытие окна — выбывание из раунда.
      </p>

      <div class="intercept-window-modal__actions">
        <button
          type="button"
          class="button button--danger button--full"
          data-intercept-confirm
          disabled
        >
          Подтвердить перехват
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("cancel", (event) => {
    // Escape не должен давать второй отсчёт или паузу для ожидания.
    event.preventDefault();
  });

  // Окно закрыто не нашими путями (системная «Назад» на Android,
  // жест, программное закрытие): отсчёт ещё идёт. Считаем это
  // провалом, иначе можно открыть окно заново и получить новые 15 секунд.
  modal.addEventListener("close", () => {
    const player = interceptCountdownPlayer;

    if (!player || state.gameEnded) {
      stopInterceptCountdown();
      return;
    }

    stopInterceptCountdown();
    modal.dataset.selectedPlayer = "";
    modal.dataset.selectedLocation = "";
    executeIntercept(player, null, { timedOut: true });
  });

  modal.addEventListener("click", (event) => {
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

    stopInterceptCountdown();
    closeDialog(modal);

    executeIntercept(selectedPlayer, location);
  });

  return modal;
}

/* =========================================================
   Выполнение перехвата
========================================================= */

function executeIntercept(player, location, options = {}) {
  stopInterceptCountdown();

  const timedOut = options.timedOut === true;

  if (state.gameEnded) return;
  if (state.interceptInProgress) return;
  if (!player || (!location && !timedOut)) return;

  if (!isInterceptAvailable(player)) return;

  const assignment = state.assignments.find(
    (item) => item.player === player
  );

  pushRoundEvent("intercept_public_started", { player });

  state.interceptAttempts.add(player);
  state.interceptInProgress = true;

  const isCorrect = !timedOut && location === state.currentRoundLocation;
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
    location: timedOut ? null : location,
    success: false,
    reason: timedOut ? "timeout" : "wrong-location",
    priorFailures,
    reward: 0
  });

  pushRoundEvent(timedOut ? "intercept_timeout" : "intercept_failure", {
    player,
    location: timedOut ? null : location,
    priorFailures
  });

  state.priorInterceptFailures += 1;

  assignment.excluded = true;

  playInterceptFailure();
  flashScreen("red");

  showToast(
    timedOut
      ? `${player} не успел выбрать локацию или закрыл окно и выбывает. Локация скрыта.`
      : `${player} провалил перехват и выбывает. Локация скрыта.`
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