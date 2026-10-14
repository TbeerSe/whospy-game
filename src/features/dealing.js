/* =========================================================
   features/dealing.js — экран раздачи и радар локаций
   Patch 0.4.3

   PATCH 0.7.1:
   - prepareDealingScreen инициализирует currentRoundStartedAt
     и currentRoundEvents, если они ещё не установлены.
     Раньше эти поля ставились только в startGameTimer, из-за
     чего события раздачи (reveal_role_shown / reveal_role_hidden)
     молча терялись в pushRoundEvent.
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  RADAR_MIN_POOL_SIZE,
  pushRoundEvent
} from "../core/state.js";
import { elements } from "../core/dom.js";
import {
  escapeHtml,
  stringToSeed,
  createRandomGenerator
} from "../core/utils.js";
import { createEmptyInventory } from "./gadgets.js";
import { getCurrentLocations } from "./locations.js";
import { saveRoundSnapshot } from "./roundStore.js";

/* ---------- Подготовка экрана раздачи ---------- */
export function prepareDealingScreen(options = {}) {
  // PATCH 0.7.1 — старт хронологии раунда начинается с раздачи.
  // Так события reveal_role_shown / reveal_role_hidden не теряются,
  // и вся хронология раунда имеет одну временную базу.
  if (state.currentRoundStartedAt === null) {
    state.currentRoundStartedAt = Date.now();
    state.currentRoundEvents = [];
  }

  state.roundPhase = "dealing";

  // keepProgress — продолжение раздачи после перезагрузки страницы.
  if (!options.keepProgress) {
    state.currentPlayerIndex = 0;
    state.revealedCount = 0;
  }

  state.roleVisible = false;

  elements.roleCard.classList.add("is-hidden");
  elements.revealRole.classList.remove("is-hidden");

  elements.totalPlayers.textContent = String(state.assignments.length);

  renderCurrentPlayer();
  updateDealingProgress();

  const allDealt =
    options.keepProgress &&
    state.revealedCount >= state.assignments.length;

  elements.startTimer.classList.toggle("is-hidden", !allDealt);

  saveRoundSnapshot();
}

/* ---------- Отрисовка текущего игрока ---------- */
function renderCurrentPlayer() {
  // PATCH 0.4.3 — fix: при смене игрока скрываем бейдж «просмотрено».
  document
    .querySelector(".player-turn-card__viewed")
    ?.classList.remove("is-visible");

  // BUG 1 (0.3.1): если все карты уже выданы — не показываем кнопку reveal заново.
  // PATCH 0.4.4 — fix: обновляем текст карточки, чтобы не оставалось
  // имя последнего игрока и инструкция «Возьмите телефон…».
  if (state.revealedCount >= state.assignments.length) {
    state.roleVisible = false;
    elements.revealRole.classList.add("is-hidden");
    elements.roleCard.classList.add("is-hidden");

    elements.currentPlayerName.textContent = "Раздача завершена";
    elements.revealInstruction.textContent =
      "Все игроки получили свои роли. Запустите таймер, чтобы начать допрос.";

    return;
  }

  const assignment = state.assignments[state.currentPlayerIndex];

  if (!assignment) return;

  const currentNumber = state.currentPlayerIndex + 1;
  const totalPlayers = state.assignments.length;

  elements.currentPlayerNumber.textContent = String(currentNumber);

  elements.currentPlayerName.textContent = assignment.player;

  elements.revealInstruction.textContent =
    "Возьмите телефон и нажмите кнопку, чтобы увидеть свою роль.";

  elements.revealRole.classList.remove("is-hidden");
  elements.roleCard.classList.add("is-hidden");

  const nextAssignment = state.assignments[currentNumber];

  elements.hideRoleLabel.textContent =
    currentNumber < totalPlayers && nextAssignment
      ? `Скрыть карту и передать ${nextAssignment.player}`
      : "Скрыть карту";

  state.roleVisible = false;
}

/* ---------- Подбор вариантов для радара ----------
   Ур.1 оставляет примерно половину пула, ур.2 — примерно треть,
   и ур.2 ВСЕГДА даёт строго меньше вариантов, чем ур.1
   (раньше на малых пулах они совпадали). Минимум 2 варианта,
   настоящая локация всегда среди них. */
