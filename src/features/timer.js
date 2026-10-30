/* =========================================================
   features/timer.js — таймер раунда

   v0.8.0:
   - Таймер считает по часам (дедлайн Date.now()), а не по числу
     тиков setInterval. Блокировка экрана и фоновая вкладка больше
     не растягивают раунд.
   - К времени добавляется скрытая добавка (TIMER_NOISE_STEPS),
     чтобы по стартовому таймеру нельзя было вычислить владельца
     Глушителя или Допроса.
   - Снимок раунда пишется каждые 5 секунд (см. roundStore.js).
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  pushRoundEvent,
  MIN_TIMER_SECONDS
} from "../core/state.js";
import { elements } from "../core/dom.js";
import { formatTime } from "../core/utils.js";
import { playTimerTick } from "../core/audio.js";
import { saveRoundSnapshot } from "./roundStore.js";

let onTimerExpired = null;

/* ---------- Регистрация колбэка на истечение ---------- */
export function setOnTimerExpired(callback) {
  onTimerExpired = callback;
}

/* ---------- Сколько секунд осталось ---------- */
export function getRemainingSeconds() {
  if (state.timerPaused) {
    const ms =
      state.timerPausedRemainingMs !== null
        ? state.timerPausedRemainingMs
        : state.timerRemainingSeconds * 1000;

    return Math.max(0, Math.ceil(ms / 1000));
  }

  if (state.timerDeadline === null) {
    return Math.max(0, state.timerRemainingSeconds);
  }

  return Math.max(
    0,
    Math.ceil((state.timerDeadline - Date.now()) / 1000)
  );
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

/* ---------- Надписи на кнопках ---------- */
export function setEndGameButtonToDefault() {
  elements.endGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">✕</span>
    Отменить раунд
  `;
}

export function setEndGameButtonToMenu() {
  elements.endGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">⌂</span>
    В главное меню
  `;
}

function setPauseButton(paused) {
  elements.pauseGame.innerHTML = paused
    ? `
      <span class="button__icon" aria-hidden="true">▶</span>
      Продолжить
    `
    : `
      <span class="button__icon" aria-hidden="true">Ⅱ</span>
      Пауза
    `;

  elements.gameStatus.innerHTML = paused
    ? `
      <span class="status-dot"></span>
      PAUSED
    `
    : `
      <span class="status-dot status-dot--active"></span>
      LIVE
    `;
}

/* ---------- Один тик ---------- */
function tick() {
  if (state.timerPaused || state.gameEnded) {
    return;
  }

  if (state.timerDeadline === null) {
    return;
  }

  const remaining = getRemainingSeconds();

  if (remaining === state.timerRemainingSeconds && remaining > 0) {
    return;
  }

  state.timerRemainingSeconds = remaining;

  if (remaining <= 20 && remaining > 0) {
    if (state.lastTickSecond !== remaining) {
      playTimerTick();
      state.lastTickSecond = remaining;

      if ([20, 10, 5].includes(remaining)) {
        pushRoundEvent("timer_warning", { remaining });
      }
    }
  }

  renderTimer();

  if (remaining > 0 && remaining % 5 === 0) {
    saveRoundSnapshot();
  }

  if (remaining <= 0) {
    if (typeof onTimerExpired === "function") {
      onTimerExpired();
    }
  }
}

function startLoop() {
  if (state.timerInterval !== null) {
    window.clearInterval(state.timerInterval);
  }

  // 250 мс: реакция на возврат вкладки и ровная смена секунд.
  state.timerInterval = window.setInterval(tick, 250);
}

/* ---------- Запуск таймера ---------- */
export function startGameTimer() {
  stopGameTimer();

  const baseSeconds = state.durationMinutes * 60;

  const modifiedSeconds = Math.max(
    MIN_TIMER_SECONDS,
    baseSeconds + state.timerModifierSeconds + state.timerNoiseSeconds
  );

  state.timerTotalSeconds = modifiedSeconds;
  state.timerRemainingSeconds = modifiedSeconds;
  state.timerDeadline = Date.now() + modifiedSeconds * 1000;
  state.timerPausedRemainingMs = null;

  // Хронология раунда начинается с раздачи (prepareDealingScreen).
  if (state.currentRoundStartedAt === null) {
    state.currentRoundStartedAt = Date.now();
    state.currentRoundEvents = [];
  }

  // Трекинг дельт баланса: в итогах показывается, сколько получил
  // и потерял каждый игрок.
  state.lastBalanceChanges = {};

  state.priorInterceptFailures = 0;
  state.interceptAttempts = new Set();
  state.interceptResults = [];
  state.interceptInProgress = false;
  state.votingInProgress = false;
  state.wrongVotes = {};
  state.partialCatches = [];
  state.roundSettled = false;
  state.roundPhase = "game";

  pushRoundEvent("timer_start", {
    totalSeconds: modifiedSeconds,
    baseSeconds,
    modifierSeconds: state.timerModifierSeconds
  });

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

  setPauseButton(false);
  renderTimer();
  startLoop();
  saveRoundSnapshot();
}

/* ---------- Восстановление таймера после перезагрузки ----------
   Раунд всегда продолжается с паузы: игроки нажимают «Продолжить»
   тогда, когда все снова за столом. */
export function restoreGameTimer() {
  stopGameTimer();

  state.lastTickSecond = null;
  state.timerPaused = true;
  state.timerDeadline = null;

  elements.gameResult.classList.add("is-hidden");
  setEndGameButtonToDefault();
  elements.pauseGame.disabled = false;

  const timerWrapper = elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "";
  }

  setPauseButton(true);
  renderTimer();
  startLoop();
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
  if (state.gameEnded) {
    return;
  }

  if (!state.timerPaused) {
    const remaining = getRemainingSeconds();

    if (remaining <= 0) return;

    state.timerPausedRemainingMs = Math.max(
      0,
      state.timerDeadline - Date.now()
    );
    state.timerPaused = true;
    state.timerRemainingSeconds = remaining;
  } else {
    const rest =
      state.timerPausedRemainingMs !== null
        ? state.timerPausedRemainingMs
        : state.timerRemainingSeconds * 1000;

    state.timerDeadline = Date.now() + rest;
    state.timerPausedRemainingMs = null;
    state.timerPaused = false;
  }

  pushRoundEvent(
    state.timerPaused ? "timer_paused" : "timer_resumed",
    { remaining: state.timerRemainingSeconds }
  );

  setPauseButton(state.timerPaused);
  saveRoundSnapshot();
}

