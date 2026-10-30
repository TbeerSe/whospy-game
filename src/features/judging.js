/* =========================================================
   features/judging.js — интерфейс судейства

   v0.8.5:
   - Убрано состояние votingInProgress из блокировки перехвата:
     раньше достаточно было нажать на подозреваемого, чтобы
     заблокировать перехват (отмены не было).
   - Добавлена кнопка «Отменить голосование».
   - Неверный голос больше не выгоняет инициатора:
     выгоняется только подозреваемый, а инициатор и
     проголосовавшие получают штраф к доле (wrongVotes).
     Раньше при 4 игроках ошибка мгновенно вела к победе шпионов.
   - Подсчёт активных через getActiveCounts() из rounds.js.
========================================================= */
// @ts-nocheck
"use strict";

import { state, pushRoundEvent } from "../core/state.js";
import {
  $,
  elements,
  openDialog,
  closeDialog
} from "../core/dom.js";
import { escapeHtml, showToast } from "../core/utils.js";
import {
  playSuccess,
  playFailure
} from "../core/audio.js";
import {
  createEmptyInventory,
  saveGadgets
} from "./gadgets.js";
import { getSpies } from "./assignments.js";
import { getCurrentLocations } from "./locations.js";
import { saveRoundSnapshot } from "./roundStore.js";
import { renderPlayers } from "./players.js";
import {
  finishByVoting,
  finishByShutdown,
  getActiveCounts
} from "./rounds.js";
import {
  openInterceptWindow,
  getAvailableInterceptors,
  isInterceptBlocked,
  startFakeIdIntercept
} from "./intercept.js";
import { openVerificatorTargetModal } from "./verificator.js";

/* =========================================================
   Создание и отрисовка интерфейса судейства
========================================================= */

export function createJudgingInterface() {
  let container = $("#judging-interface");

  if (container) return container;

  container = document.createElement("section");
  container.id = "judging-interface";
  container.className = "judging-interface";

  container.innerHTML = `
    <details class="judging-accordion">
      <summary>
        <span>Модуль голосования мирных</span>
        <span>⌄</span>
      </summary>

      <div class="judging-accordion__body">
        <p class="judging-help">
          Выберите подозреваемого. Затем отметьте игроков,
          которые голосуют против него, и укажите инициатора.
        </p>

        <div id="suspect-list" class="judging-list"></div>

        <div id="voter-panel" class="voter-panel" hidden>
          <h4>Инициатор голосования</h4>

          <div id="initiator-list" class="judging-list"></div>

          <h4>Кто отдаёт голос?</h4>

          <div id="voter-list" class="judging-list"></div>

          <button
            type="button"
            class="button button--primary"
            id="submit-vote"
          >
            Проверить голосование
          </button>

          <button
            type="button"
            class="button button--ghost button--full"
            id="cancel-vote"
          >
            Отменить голосование
          </button>

          <p id="vote-status" class="judging-status"></p>
        </div>
      </div>
    </details>

    <details class="judging-accordion">
      <summary>
        <span>Модуль перехвата шпиона</span>
        <span>⌄</span>
      </summary>

      <div class="judging-accordion__body">
        <p class="judging-help">
          Шпион берёт телефон и выбирает предполагаемую локацию.
          Каждый шпион пробует один раз за раунд. Провал —
          выбывание. Результат видит только шпион.
        </p>

        <button
          type="button"
          class="button button--danger button--full"
          id="open-intercept-window"
        >
          <span class="button__icon" aria-hidden="true">📡</span>
          Открыть перехват локации
        </button>

        <p id="intercept-status" class="judging-status"></p>
      </div>
    </details>

    <details class="judging-accordion">
      <summary>
        <span>Верификатор</span>
        <span>⌄</span>
      </summary>

      <div class="judging-accordion__body">
        <p class="judging-help">
          Нажмите кнопку и введите личный код с вашей карты роли.
          Если у вас есть активированный Верификатор — выберите
          цель, результат увидят все. Иначе код не будет принят.
          После использования Верификатор сгорает.
        </p>

        <div id="verificator-users" class="judging-list"></div>
      </div>
    </details>

  `;

  const gameScreen = elements.screens.game;
  const timerElement = elements.gameTimer;

  if (timerElement && timerElement.parentElement) {
    timerElement.parentElement.insertAdjacentElement(
      "afterend",
      container
    );
  } else if (gameScreen) {
    gameScreen.appendChild(container);
  }

  container.addEventListener("click", handleJudgingClick);

  renderJudgingInterface();

  return container;
}