export function getRadarCandidateCount(total, level) {
  const half = Math.min(total - 1, Math.max(2, Math.round(total / 2)));

  if (level !== 2) return half;

  const third = Math.max(2, Math.round(total / 3));

  return Math.min(third, Math.max(2, half - 1));
}

function getRadarLocations(realLocation, level, random = Math.random) {
  // Радар сужает пул, зафиксированный на старте раунда.
  const source = state.roundPool.length
    ? state.roundPool
    : state.selectedLocations.length
    ? state.selectedLocations
    : getCurrentLocations();

  const locations = source.map((location) => location.name);

  const total = locations.length;

  // Если пул слишком мал — радар не работает,
  // возвращаем null как сигнал о неудаче.
  if (total < RADAR_MIN_POOL_SIZE) {
    return null;
  }

  const count = getRadarCandidateCount(total, level);

  const pool = locations.filter((location) => location !== realLocation);

  const selected = [];

  while (selected.length < count - 1 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);

    const candidate = pool.splice(index, 1)[0];

    if (candidate && !selected.includes(candidate)) {
      selected.push(candidate);
    }
  }

  selected.push(realLocation);

  return selected.sort();
}

/* ---------- Раскрытие карты текущего игрока ---------- */
export function revealCurrentRole() {
  const assignment = state.assignments[state.currentPlayerIndex];

  if (!assignment) return;

  state.roleVisible = true;

  // PATCH 0.6.7 — событие в хронологию раунда
  pushRoundEvent("reveal_role_shown", {
    player: assignment.player,
    index: state.currentPlayerIndex
  });

  elements.revealRole.classList.add("is-hidden");
  elements.roleCard.classList.remove("is-hidden");

  // PATCH 0.6.3 — сбрасываем предупреждающий класс локации,
  // он может остаться от предыдущего игрока.
  elements.roleCardLocation.classList.remove(
    "role-card__location--warning"
  );

  // PATCH 0.4.3 — fix: бейдж «просмотрено» — простой визуальный
  // сигнал, что игрок уже раскрыл карту. Создаётся один раз,
  // показывается через .is-visible (стиль уже есть в dealing.css).
  let badge = document.querySelector(".player-turn-card__viewed");

  if (!badge) {
    badge = document.createElement("span");
    badge.className = "player-turn-card__viewed";
    badge.textContent = "✓ просмотрено";

    document.querySelector(".player-turn-card")?.appendChild(badge);
  }

  badge.classList.add("is-visible");

  elements.roleCardLocation.textContent = "";
  elements.roleCardDescription.textContent = "";

  // Личный код: нужен для перехвата (шпиону) и Верификатора (всем).
  if (elements.roleCardCode) {
    elements.roleCardCode.innerHTML =
      '<span class="role-card__code-label">' +
        (assignment.roleType === "spy"
          ? "Личный код (перехват и Верификатор)"
          : "Личный код (Верификатор)") +
      "</span>" +
      '<span class="role-card__code-value">' +
        escapeHtml(assignment.accessCode || "—") +
      "</span>";
  }

  const inventory =
    state.gadgets[assignment.player] || createEmptyInventory();

  if (assignment.roleType === "spy") {
    const active = state.activeGadgets[assignment.player] || {};

    const radarLevel = active.radar;

    elements.roleCardLabel.textContent = "ОПАСНОСТЬ // СЕКРЕТНО";

    elements.roleCardIcon.textContent = "☠";
    elements.roleCardTitle.textContent = "Вы ШПИОН";

    const extras = [];

    if (active.jammer) {
      extras.push("Глушитель связи активен (−1 мин).");
    }

    if (active.fakeId) {
      extras.push(
        "Фальшивое удостоверение активно: спасёт от голосования."
      );
    }

    // PATCH 0.4.2 — отображаем факт использования удостоверения.
    if (inventory.fakeIdUsed) {
      extras.push("Удостоверение сгорело после голосования.");
    }

    if (radarLevel) {
      // BUG 3 (0.3.1): используем TRNG вместо Math.random.
      const radarRandom = createRandomGenerator(
        (state.entropySeed ^ stringToSeed(assignment.player)) >>> 0
      );

      const possibleLocations = getRadarLocations(
        assignment.location,
        radarLevel,
        radarRandom
      );

      if (!possibleLocations || !possibleLocations.length) {
        elements.roleCardLocation.textContent =
          "Радар не сработал: слишком мало локаций";
        elements.roleCardLocation.classList.add(
          "role-card__location--warning"
        );

        extras.push(
          "Радар не сработал: слишком мало локаций. Предмет заморожен."
        );
      } else {
        elements.roleCardLocation.innerHTML = `
          <strong>
            Радар локаций уровня ${radarLevel}
          </strong>

          <span class="radar-location-list">
            ${possibleLocations
              .map((location) => `<span>${escapeHtml(location)}</span>`)
              .join("")}
          </span>
        `;

        extras.push(
          "Настоящая локация находится среди вариантов. Радар сгорает после игры."
        );
      }
    } else if (active.radarFailed) {
      // PATCH 0.4.2 — радар не сработал из-за малого пула локаций.
      elements.roleCardLocation.textContent =
        "Радар не сработал: слишком мало локаций";
      elements.roleCardLocation.classList.add(
        "role-card__location--warning"
      );

      extras.push(
        "Радар не сработал: слишком мало локаций. Предмет заморожен."
      );
    } else {
      elements.roleCardLocation.textContent = "Локация скрыта";

      extras.push(
        "Вычислите локацию по вопросам других игроков. Не выдайте себя."
      );
    }

    elements.roleCardDescription.textContent = extras.join(" ");
  } else {
    const active = state.activeGadgets[assignment.player] || {};

    const extras = [];

    if (active.extraInterrogation) {
      extras.push("Дополнительный допрос: +1 мин к таймеру.");
    }

    if (active.insurance) {
      extras.push("Страховка агентства: защита баланса.");
    }

    elements.roleCardLabel.textContent = "СЕКРЕТНАЯ ИНФОРМАЦИЯ";

    elements.roleCardIcon.textContent = "◈";
    elements.roleCardTitle.textContent = assignment.role;

    elements.roleCardLocation.textContent = `Локация: ${assignment.location}`;

    let description =
      "Задавайте осторожные вопросы и попытайтесь вычислить шпиона.";

    if (extras.length) {
      description += " " + extras.join(" ");
    }

    elements.roleCardDescription.textContent = description;
  }

  saveRoundSnapshot();
}