/* ---------- Автопауза на время перехвата ----------
   Пока шпион выбирает локацию, общий таймер стоит. Если игроки уже
   поставили паузу вручную, мы её не трогаем и не снимаем. */
let suspendedByIntercept = false;

export function suspendTimerForIntercept() {
  if (state.gameEnded || state.timerPaused || suspendedByIntercept) return;
  if (state.timerDeadline === null) return;

  const remaining = getRemainingSeconds();
  if (remaining <= 0) return;

  state.timerPausedRemainingMs = Math.max(
    0,
    state.timerDeadline - Date.now()
  );
  state.timerPaused = true;
  state.timerRemainingSeconds = remaining;
  suspendedByIntercept = true;

  pushRoundEvent("timer_paused", { remaining, reason: "intercept" });
  setPauseButton(true);
  saveRoundSnapshot();
}

export function resumeTimerAfterIntercept() {
  if (!suspendedByIntercept) return;
  suspendedByIntercept = false;

  if (state.gameEnded || !state.timerPaused) return;

  const rest =
    state.timerPausedRemainingMs !== null
      ? state.timerPausedRemainingMs
      : state.timerRemainingSeconds * 1000;

  state.timerDeadline = Date.now() + rest;
  state.timerPausedRemainingMs = null;
  state.timerPaused = false;

  pushRoundEvent("timer_resumed", {
    remaining: state.timerRemainingSeconds,
    reason: "intercept"
  });
  setPauseButton(false);
  saveRoundSnapshot();
}

/* Вкладка вернулась из фона — сразу догоняем реальное время. */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
}
