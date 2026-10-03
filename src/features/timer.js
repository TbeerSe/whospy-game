/* =========================================================
   features/timer.js — таймер раунда
   ВАЖНО: не импортирует rounds.js, чтобы не было цикла.
   При истечении вызывает setOnTimerExpired(cb) — колбэк
   регистрируется в main.js.
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "../core/state.js";
import { elements } from "../core/dom.js";
import { formatTime } from "../core/utils.js";
import { playTimerTick } from "../core/audio.js";

let onTimerExpired = null;

/* ---------- Регистрация колбэка на истечение ---------- */
export function setOnTimerExpired(callback) {
  onTimerExpired = callback;
}

/* ---------- Отрисовка таймера ---------- */
export function renderTimer() {
  const formatted = formatTime(state.timerRemainingSeconds);

  elements.timerMinutes.textContent = formatted.minutes;
  elements.timerSeconds.textContent = formatted.seconds;

  const progress =
    state.timerTotalSeconds > 0
      ? (state.timerRemainingSeconds / state.timerTotalSeconds) * 100
      : 0;

  elements.timerProgressBar.style.width = `${Math.max(0, progress)}%`;

  elements.gameTimer.classList.toggle(
    "is-warning",
    state.timerRemainingSeconds <= 60 &&
      state.timerRemainingSeconds > 20
  );

  elements.gameTimer.classList.toggle(
    "is-danger",
    state.timerRemainingSeconds <= 20
  );

  elements.timerProgressBar.style.background =
    state.timerRemainingSeconds <= 20
      ? "var(--color-danger)"
      : state.timerRemainingSeconds <= 60
      ? "var(--color-orange)"
      : "var(--color-primary)";
}

/* ---------- Надписи на кнопке «Завершить игру» ---------- */
export function setEndGameButtonToDefault() {
  elements.endGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">■</span>
    Завершить игру
  `;
}

export function setEndGameButtonToMenu() {
  elements.endGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">⌂</span>
    В главное меню
  `;
}

/* ---------- Запуск таймера ---------- */
export function startGameTimer() {
  stopGameTimer();

  const baseSeconds = state.durationMinutes * 60;

  const modifiedSeconds = Math.max(
    60,
    baseSeconds + state.timerModifierSeconds
  );

  state.timerTotalSeconds = modifiedSeconds;
  state.timerRemainingSeconds = modifiedSeconds;

  state.timerPaused = false;
  state.gameEnded = false;
  state.gameOutcome = null;
  state.lastTickSecond = null;
  state.revealRunId += 1;

  elements.gameResult.classList.add("is-hidden");
  setEndGameButtonToDefault();

  elements.pauseGame.disabled = false;

  const timerWrapper = elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "";
  }

  elements.pauseGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">Ⅱ</span>
    Пауза
  `;

  elements.gameStatus.innerHTML = `
    <span class="status-dot status-dot--active"></span>
    LIVE
  `;

  renderTimer();

  state.timerInterval = window.setInterval(() => {
    if (state.timerPaused || state.gameEnded) {
      return;
    }

    state.timerRemainingSeconds -= 1;

    if (
      state.timerRemainingSeconds <= 20 &&
      state.timerRemainingSeconds > 0
    ) {
      if (state.lastTickSecond !== state.timerRemainingSeconds) {
        playTimerTick();
        state.lastTickSecond = state.timerRemainingSeconds;
      }
    }

    renderTimer();

    if (state.timerRemainingSeconds <= 0) {
      if (typeof onTimerExpired === "function") {
        onTimerExpired();
      }
    }
  }, 1000);
}

/* ---------- Остановка таймера ---------- */
export function stopGameTimer() {
  if (state.timerInterval !== null) {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

/* ---------- Пауза/продолжение ---------- */
export function togglePauseTimer() {
  if (state.timerRemainingSeconds <= 0 || state.gameEnded) {
    return;
  }

  state.timerPaused = !state.timerPaused;

  if (state.timerPaused) {
    elements.pauseGame.innerHTML = `
      <span class="button__icon" aria-hidden="true">▶</span>
      Продолжить
    `;

    elements.gameStatus.innerHTML = `
      <span class="status-dot"></span>
      PAUSED
    `;
  } else {
    elements.pauseGame.innerHTML = `
      <span class="button__icon" aria-hidden="true">Ⅱ</span>
      Пауза
    `;

    elements.gameStatus.innerHTML = `
      <span class="status-dot status-dot--active"></span>
      LIVE
    `;
  }
}
