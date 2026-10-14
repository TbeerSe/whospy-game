/* =========================================================
   features/accessCode.js — ввод личного кода

   Зачем: перехват локации и Верификатор раньше выбирались по
   имени. Любой игрок мог нажать на чужое имя — мирные знают
   локацию и могли «провалить» перехват шпиона специально,
   а тост «нет доступа» выдавал, что игрок не шпион.

   Теперь у каждого игрока есть личный 4-значный код. Он виден
   только на карте роли. Действие выполняется по коду, а не по
   имени, поэтому чужим именем воспользоваться нельзя.

   Защита от перебора: после ACCESS_CODE_MAX_FAILURES неверных
   попыток подряд ввод блокируется на ACCESS_CODE_LOCK_SECONDS.
   Сообщение об ошибке одинаково для «нет такого кода» и «код есть,
   но действие недоступно» — по нему нельзя узнать роль.
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  ACCESS_CODE_LENGTH,
  ACCESS_CODE_MAX_FAILURES,
  ACCESS_CODE_LOCK_SECONDS
} from "../core/state.js";
import { $, openDialog, closeDialog } from "../core/dom.js";
import { playFailure, playSuccess } from "../core/audio.js";
import { saveRoundSnapshot } from "./roundStore.js";

let modal = null;
let pending = null;
let typed = "";
let lockTimer = null;

/* ---------- Генерация уникальных кодов ---------- */
function randomDigits(length) {
  let result = "";

  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint32Array(length);
    window.crypto.getRandomValues(bytes);

    for (let i = 0; i < length; i += 1) {
      result += String(bytes[i] % 10);
    }

    return result;
  }

  for (let i = 0; i < length; i += 1) {
    result += String(Math.floor(Math.random() * 10));
  }

  return result;
}

export function generateAccessCodes(count) {
  const codes = new Set();

  // Кодов гораздо больше, чем игроков (максимум 100), так что
  // цикл завершится почти сразу.
  while (codes.size < count) {
    codes.add(randomDigits(ACCESS_CODE_LENGTH));
  }

  return Array.from(codes);
}

/* ---------- Блокировка ---------- */
export function getLockSecondsLeft() {
  const left = Math.ceil((state.codeLockedUntil - Date.now()) / 1000);
  return Math.max(0, left);
}

function registerFailure() {
  state.codeFailures += 1;

  if (state.codeFailures >= ACCESS_CODE_MAX_FAILURES) {
    state.codeFailures = 0;
    state.codeLockedUntil =
      Date.now() + ACCESS_CODE_LOCK_SECONDS * 1000;
  }

  // Фиксируем счётчик и блокировку сразу: перезагрузка страницы
  // не должна обнулять лимит попыток.
  saveRoundSnapshot();
}

/* ---------- DOM ---------- */
function createModal() {
  let element = $("#access-code-modal");

  if (element) return element;

  element = document.createElement("dialog");
  element.id = "access-code-modal";
  element.className = "access-modal";

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map(
      (n) =>
        `<button type="button" class="access-key" data-access-key="${n}">${n}</button>`
    )
    .join("");

  element.innerHTML = `
    <div class="access-modal__content">
      <p class="access-modal__eyebrow">ДОСТУП // ЛИЧНЫЙ КОД</p>

      <h2 class="access-modal__title" id="access-title">Введите код</h2>

      <p class="access-modal__hint" id="access-hint"></p>

      <div class="access-dots" id="access-dots" aria-live="polite"></div>

      <p class="access-modal__status" id="access-status" role="alert"></p>

      <div class="access-keypad">
        ${keys}
        <button type="button" class="access-key access-key--aux"
                data-access-action="cancel" aria-label="Отмена">✕</button>
        <button type="button" class="access-key" data-access-key="0">0</button>
        <button type="button" class="access-key access-key--aux"
                data-access-action="backspace" aria-label="Стереть">⌫</button>
      </div>
    </div>
  `;

  document.body.appendChild(element);

  element.addEventListener("click", (event) => {
    if (event.target === element) {
      finish(null);
      return;
    }

    const key = event.target.closest("[data-access-key]");

    if (key) {
      pressDigit(key.dataset.accessKey);
      return;
    }

    const action = event.target.closest("[data-access-action]");

    if (!action) return;

    if (action.dataset.accessAction === "cancel") {
      finish(null);
    } else {
      typed = typed.slice(0, -1);
      renderDots();
    }
  });

  element.addEventListener("keydown", (event) => {
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      pressDigit(event.key);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      typed = typed.slice(0, -1);
      renderDots();
    }
  });

  // Закрытие по Escape тоже отменяет запрос.
  element.addEventListener("close", () => {
    if (pending) finish(null);
  });

  return element;
}

