/* =========================================================
   features/rounds.js — финалы раундов, расчёт, отмена, сброс

   v0.8.5:
   - Добавлена getActiveCounts() — единая точка подсчёта
     активных шпионов и мирных. Раньше эта логика дублировалась
     в judging.js (дважды) и intercept.js.
   - finishBySpyLocation упрощён: вызывается только при
     успешном перехвате, ветка isCorrect=false была мёртвой.
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "../core/state.js";
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
import { settleRound } from "./economy.js";
import { saveGadgets } from "./gadgets.js";
import { renderPlayers } from "./players.js";
import {
  stopGameTimer,
  setEndGameButtonToDefault,
  setEndGameButtonToMenu
} from "./timer.js";
import { clearRoundSnapshot } from "./roundStore.js";

import { recordRound } from "./statistics.js";

/* =========================================================
   PATCH 0.8.5 — Единая точка подсчёта активных

   Возвращает { spies, civilians, total, active } —
   количество активных шпионов, мирных и общее.
   Используется в judging.js и intercept.js при проверке
   победы по истощению.
========================================================= */
export function getActiveCounts() {
  const active = state.assignments.filter((item) => !item.excluded);

  const spies = active.filter(
    (item) => item.roleType === "spy"
  ).length;

  const civilians = active.filter(
    (item) => item.roleType === "civilian"
  ).length;

  return {
    spies,
    civilians,
    total: active.length,
    active
  };
}

/* =========================================================
   Расчёт монет по итогам раунда
========================================================= */

/* Единственная точка выплат. Возвращает размер банка раунда. */
function settle(outcome, extra = {}) {
  const result = settleRound({
    outcome,
    initiator: extra.initiator || null,
    interceptor: extra.interceptor || null,
    poolSize: state.roundPool.length
  });

  state.lastPot = result.pot || 0;

  if (result.hunt && result.hunt.stolen > 0) {
    showToast(
      `Охота за головами: ${result.hunt.initiator} украл ` +
        `${result.hunt.stolen} 🪙 у шпионов`
    );
  }

  renderPlayers();

  return state.lastPot;
}

/* Общая часть любого финала. */
function markRoundEnded(outcome) {
  state.gameEnded = true;
  state.gameOutcome = outcome;
  state.timerPaused = true;
  state.roundPhase = "ended";

  stopGameTimer();
  clearRoundSnapshot();
  refreshSpyBadge();
}

/* Бейдж «Шпионов: N · осталось M» в финале должен показывать итог:
   последний выбывший шпион к этому моменту уже помечен excluded,
   но обычная перерисовка судейства при финале не вызывается. */