/* Бейдж «сколько шпионов» в шапке экрана игры. */
function renderSpyBadge() {
  const badge = $("#spy-count-badge");

  if (!badge) return;

  const spies = state.assignments.filter(
    (assignment) => assignment.roleType === "spy"
  );

  if (!state.announceSpies || !spies.length) {
    badge.classList.add("is-hidden");
    return;
  }

  const left = spies.filter((assignment) => !assignment.excluded).length;

  badge.textContent =
    left === spies.length
      ? `Шпионов: ${spies.length}`
      : `Шпионов: ${spies.length} · осталось ${left}`;

  badge.classList.remove("is-hidden");
}

/* Если во время голосования кто-то выбыл (например, подозреваемый
   провалил перехват), голосование теряет смысл: сбрасываем его,
   а выбывших голосующих убираем из набора. */
function reconcileVotingWithExclusions() {
  const { suspect, initiator } = state.voting;
  if (!suspect && !initiator) return;

  const isOut = (name) =>
    state.assignments.some(
      (item) => item.player === name && item.excluded
    );

  if ((suspect && isOut(suspect)) || (initiator && isOut(initiator))) {
    pushRoundEvent("vote_cancelled_excluded", { suspect, initiator });
    resetVotingState();
    return;
  }

  for (const voter of Array.from(state.voting.voters)) {
    if (isOut(voter)) {
      state.voting.voters.delete(voter);
      delete state.voting.committedVotes[voter];
    }
  }
}

export function renderJudgingInterface() {
  reconcileVotingWithExclusions();
  renderSpyBadge();

  const container = $("#judging-interface");
  if (!container) return;

  const suspectList = $("#suspect-list");
  const voterList = $("#voter-list");
  const initiatorList = $("#initiator-list");

  if (!suspectList || !voterList) return;

  suspectList.innerHTML = state.assignments
    .map((assignment) => {
      const ex = assignment.excluded;
      const cls = ex ? " is-excluded" : "";
      const dis = ex ? " disabled" : "";
      return `
        <button
          type="button"
          class="judging-player-button${cls}"
          data-suspect="${escapeHtml(assignment.player)}"
          ${dis}
        >
          ${escapeHtml(assignment.player)}${getExcludedLabel(assignment)}
        </button>
      `;
    })
    .join("");

  voterList.innerHTML = state.assignments
    .map((assignment) => {
      const ex = assignment.excluded;
      const cls = ex ? " is-excluded" : "";
      const dis = ex ? " disabled" : "";
      return `
        <button
          type="button"
          class="judging-player-button${cls}"
          data-voter="${escapeHtml(assignment.player)}"
          ${dis}
        >
          ${escapeHtml(assignment.player)}${getExcludedLabel(assignment)}
        </button>
      `;
    })
    .join("");

  if (initiatorList) {
    initiatorList.innerHTML = state.assignments
      .map((assignment) => {
        const ex = assignment.excluded;
        const cls = ex ? " is-excluded" : "";
        const dis = ex ? " disabled" : "";
        return `
          <button
            type="button"
            class="judging-player-button${cls}"
            data-initiator="${escapeHtml(assignment.player)}"
            ${dis}
          >
            ${escapeHtml(assignment.player)}${getExcludedLabel(assignment)}
          </button>
        `;
      })
      .join("");
  }

  renderInterceptButton();
  renderVerificator();

  updateVoterButtons();
}

/* ---------- Метка исключённого ---------- */
function getExcludedLabel(assignment) {
  if (!assignment.excluded) return "";

  const roleText =
    assignment.roleType === "spy" ? "ШПИОН" : "мирный";

  return ` ✕ (${roleText})`;
}

/* =========================================================
   Кнопка перехвата
========================================================= */