function setStatus(text, isError) {
  const status = $("#access-status");

  if (!status) return;

  status.textContent = text || "";
  status.classList.toggle("is-error", Boolean(isError));
}

function renderDots() {
  const dots = $("#access-dots");

  if (!dots) return;

  let html = "";

  for (let i = 0; i < ACCESS_CODE_LENGTH; i += 1) {
    html +=
      '<span class="access-dot' +
      (i < typed.length ? " is-filled" : "") +
      '"></span>';
  }

  dots.innerHTML = html;
}

function setKeypadDisabled(disabled) {
  if (!modal) return;

  modal.querySelectorAll("[data-access-key]").forEach((button) => {
    button.disabled = disabled;
  });
}

function refreshLockState() {
  const left = getLockSecondsLeft();

  if (left > 0) {
    setKeypadDisabled(true);
    setStatus(
      "Слишком много неверных кодов. Подождите " + left + " с.",
      true
    );
    return true;
  }

  if (lockTimer) {
    window.clearInterval(lockTimer);
    lockTimer = null;
  }

  setKeypadDisabled(false);
  return false;
}

function finish(result) {
  if (lockTimer) {
    window.clearInterval(lockTimer);
    lockTimer = null;
  }

  const current = pending;
  pending = null;
  typed = "";

  if (modal && modal.open) {
    closeDialog(modal);
  }

  if (current) current.resolve(result);
}

function pressDigit(digit) {
  if (!pending) return;
  if (refreshLockState()) return;
  if (typed.length >= ACCESS_CODE_LENGTH) return;

  typed += digit;
  renderDots();
  setStatus("", false);

  if (typed.length === ACCESS_CODE_LENGTH) {
    submit();
  }
}

function submit() {
  const code = typed;

  const assignment =
    state.assignments.find((item) => item.accessCode === code) || null;

  const verdict = pending.validate(assignment) || { ok: false };

  if (verdict.ok) {
    playSuccess();
    state.codeFailures = 0;
    finish(assignment);
    return;
  }

  playFailure();

  const countsAsFailure = verdict.failure !== false;

  if (countsAsFailure) registerFailure();

  typed = "";
  renderDots();

  if (countsAsFailure && getLockSecondsLeft() > 0) {
    lockTimer = window.setInterval(refreshLockState, 500);
    refreshLockState();
    return;
  }

  setStatus(verdict.message || "Код не принят", true);
}

/* =========================================================
   Публичный API

   requestAccessCode({ title, hint, validate }) → Promise.
   validate(assignment | null) должен вернуть
     { ok: true }
     или { ok: false, message, failure } — failure=false означает,
     что код верный (не считается попыткой подбора).
   Promise разрешается найденным assignment или null (отмена).
========================================================= */
export function requestAccessCode(options) {
  const { title, hint, validate } = options || {};

  if (pending) finish(null);

  modal = createModal();

  typed = "";

  $("#access-title").textContent = title || "Введите код";
  $("#access-hint").textContent =
    hint || "Код указан на вашей карте роли.";

  setStatus("", false);
  renderDots();

  return new Promise((resolve) => {
    pending = {
      resolve,
      validate:
        typeof validate === "function" ? validate : () => ({ ok: false })
    };

    openDialog(modal);

    if (getLockSecondsLeft() > 0) {
      lockTimer = window.setInterval(refreshLockState, 500);
      refreshLockState();
    } else {
      setKeypadDisabled(false);
    }
  });
}
