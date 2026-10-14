/* =========================================================
   features/verificator.js — логика Верификатора
   PATCH 0.7.0

   Два типа Верификатора: мирный и шпионский.
   - Активируются в features/gadgets.js (30% через TRNG).
   - Используются один раз. Результат виден всем.
   - Мирный: правда с вероятностью 75%.
   - Шпионский: инверсия правды с вероятностью 75%
     (то есть тоже 75% «правильный по своей логике» вердикт,
      но он противоположен реальности в 75% случаев).

   Отдельный TRNG-поток: XOR с VERIFICATOR_VERDICT_SEED_CONSTANT
   и хешем "owner|target", чтобы разные проверки и разные пары
   давали независимые результаты.
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  VERIFICATOR_TRUTH_RATE,
  VERIFICATOR_VERDICT_SEED_CONSTANT,
  pushRoundEvent
} from "../core/state.js";
import { $, openDialog, closeDialog } from "../core/dom.js";
import {
  escapeHtml,
  stringToSeed,
  createRandomGenerator
} from "../core/utils.js";
import { playSuccess, playFailure } from "../core/audio.js";
import { saveGadgets } from "./gadgets.js";
import { requestAccessCode } from "./accessCode.js";
import { saveRoundSnapshot } from "./roundStore.js";

/* =========================================================
   Колбэк окончания использования Верификатора
   =========================================================
   После применения нужно перерисовать интерфейс судейства:
   кнопка использованного Верификатора должна исчезнуть.
   Прямой импорт judging.js дал бы цикл, поэтому — колбэк.
========================================================= */

let onVerificatorUsed = null;

export function setOnVerificatorUsed(callback) {
  onVerificatorUsed = callback;
}

function notifyVerificatorUsed() {
  if (typeof onVerificatorUsed === "function") {
    onVerificatorUsed();
  }
}

/* =========================================================
   Публичные проверки состояния
========================================================= */

/* ---------- Тип Верификатора у игрока ----------
   Возвращает "civilian" | "spy" | null.
   Учитывает только совпадение роли и купленного предмета.
--------------------------------------------------------- */
export function getVerificatorType(player) {
  const assignment = state.assignments.find(
    (item) => item.player === player
  );

  if (!assignment) return null;

  const inventory = state.gadgets[player];
  if (!inventory) return null;

  if (
    assignment.roleType === "spy" &&
    inventory.verificatorSpy
  ) {
    return "spy";
  }

  if (
    assignment.roleType === "civilian" &&
    inventory.verificatorCivilian
  ) {
    return "civilian";
  }

  return null;
}

/* ---------- Доступен ли Верификатор для использования ----------
   true, если:
   - активирован в этом раунде (state.verificatorActive[player]);
   - ещё не использован в этом раунде;
   - игрок не исключён;
   - тип совпадает с ролью.
--------------------------------------------------------- */
export function isVerificatorUsable(player) {
  if (state.gameEnded) return false;
  if (!state.verificatorActive[player]) return false;
  if (state.verificatorUsedThisRound.has(player)) return false;

  const assignment = state.assignments.find(
    (item) => item.player === player
  );

  if (!assignment || assignment.excluded) return false;

  return getVerificatorType(player) !== null;
}

/* ---------- Список игроков с активным и неиспользованным
   Верификатором (для рендера кнопок в интерфейсе судейства). */
export function getVerificatorUsers() {
  return state.assignments
    .filter((assignment) => isVerificatorUsable(assignment.player))
    .map((assignment) => assignment.player);
}

/* =========================================================
   Применение Верификатора
========================================================= */

