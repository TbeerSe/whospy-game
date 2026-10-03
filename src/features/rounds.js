/* =========================================================
   features/rounds.js — финалы раундов, начисления, сброс
   Patch 0.4.3
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  STORAGE_KEYS,
  HUNT_STEAL
} from "../core/state.js";
import {
  $,
  elements,
  showScreen,
  closeDialog
} from "../core/dom.js";
import {
  escapeHtml,
  sleep,
  showToast,
  formatTime
} from "../core/utils.js";
import {
  playAlarm,
  playSuccess,
  playFailure
} from "../core/audio.js";
import { saveToStorage } from "../core/storage.js";
import {
  applyRoundReward,
  changeBalance
} from "./economy.js";
import { createEmptyInventory } from "./gadgets.js";
import { renderPlayers } from "./players.js";
import { getSpies } from "./assignments.js";
import {
  stopGameTimer,
  setEndGameButtonToDefault,
  setEndGameButtonToMenu
} from "./timer.js";

/* =========================================================
   Начисления по итогам раунда
========================================================= */

function awardTimerVictory() {
  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, 120);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, 100);
    } else {
      applyRoundReward(assignment.player, -30);
    }
  });

  renderPlayers();
}

function awardVotingVictory(suspect) {
  const initiator = state.voting.initiator;

  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "civilian") {
      const base = assignment.player === initiator ? 100 : 70;

      applyRoundReward(assignment.player, base);
    } else if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, -150);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, -100);
    }
  });

  // PATCH 0.4.2 — событие «Охота за головами»:
  // кража делится между всеми шпионами, инициатор получает общую сумму.
  //
  // PATCH 0.4.3 — fix: инициатор получает РОВНО ту сумму, которая
  // реально списана со шпионов. Остаток от деления не создаётся
  // «из воздуха» — экономика сходится.
  if (state.activeEvent === "hunt" && initiator) {
    const spies = getSpies();

    if (spies.length > 0) {
      const perSpy = Math.floor(HUNT_STEAL / spies.length);
      const totalStolen = perSpy * spies.length;

      if (perSpy > 0) {
        spies.forEach((spy) => {
          changeBalance(spy.player, -perSpy);
        });

        changeBalance(initiator, totalStolen);

        showToast(
          `Охота за головами: ${initiator} украл ${totalStolen} 🪙 у шпионов`
        );
      }
    }

    void suspect;
  }

  renderPlayers();
}

function awardSpyLocationVictory() {
  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, 200);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, 150);
    } else {
      applyRoundReward(assignment.player, -50);
    }
  });

  renderPlayers();
}

// PATCH 0.4.2 — accomplice тоже получает штраф -100, как и spy.
function awardSpyLocationFailure() {
  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, -200);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, -100);
    } else if (assignment.roleType === "civilian") {
      applyRoundReward(assignment.player, 80);
    }
  });

  renderPlayers();
}

/* =========================================================
   Скрытие интерфейса таймера
========================================================= */

function hideTimerInterface() {
  const timerWrapper = elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "none";
  }

  elements.pauseGame.disabled = true;
  setEndGameButtonToMenu();
}

/* =========================================================
   Финализации раунда
========================================================= */

export function finishTimer() {
  if (state.gameEnded) return;

  state.gameEnded = true;
  state.gameOutcome = "timeout";
  state.timerRemainingSeconds = 0;
  state.timerPaused = true;

  // PATCH 0.4.2 — начинаем трекинг изменений баланса.
  state.lastBalanceChanges = {};

  // PATCH 0.4.3 — fix: используем общий formatTime() вместо
  // локального дубликата renderTimerLocal().
  const formatted = formatTime(state.timerRemainingSeconds);

  elements.timerMinutes.textContent = formatted.minutes;
  elements.timerSeconds.textContent = formatted.seconds;
  elements.timerProgressBar.style.width = "0%";

  stopGameTimer();

  awardTimerVictory();
  playAlarm();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    ENDED
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("timeout");
}

export function finishByVoting(suspect) {
  if (state.gameEnded) return;

  state.gameEnded = true;
  state.gameOutcome = "voting";
  state.timerPaused = true;

  state.lastBalanceChanges = {};

  stopGameTimer();
  awardVotingVictory(suspect);
  playSuccess();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    CIVILIANS WIN
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("voting");
}

export function finishBySpyLocation(spy, guessedLocation) {
  if (state.gameEnded) return;

  state.gameEnded = true;
  state.timerPaused = true;

  stopGameTimer();

  // PATCH 0.4 — правильный ответ берём из поля текущего раунда
  // (его выставляет createAssignments через TRNG).
  const realLocation = state.currentRoundLocation;
  const isCorrect = guessedLocation === realLocation;

  state.gameOutcome = isCorrect
    ? "spy-location-success"
    : "spy-location-failure";

  state.lastBalanceChanges = {};

  if (isCorrect) {
    awardSpyLocationVictory();
    playSuccess();

    elements.gameStatus.innerHTML = `
      <span class="status-dot"></span>
      SPY WINS
    `;
  } else {
    awardSpyLocationFailure();
    playFailure();

    elements.gameStatus.innerHTML = `
      <span class="status-dot"></span>
      CIVILIANS WIN
    `;
  }

  hideTimerInterface();
  revealAllRolesAtEnd(state.gameOutcome);

  void spy;
}

/* =========================================================
   Отрисовка результата и раскрытие всех ролей
========================================================= */