function renderInterceptButton() {
  const button = $("#open-intercept-window");
  const status = $("#intercept-status");

  if (!button) return;

  const available = getAvailableInterceptors();
  const blocked = isInterceptBlocked();

  const disabled = blocked || available.length === 0;

  button.disabled = disabled;

  let reason = "";

  if (blocked && state.interceptInProgress) {
    reason = "Перехват уже выполняется.";
  } else if (available.length === 0) {
    reason = "Все шпионы уже пробовали перехват в этом раунде.";
  }

  if (status) {
    status.className = "judging-status";
    status.textContent = reason;
  }
}

/* =========================================================
   Блок Верификатора
========================================================= */

function renderVerificator() {
  const container = $("#verificator-users");
  if (!container) return;

  container.innerHTML = `
    <button
      type="button"
      class="judging-player-button"
      data-verificator-open
    >
      🔬 Использовать Верификатор
    </button>
  `;
}

/* =========================================================
   Голосование — вспомогательные функции
========================================================= */

function updateVoterButtons() {
  const voterList = $("#voter-list");
  const initiatorList = $("#initiator-list");
  const currentSuspect = state.voting.suspect;

  if (voterList) {
    voterList.querySelectorAll("[data-voter]").forEach((button) => {
      const voter = button.dataset.voter;

      const isSelected = state.voting.voters.has(voter);
      const committedTo = state.voting.committedVotes[voter];
      const committedElsewhere =
        Boolean(committedTo) && committedTo !== currentSuspect;
      const isSuspect = Boolean(currentSuspect) && voter === currentSuspect;

      button.classList.toggle("is-selected", isSelected);
      button.classList.toggle("is-committed", committedElsewhere);
      button.disabled = committedElsewhere || isSuspect;
    });
  }

  if (initiatorList) {
    initiatorList
      .querySelectorAll("[data-initiator]")
      .forEach((button) => {
        const initiator = button.dataset.initiator;

        button.classList.toggle(
          "is-selected",
          state.voting.initiator === initiator
        );
      });
  }
}

function resetVotingState() {
  state.voting.suspect = null;
  state.voting.initiator = null;
  state.voting.voters = new Set();
  state.voting.committedVotes = {};

  state.votingInProgress = false;

  const voterPanel = $("#voter-panel");

  if (voterPanel) {
    voterPanel.hidden = true;
  }

  const root = $("#judging-interface");

  if (root) {
    root
      .querySelectorAll(
        "[data-suspect], [data-voter], [data-initiator]"
      )
      .forEach((button) => {
        button.classList.remove("is-selected");
      });
  }

  const voteStatus = $("#vote-status");

  if (voteStatus) {
    voteStatus.className = "judging-status";
    voteStatus.textContent = "";
  }

  renderInterceptButton();
  saveRoundSnapshot();
}

/* =========================================================
   Общий клик-обработчик судейства
========================================================= */