/* ---------- Скрытие карты и переход к следующему ---------- */
export function hideCurrentRole() {
  const isLastPlayer =
    state.currentPlayerIndex >= state.assignments.length - 1;

  const currentAssignment =
    state.assignments[state.currentPlayerIndex];

  // PATCH 0.6.7 — событие в хронологию раунда
  if (currentAssignment) {
    pushRoundEvent("reveal_role_hidden", {
      player: currentAssignment.player,
      index: state.currentPlayerIndex
    });
  }

  state.roleVisible = false;

  elements.roleCard.classList.add("is-hidden");

  // BUG 2 (0.3.1): отдельный счётчик реально скрытых карт.
  state.revealedCount += 1;

  if (isLastPlayer) {
    elements.revealRole.classList.add("is-hidden");
    elements.startTimer.classList.remove("is-hidden");
  } else {
    state.currentPlayerIndex += 1;
  }

  renderCurrentPlayer();
  updateDealingProgress();

  // Код с карты не должен остаться в DOM после передачи телефона.
  if (elements.roleCardCode) {
    elements.roleCardCode.innerHTML = "";
  }

  saveRoundSnapshot();
}

/* ---------- Прогресс раздачи ---------- */
function updateDealingProgress() {
  const revealedCount = state.revealedCount;
  const total = state.assignments.length;

  const percentage = total ? (revealedCount / total) * 100 : 0;

  elements.dealingProgressBar.style.width = `${percentage}%`;

  if (revealedCount === 0) {
    elements.dealingProgressText.textContent = "Карты ещё не открывались";
  } else if (revealedCount >= total) {
    elements.dealingProgressText.textContent =
      "Все карты выданы. Можно начинать допрос.";
  } else {
    elements.dealingProgressText.textContent =
      `Подготовлено карт: ${revealedCount} из ${total}`;
  }
}