function getResultText(outcome) {
  if (outcome === "voting") {
    return {
      title: "МИРНЫЕ ПОБЕДИЛИ",
      description: "Шпион был вычислен большинством голосов."
    };
  }

  if (outcome === "spy-location-success") {
    return {
      title: "ШПИОН ПОБЕДИЛ",
      description: "Шпион правильно перехватил локацию."
    };
  }

  if (outcome === "spy-location-failure") {
    return {
      title: "МИРНЫЕ ПОБЕДИЛИ",
      description: "Шпион ошибся при перехвате локации."
    };
  }

  return {
    title: "ВРЕМЯ ИСТЕКЛО",
    description: "Шпиону удалось пережить всю операцию."
  };
}

async function revealAllRolesAtEnd(outcome = "timeout") {
  const currentRevealRunId = ++state.revealRunId;

  elements.gameResult.classList.remove("is-hidden");

  const resultTitle = elements.gameResult.querySelector(
    ".game-result__title"
  );

  const resultDesc = elements.gameResult.querySelector(
    ".game-result__description"
  );

  const resultText = getResultText(outcome);

  // PATCH 0.4.1 — «Паранойя» показывается только тогда, когда
  // шпионами реально стали ВСЕ игроки (независимо от настройки).
  // p100 теперь не гарантирует, что шпионов будет много.
  const totalPlayers = state.assignments.length;
  const totalSpies = state.assignments.filter(
    (assignment) => assignment.roleType === "spy"
  ).length;

  const isRealParanoia = totalPlayers > 0 && totalSpies === totalPlayers;

  if (isRealParanoia) {
    resultTitle.textContent = "🚨 РЕЖИМ «ПАРАНОЙЯ»";
    resultDesc.textContent =
      "Абсолютный хаос! В этой операции не было мирных жителей.";
  } else {
    resultTitle.textContent = resultText.title;
    resultDesc.textContent = resultText.description;
  }

  let rolesListContainer = $("#end-roles-list");

  if (!rolesListContainer) {
    rolesListContainer = document.createElement("div");
    rolesListContainer.id = "end-roles-list";
    rolesListContainer.className = "end-roles-list";

    elements.gameResult.appendChild(rolesListContainer);
  }

  rolesListContainer.innerHTML = "";

  for (let index = 0; index < state.assignments.length; index += 1) {
    await sleep(350);

    if (currentRevealRunId !== state.revealRunId) {
      return;
    }

    const assignment = state.assignments[index];

    // PATCH 0.4.2 — показываем изменение баланса игрока.
    // Используем классы .end-role-badge__delta--up/--down/--zero
    // из endgame.css вместо инлайн-стилей.
    const change =
      (state.lastBalanceChanges &&
        state.lastBalanceChanges[assignment.player]) ||
      0;

    let changeHtml = "";

    if (change !== 0) {
      const modifier = change > 0 ? "up" : "down";
      const sign = change > 0 ? "+" : "";

      changeHtml = `
        <span class="end-role-badge__delta end-role-badge__delta--${modifier}">
          ${sign}${change} 🪙
        </span>
      `;
    }

    const card = document.createElement("div");

    card.className = "end-role-badge";

    card.style.setProperty("--badge-index", String(index));

    const inventory =
      state.gadgets[assignment.player] || createEmptyInventory();

    if (assignment.roleType === "spy") {
      card.classList.add("end-role-badge--spy");

      const fakeNote = inventory.fakeIdUsed
        ? `<span class="end-role-badge__role">✎ Удостоверение сгорело</span>`
        : "";

      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ☠ ШПИОН
        </span>
        ${fakeNote}
        ${changeHtml}
      `;
    } else if (assignment.roleType === "accomplice") {
      card.classList.add("end-role-badge--accomplice");

      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ◉ СООБЩНИК
          (${escapeHtml(assignment.location)})
        </span>
        ${changeHtml}
      `;
    } else {
      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ◈ ${escapeHtml(assignment.role)}
          (${escapeHtml(assignment.location)})
        </span>
        ${changeHtml}
      `;
    }

    rolesListContainer.appendChild(card);
  }
}

/* =========================================================
   Полный сброс игры
========================================================= */

export function resetGame() {
  state.revealRunId += 1;

  stopGameTimer();

  state.assignments = [];
  state.currentPlayerIndex = 0;
  state.revealedCount = 0;
  state.roleVisible = false;

  state.timerPaused = false;
  state.timerRemainingSeconds = 0;
  state.timerTotalSeconds = 0;
  state.timerModifierSeconds = 0;

  state.gameEnded = false;
  state.gameOutcome = null;
  state.activeGadgets = {};

  state.pendingEvent = null;
  state.activeEvent = null;
  state.bonusRadar = null;

  state.lastBalanceChanges = null;

  // PATCH 0.4 — сбрасываем правильный ответ текущего раунда.
  state.currentRoundLocation = null;

  state.voting.suspect = null;
  state.voting.initiator = null;
  state.voting.voters = new Set();

  state.lieDetector.selectedUser = null;
  state.lieDetector.usedUsers = new Set();
  state.lieDetector.output = "";

  elements.pauseGame.disabled = false;
  elements.gameResult.classList.add("is-hidden");

  setEndGameButtonToDefault();

  const timerWrapper = elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "";
  }

  const rolesListContainer = $("#end-roles-list");

  if (rolesListContainer) {
    rolesListContainer.remove();
  }

  const judgingInterface = $("#judging-interface");

  if (judgingInterface) {
    judgingInterface.remove();
  }

  // PATCH 0.4.2 — очищаем снимок прерванного раунда.
  saveToStorage(STORAGE_KEYS.lastRound, null);

  closeDialog(elements.confirmEndModal);
  showScreen("settings");
  renderPlayers();

  showToast("Операция завершена");
}