function handleJudgingClick(event) {
  if (event.target.closest(".is-excluded")) return;
  if (event.target.closest("[disabled]")) return;

  // --- Кнопка перехвата ---
  const interceptOpenBtn = event.target.closest(
    "#open-intercept-window"
  );

  if (interceptOpenBtn) {
    openInterceptWindow();
    return;
  }

  // --- Верификатор ---
  const verifOpenBtn = event.target.closest(
    "[data-verificator-open]"
  );

  if (verifOpenBtn) {
    openVerificatorTargetModal();
    return;
  }

  // --- Отмена голосования ---
  const cancelVoteBtn = event.target.closest("#cancel-vote");

  if (cancelVoteBtn) {
    pushRoundEvent("vote_cancelled_all", {
      suspect: state.voting.suspect
    });

    resetVotingState();
    renderJudgingInterface();
    return;
  }

  // --- Голосование: подозреваемый ---
  const suspectButton = event.target.closest("[data-suspect]");

  if (suspectButton) {
    state.voting.suspect = suspectButton.dataset.suspect;
    state.voting.voters = new Set();
    state.voting.initiator = null;
    state.voting.committedVotes = {};

    pushRoundEvent("vote_suspect_selected", {
      suspect: state.voting.suspect
    });

    const voterPanel = $("#voter-panel");

    if (voterPanel) {
      voterPanel.hidden = false;
    }

    const root = $("#judging-interface");

    if (root) {
      root.querySelectorAll("[data-suspect]").forEach((button) => {
        button.classList.toggle("is-selected", button === suspectButton);
      });
    }

    updateVoterButtons();
    return;
  }

  // --- Инициатор ---
  const initiatorButton = event.target.closest("[data-initiator]");

  if (initiatorButton) {
    const name = initiatorButton.dataset.initiator;

    if (name === state.voting.suspect) {
      playFailure();
      showToast("Инициатор не может быть подозреваемым");
      return;
    }

    state.voting.initiator = name;

    pushRoundEvent("vote_initiator_selected", {
      suspect: state.voting.suspect,
      initiator: name
    });

    updateVoterButtons();
    return;
  }

  // --- Голосующий ---
  const voterButton = event.target.closest("[data-voter]");

  if (voterButton) {
    const voter = voterButton.dataset.voter;
    const currentSuspect = state.voting.suspect;

    if (!currentSuspect) {
      showToast("Сначала выберите подозреваемого");
      return;
    }

    if (voter === currentSuspect) {
      playFailure();
      showToast("Подозреваемый не голосует против себя");
      return;
    }

    const committedTo = state.voting.committedVotes[voter];

    if (committedTo && committedTo !== currentSuspect) {
      playFailure();
      showToast(
        `${voter} уже голосовал за ${committedTo}. ` +
        `Нельзя голосовать второй раз.`
      );
      return;
    }

    if (state.voting.voters.has(voter)) {
      state.voting.voters.delete(voter);
      delete state.voting.committedVotes[voter];

      pushRoundEvent("vote_cancelled", {
        voter,
        suspect: currentSuspect
      });
    } else {
      state.voting.voters.add(voter);
      state.voting.committedVotes[voter] = currentSuspect;

      pushRoundEvent("vote_cast", {
        voter,
        suspect: currentSuspect,
        totalVoters: state.voting.voters.size
      });
    }

    updateVoterButtons();
    return;
  }

  // --- Отправка голосования ---
  const submitVoteButton = event.target.closest("#submit-vote");

  if (submitVoteButton) {
    submitVote();
    return;
  }
}

/* =========================================================
   Отправка голосования
========================================================= */