function refreshSpyBadge() {
  const badge = $("#spy-count-badge");

  if (!badge || badge.classList.contains("is-hidden")) return;

  const spies = state.assignments.filter(
    (assignment) => assignment.roleType === "spy"
  );

  const left = spies.filter((assignment) => !assignment.excluded).length;

  badge.textContent =
    left === spies.length
      ? `Шпионов: ${spies.length}`
      : `Шпионов: ${spies.length} · осталось ${left}`;
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

/* ---------- Победа шпионов по таймеру ---------- */
export function finishTimer() {
  if (state.gameEnded) return;

  markRoundEnded("timeout");
  state.timerRemainingSeconds = 0;

  const formatted = formatTime(0);

  elements.timerMinutes.textContent = formatted.minutes;
  elements.timerSeconds.textContent = formatted.seconds;
  elements.timerProgressBar.style.width = "0%";

  settle("timeout");

  recordRound({ outcome: "timeout" });

  playAlarm();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    ENDED
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("timeout");
}

/* ---------- Победа мирных голосованием ---------- */
export function finishByVoting(suspect) {
  if (state.gameEnded) return;

  markRoundEnded("voting");

  settle("voting", { initiator: state.voting.initiator });

  recordRound({ outcome: "voting" });

  playSuccess();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    CIVILIANS WIN
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("voting");

  void suspect;
}

/* ---------- Победа мирных: все шпионы провалили перехват ---------- */
export function finishByAllSpiesFailed() {
  if (state.gameEnded) return;

  markRoundEnded("all-spies-failed");

  settle("all-spies-failed");

  recordRound({ outcome: "all-spies-failed" });

  playSuccess();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    CIVILIANS WIN
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("all-spies-failed");
}

/* ---------- Победа шпиона: перехват угадан ----------
   PATCH 0.8.5 — вызывается только при УСПЕШНОМ перехвате
   (см. intercept.js). Мёртвая ветка isCorrect=false удалена. */
export function finishBySpyLocation(spy, guessedLocation) {
  if (state.gameEnded) return;

  markRoundEnded("spy-location-success");

  settle("spy-location-success", { interceptor: spy });

  playSuccess();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    SPY WINS
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("spy-location-success");

  recordRound({
    outcome: "spy-location-success",
    interceptAttempted: true,
    guessedLocation,
    interceptCorrect: true
  });
}

/* ---------- Победа шпиона по истощению мирных ---------- */
export function finishByShutdown() {
  if (state.gameEnded) return;

  markRoundEnded("shutdown");

  settle("shutdown");

  playFailure();

  recordRound({ outcome: "shutdown" });

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    SPY WINS
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("shutdown");
}

/* =========================================================
   Отмена раунда: без выплат, предметы возвращаются
========================================================= */

export function cancelRound() {
  if (state.gameEnded) {
    resetGame();
    return;
  }

  restoreItemsAfterCancel();

  resetGame({ silent: true });

  showToast("Раунд отменён. Предметы возвращены.");
}

function restoreItemsAfterCancel() {
  const saved = state.gadgetsBeforeRound;

  if (!saved || typeof saved !== "object") return;

  state.players.forEach((player) => {
    if (saved[player]) {
      state.gadgets[player] = JSON.parse(JSON.stringify(saved[player]));
    }
  });

  saveGadgets();
}

/* =========================================================
   Отрисовка результата и раскрытие всех ролей
========================================================= */

function getResultText(outcome) {
  if (outcome === "voting") {
    return {
      title: "МИРНЫЕ ПОБЕДИЛИ",
      description: "Все шпионы вычислены голосованием."
    };
  }

  if (outcome === "all-spies-failed") {
    return {
      title: "МИРНЫЕ ПОБЕДИЛИ",
      description:
        "Все шпионы провалили перехват локации и выбыли."
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

  if (outcome === "shutdown") {
    return {
      title: "ШПИОН ПОБЕДИЛ",
      description:
        "Мирные потеряли большинство. Операция провалена."
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
    resultDesc.textContent =
      resultText.description +
      (state.lastPot > 0
        ? ` Банк раунда: ${state.lastPot} 🪙.`
        : "");
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

    const wrongVotesCount =
      Number(state.wrongVotes[assignment.player]) || 0;

    let wrongVotesHtml = "";

    if (wrongVotesCount > 0 && assignment.roleType === "civilian") {
      wrongVotesHtml = `
        <span class="end-role-badge__wrong-votes"
              title="Неверных голосов: ${wrongVotesCount}">
          ⚠ ×${wrongVotesCount}
        </span>
      `;
    }

    const interceptResult = state.interceptResults.find(
      (r) => r.player === assignment.player
    );

    let interceptHtml = "";

    if (interceptResult && !interceptResult.success) {
      interceptHtml =
        '<span class="end-role-badge__intercept end-role-badge__intercept--fail">' +
          (interceptResult.reason === "timeout"
            ? "⏱ время перехвата вышло"
            : "📡 перехват провален") +
        "</span>";
    } else if (interceptResult && interceptResult.success) {
      interceptHtml =
        '<span class="end-role-badge__intercept end-role-badge__intercept--ok">' +
          "📡 перехват успешен" +
        "</span>";
    }

    const inventory = state.gadgets[assignment.player] || {};

    let verificatorHtml = "";

    if (state.verificatorUsedThisRound.has(assignment.player)) {
      const typeText = assignment.roleType === "spy"
        ? "шпионский"
        : "мирный";

      verificatorHtml =
        '<span class="end-role-badge__verificator">' +
          "🔬 Верификатор сгорел (" + typeText + ")" +
        "</span>";
    }

    const card = document.createElement("div");

    card.className = "end-role-badge";

    card.style.setProperty("--badge-index", String(index));

    if (assignment.roleType === "spy") {
      card.classList.add("end-role-badge--spy");

      const fakeNote = inventory.fakeIdUsed
        ? '<span class="end-role-badge__role">✎ Удостоверение сгорело</span>'
        : "";

      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ☠ ШПИОН
        </span>
        ${fakeNote}
        ${interceptHtml}
        ${verificatorHtml}
        ${changeHtml}
      `;
    } else {
      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
          ${wrongVotesHtml}
        </span>

        <span class="end-role-badge__role">
          ◈ ${escapeHtml(assignment.role || "—")}
          (${escapeHtml(assignment.location || "—")})
        </span>
        ${verificatorHtml}
        ${changeHtml}
      `;
    }

    if (assignment.excluded) {
      card.classList.add("end-role-badge--excluded");

      const badgeName = card.querySelector(".end-role-badge__name");

      if (badgeName) {
        const tag = document.createElement("span");
        tag.className = "end-role-badge__excluded";
        tag.textContent = "ИСКЛЮЧЁН";
        badgeName.appendChild(tag);
      }
    }

    rolesListContainer.appendChild(card);
  }
}

/* =========================================================
   Полный сброс игры
========================================================= */

export function resetGame(options = {}) {
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

  state.currentRoundStartedAt = null;
  state.currentRoundEvents = [];

  state.activeGadgets = {};

  state.pendingEvent = null;
  state.activeEvent = null;
  state.bonusRadar = null;

  state.lastBalanceChanges = null;

  state.currentRoundLocation = null;

  state.voting.suspect = null;
  state.voting.initiator = null;
  state.voting.voters = new Set();
  state.voting.committedVotes = {};

  state.votingInProgress = false;

  state.priorInterceptFailures = 0;
  state.interceptAttempts = new Set();
  state.interceptResults = [];
  state.interceptInProgress = false;

  state.verificatorActive = {};
  state.verificatorUsedThisRound = new Set();
  state.verificatorRolledPlayers = new Set();

  state.wrongVotes = {};

  state.roundPhase = null;
  state.roundPool = [];
  state.partialCatches = [];
  state.roundSettled = false;
  state.lastPot = 0;
  state.balancesBeforeRound = null;
  state.gadgetsBeforeRound = null;
  state.timerDeadline = null;
  state.timerPausedRemainingMs = null;
  state.timerNoiseSeconds = 0;
  state.codeFailures = 0;
  state.codeLockedUntil = 0;

  clearRoundSnapshot();

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

  const interceptModal = $("#intercept-window-modal");
  if (interceptModal) {
    closeDialog(interceptModal);
  }

  const accessModal = $("#access-code-modal");
  if (accessModal && accessModal.open) {
    closeDialog(accessModal);
  }

  const verifResultModal = $("#verificator-result-modal");
  if (verifResultModal) {
    closeDialog(verifResultModal);
  }

  closeDialog(elements.confirmEndModal);
  showScreen("settings");
  renderPlayers();

  saveGadgets();

  if (!options.silent) {
    showToast("Операция завершена");
  }
}