/* ---------- Основная функция: проверить цель ---------- */
export function useVerificator(owner, target) {
  if (!isVerificatorUsable(owner)) {
    return { ok: false, reason: "not-usable" };
  }

  const targetAssignment = state.assignments.find(
    (item) => item.player === target
  );

  if (!targetAssignment) {
    return { ok: false, reason: "no-target" };
  }

  const type = getVerificatorType(owner);
  const realIsSpy = targetAssignment.roleType === "spy";

  // Отдельный TRNG-поток. XOR включает хеш от "owner|target",
  // чтобы разные пары давали независимые результаты,
  // а одна и та же пара в одном и том же раунде — совпадала
  // (детерминизм в рамках сида).
  const random = createRandomGenerator(
    (state.entropySeed ^
      VERIFICATOR_VERDICT_SEED_CONSTANT ^
      stringToSeed(owner + "|" + target)) >>>
      0
  );

  const truthful = random() < VERIFICATOR_TRUTH_RATE;

  // Мирный: truthful → реальная роль, false → инверсия.
  // Шпионский: truthful → инверсия, false → реальная роль.
  const verdictIsSpy =
    type === "civilian"
      ? truthful
        ? realIsSpy
        : !realIsSpy
      : truthful
      ? !realIsSpy
      : realIsSpy;

  // --- Фиксируем использование ---
  state.verificatorUsedThisRound.add(owner);
  state.verificatorActive[owner] = false;

  // --- Сжигаем предмет навсегда ---
  const inventory = state.gadgets[owner];

  if (inventory) {
    if (type === "civilian") {
      inventory.verificatorCivilian = 0;
    } else {
      inventory.verificatorSpy = 0;
    }
  }

  saveGadgets();
  saveRoundSnapshot();

  // --- События в хронологию раунда ---
  pushRoundEvent("verificator_used", {
    owner,
    target,
    verdict: verdictIsSpy ? "ШПИОН" : "МИРНЫЙ",
    isSpy: verdictIsSpy,
    kind: type
  });

  pushRoundEvent("verificator_burned", {
    owner,
    kind: type
  });

  // --- Показываем результат всем ---
  showVerificatorResult(owner, target, verdictIsSpy);

  // Перерисовать интерфейс судейства: кнопка использованного
  // Верификатора должна исчезнуть.
  notifyVerificatorUsed();

  return {
    ok: true,
    owner,
    target,
    verdict: verdictIsSpy ? "spy" : "civilian",
    kind: type
  };
}

/* =========================================================
   UI: выбор цели
========================================================= */

/* ---------- Модалка выбора цели ---------- */
function createVerificatorTargetModal() {
  let modal = $("#verificator-target-modal");

  if (modal) return modal;

  modal = document.createElement("dialog");
  modal.id = "verificator-target-modal";
  modal.className = "verificator-target-modal";

  modal.innerHTML = `
    <div class="verificator-target-modal__content">
      <button
        type="button"
        class="modal-close"
        data-close-verificator
        aria-label="Закрыть"
      >×</button>

      <p class="verificator-target-modal__eyebrow">
        ДЕТЕКТОР // ВЫБОР ЦЕЛИ
      </p>

      <h2 class="verificator-target-modal__title">
        Верификатор
      </h2>

      <p class="verificator-target-modal__hint">
        Выберите игрока для проверки. Результат увидят все.
        Верификатор сгорит после использования.
      </p>

      <div class="verificator-target-list"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (
      event.target === modal ||
      event.target.closest("[data-close-verificator]")
    ) {
      closeDialog(modal);
      return;
    }

    const targetBtn = event.target.closest(
      "[data-verificator-target]"
    );

    if (!targetBtn) return;

    const owner = modal.dataset.owner;
    const target = targetBtn.dataset.verificatorTarget;

    closeDialog(modal);

    if (owner && target) {
      useVerificator(owner, target);
    }
  });

  return modal;
}

/* ---------- Открыть выбор цели: сначала личный код ----------
   Владелец определяется по коду, а не по имени: нельзя потратить
   чужой Верификатор, а кнопка и сообщения одинаковы у всех, поэтому
   по ним не видно, у кого Верификатор активирован. */
export async function openVerificatorTargetModal() {
  if (state.gameEnded) return;

  const found = await requestAccessCode({
    title: "Верификатор",
    hint:
      "Введите личный код с вашей карты роли. Если у вас нет " +
      "активированного Верификатора, код не будет принят.",
    validate(assignment) {
      if (!assignment || !isVerificatorUsable(assignment.player)) {
        return { ok: false, message: "Код не принят" };
      }

      return { ok: true };
    }
  });

  if (!found || !isVerificatorUsable(found.player)) return;

  const owner = found.player;

  const modal = createVerificatorTargetModal();
  modal.dataset.owner = owner;

  // Заголовок одинаковый для обоих типов: тип Верификатора
  // раскрыл бы роль владельца всем, кто смотрит на экран.
  const titleEl = modal.querySelector(
    ".verificator-target-modal__title"
  );

  if (titleEl) {
    titleEl.textContent = "Верификатор";
  }

  const list = modal.querySelector(".verificator-target-list");

  if (list) {
    // Показываем ВСЕХ игроков, включая себя.
    // Исключённых тоже (роль уже раскрыта, но проверить можно).
    list.innerHTML = state.assignments
      .map(
        (assignment) => `
          <button
            type="button"
            class="judging-player-button"
            data-verificator-target="${escapeHtml(
              assignment.player
            )}"
          >
            ${escapeHtml(assignment.player)}
          </button>
        `
      )
      .join("");
  }

  openDialog(modal);
}

/* =========================================================
   UI: результат проверки
========================================================= */

/* ---------- Модалка результата ---------- */
function createVerificatorResultModal() {
  let modal = $("#verificator-result-modal");

  if (modal) return modal;

  modal = document.createElement("dialog");
  modal.id = "verificator-result-modal";
  modal.className = "verificator-result-modal";

  modal.innerHTML = `
    <div class="verificator-result-modal__content">
      <button
        type="button"
        class="modal-close"
        data-close-verificator-result
        aria-label="Закрыть"
      >×</button>

      <div class="verificator-result__body"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (
      event.target === modal ||
      event.target.closest("[data-close-verificator-result]")
    ) {
      closeDialog(modal);
    }
  });

  return modal;
}