function submitVote() {
  const suspect = state.voting.suspect;
  const voters = state.voting.voters;
  const initiator = state.voting.initiator;

  const voteStatus = $("#vote-status");

  if (!suspect) {
    playFailure();

    if (voteStatus) {
      voteStatus.className = "judging-status judging-status--error";
      voteStatus.textContent = "Сначала выберите подозреваемого.";
    }

    return;
  }

  if (!initiator) {
    playFailure();

    if (voteStatus) {
      voteStatus.className = "judging-status judging-status--error";
      voteStatus.textContent = "Выберите инициатора голосования.";
    }

    return;
  }

  if (initiator === suspect) {
    playFailure();

    if (voteStatus) {
      voteStatus.className = "judging-status judging-status--error";
      voteStatus.textContent = "Инициатор не может быть подозреваемым.";
    }

    return;
  }

  const { spies, civilians } = getActiveCounts();
  const activeCount = spies + civilians;
  const requiredVotes = Math.floor(activeCount / 2) + 1;

  const activeVoters = Array.from(voters).filter((name) =>
    state.assignments.some(
      (item) => item.player === name && !item.excluded
    )
  );

  if (activeVoters.length < requiredVotes) {
    playFailure();

    if (voteStatus) {
      voteStatus.className = "judging-status judging-status--error";
      voteStatus.textContent =
        `Недостаточно голосов: нужно минимум ${requiredVotes}.`;
    }

    return;
  }

  const assignment = state.assignments.find(
    (item) => item.player === suspect
  );

  if (!assignment) return;

  if (assignment.excluded) {
    playFailure();
    showToast(`${suspect} уже выбыл — голосование отменено`);
    resetVotingState();
    renderJudgingInterface();
    return;
  }

  if (assignment.roleType === "spy") {
    // --- Фальшивое удостоверение ---
    const active = state.activeGadgets[suspect] || {};

    if (active.fakeId) {
      active.fakeId = false;

      if (!state.gadgets[suspect]) {
        state.gadgets[suspect] = createEmptyInventory();
      }

      state.gadgets[suspect].fakeIdUsed = true;
      saveGadgets();

      playFailure();
      showToast("Фальшивое удостоверение сработало. Шпион выбирает локацию");

      pushRoundEvent("vote_fake_id_used", {
        suspect,
        voters: Array.from(voters)
      });

      resetVotingState();

      if (voteStatus) {
        voteStatus.textContent =
          "Подозреваемый предъявил алиби. Операция продолжается.";
      }

      // Шпион получает 10 секунд на перехват (код вводить не нужно),
      // общий таймер на это время стоит.
      startFakeIdIntercept(suspect);

      return;
    }

    // --- Победа мирных или промежуточный выгон ---
    const remainingSpies = state.assignments.filter(
      (item) =>
        item.roleType === "spy" &&
        item.player !== suspect &&
        !item.excluded
    ).length;

    if (remainingSpies === 0) {
      playSuccess();

      pushRoundEvent("vote_success", {
        suspect,
        initiator,
        voters: Array.from(voters),
        realRole: "spy"
      });

      if (voteStatus) {
        voteStatus.className = "judging-status";
        voteStatus.textContent = "Последний шпион вычислен. Мирные побеждают!";
      }

      assignment.excluded = true;

      finishByVoting(suspect);
      return;
    }

    // Промежуточный выгон — игра продолжается.
    playSuccess();

    pushRoundEvent("vote_success_partial", {
      suspect,
      initiator,
      voters: Array.from(voters),
      realRole: "spy"
    });

    state.partialCatches.push({ suspect, initiator });

    assignment.excluded = true;

    showToast(
      `Шпион ${suspect} вычислен. Но остались другие — игра продолжается.`
    );

    const afterCounts = getActiveCounts();

    resetVotingState();
    renderJudgingInterface();

    if (afterCounts.civilians <= afterCounts.spies) {
      finishByShutdown();
      return;
    }

    saveRoundSnapshot();

    if (voteStatus) {
      voteStatus.className = "judging-status";
      voteStatus.textContent =
        `Шпион ${suspect} выбывает. Игра продолжается.`;
    }

    return;
  }

  // --- Подозреваемый — мирный ---
  handleWrongVote(suspect, initiator);
}

/* =========================================================
   PATCH 0.8.5 — Неверный голос
   Раньше выгонялись и подозреваемый, и инициатор. При 4 игроках
   (1 шпион, 3 мирных) это мгновенно вело к победе шпионов.
   Теперь выгоняется только подозреваемый, а инициатор и
   проголосовавшие получают штраф к доле (wrongVotes).
========================================================= */
function handleWrongVote(suspectName, initiatorName) {
  const suspectA = state.assignments.find(
    (item) => item.player === suspectName
  );

  const suspectRoleText =
    suspectA?.roleType === "spy" ? "ШПИОН" : "мирный";

  if (suspectA) suspectA.excluded = true;

  const wrongVoters = new Set(state.voting.voters);
  wrongVoters.add(initiatorName);

  wrongVoters.forEach((voter) => {
    state.wrongVotes[voter] = (state.wrongVotes[voter] || 0) + 1;
  });

  playFailure();
  showToast(
    `Исключён ${suspectName} (${suspectRoleText}). ` +
    `Инициатор ${initiatorName} ошибся и получил штраф к доле.`
  );

  pushRoundEvent("vote_wrong", {
    suspect: suspectName,
    suspectRole: suspectRoleText,
    initiator: initiatorName,
    voters: Array.from(state.voting.voters),
    wrongVoters: Array.from(wrongVoters)
  });

  const { spies, civilians } = getActiveCounts();

  if (civilians <= spies) {
    resetVotingState();
    renderJudgingInterface();
    finishByShutdown();
    return;
  }

  resetVotingState();
  renderJudgingInterface();
  saveRoundSnapshot();

  const voteStatus = $("#vote-status");
  if (voteStatus) {
    voteStatus.className = "judging-status judging-status--error";
    voteStatus.textContent =
      `${suspectName} был ${suspectRoleText}. ` +
      `Инициатор ${initiatorName} получил штраф. Игра продолжается.`;
  }
}

/* ---------- Реэкспорт для внешнего мира ---------- */
export { getSpies, getCurrentLocations, openDialog, closeDialog };