/* ---------- Показ результата. Виден всем в комнате. ---------- */
function showVerificatorResult(owner, target, verdictIsSpy) {
  const modal = createVerificatorResultModal();

  const body = modal.querySelector(".verificator-result__body");

  if (body) {
    const modifier = verdictIsSpy
      ? "verificator-result__body--spy"
      : "verificator-result__body--civilian";

    body.className = "verificator-result__body " + modifier;

    body.innerHTML = `
      <p class="verificator-result__eyebrow">
        ДЕТЕКТОР // ПРОВЕРКА
      </p>

      <div class="verificator-result__row">
        <span class="verificator-result__label">
          Кто использовал:
        </span>
        <span class="verificator-result__value">
          ${escapeHtml(owner)}
        </span>
      </div>

      <div class="verificator-result__row">
        <span class="verificator-result__label">
          Кого проверили:
        </span>
        <span class="verificator-result__value">
          ${escapeHtml(target)}
        </span>
      </div>

      <div class="verificator-result__verdict">
        <span class="verificator-result__verdict-label">
          Вердикт:
        </span>
        <span class="verificator-result__verdict-value">
          ${verdictIsSpy ? "ШПИОН" : "МИРНЫЙ"}
        </span>
      </div>

      <p class="verificator-result__hint">
        вероятность попадания 75%
      </p>
    `;
  }

  openDialog(modal);

  flashScreen(verdictIsSpy ? "red" : "green");

  // PATCH 0.7.0 — временно используем playSuccess/playFailure.
  // Отдельный звук «пик» сканера добавим в core/audio.js
  // в задаче про звук, тогда заменим здесь.
  if (verdictIsSpy) {
    playFailure();
  } else {
    playSuccess();
  }
}

/* ---------- Вспышка экрана ----------
   Зелёная при «МИРНЫЙ», красная при «ШПИОН».
   Не зависит от звука: остаётся, даже если звук выключен.
--------------------------------------------------------- */
function flashScreen(color) {
  const flash = document.createElement("div");

  flash.className = "verificator-flash verificator-flash--" + color;

  document.body.appendChild(flash);

  window.setTimeout(() => {
    if (flash.parentNode) {
      flash.parentNode.removeChild(flash);
    }
  }, 600);
}
