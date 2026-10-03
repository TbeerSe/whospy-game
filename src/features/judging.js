/* =========================================================
   features/judging.js — голосование, детектор лжи, перехват
   Patch 0.4.3
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "../core/state.js";
import {
  $,
  elements,
  openDialog,
  closeDialog
} from "../core/dom.js";
import {
  escapeHtml,
  showToast
} from "../core/utils.js";
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
import {
  finishByVoting,
  finishBySpyLocation
} from "./rounds.js";

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
          Шпион может забрать телефон и выбрать предполагаемую
          локацию. Выбор завершает игру мгновенно.
        </p>

        <div
          id="intercept-location-list"
          class="judging-location-list"
        ></div>
      </div>
    </details>

    <details class="judging-accordion">
      <summary>
        <span>Детектор лжи</span>
        <span>⌄</span>
      </summary>

      <div class="judging-accordion__body">
        <p class="judging-help">
          Агенты с активным детектором могут 1 раз за раунд
          проверить любого игрока.
        </p>

        <div id="lie-detector-users" class="judging-list"></div>

        <div
          id="lie-detector-targets"
          class="judging-list"
          hidden
        ></div>

        <p id="lie-detector-output" class="judging-status"></p>
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

export function renderJudgingInterface() {
  const container = $("#judging-interface");
  if (!container) return;

  const suspectList = $("#suspect-list");
  const voterList = $("#voter-list");
  const initiatorList = $("#initiator-list");
  const locationList = $("#intercept-location-list");

  if (!suspectList || !voterList || !locationList) return;

  suspectList.innerHTML = state.assignments
    .map(
      (assignment) => `
        <button
          type="button"
          class="judging-player-button"
          data-suspect="${escapeHtml(assignment.player)}"
        >
          ${escapeHtml(assignment.player)}
        </button>
      `
    )
    .join("");

  voterList.innerHTML = state.assignments
    .map(
      (assignment) => `
        <button
          type="button"
          class="judging-player-button"
          data-voter="${escapeHtml(assignment.player)}"
        >
          ${escapeHtml(assignment.player)}
        </button>
      `
    )
    .join("");

  if (initiatorList) {
    initiatorList.innerHTML = state.assignments
      .map(
        (assignment) => `
          <button
            type="button"
            class="judging-player-button"
            data-initiator="${escapeHtml(assignment.player)}"
          >
            ${escapeHtml(assignment.player)}
          </button>
        `
      )
      .join("");
  }

  // PATCH 0.4 — перехват показывает пул выбранных локаций,
  // а не весь пак: шпион угадывает из того же набора.
  const locations = state.selectedLocations.length
    ? state.selectedLocations
    : getCurrentLocations();

  locationList.innerHTML = locations
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

  renderLieDetector();
}

/* =========================================================
   Детектор лжи
========================================================= */

// PATCH 0.4.2 — рендер детектора лжи с точечными обновлениями:
// пересобираем innerHTML только при изменении структуры,
// иначе обновляем классы и текст у существующих кнопок.
function renderLieDetector() {
  const usersContainer = $("#lie-detector-users");
  const targetsContainer = $("#lie-detector-targets");
  const output = $("#lie-detector-output");

  if (!usersContainer || !targetsContainer || !output) return;

  const users = state.assignments
    .filter((assignment) => {
      const active = state.activeGadgets[assignment.player];
      return active && active.lieDetector;
    })
    .map((assignment) => assignment.player);

  if (!users.length) {
    if (!usersContainer.querySelector(".judging-empty")) {
      usersContainer.innerHTML = `
        <span class="judging-empty">
          Нет активных детекторов в этом раунде.
        </span>
      `;
    }

    targetsContainer.hidden = true;
    output.textContent = "";

    return;
  }

  const currentButtons = usersContainer.querySelectorAll(
    "[data-lie-user]"
  );

  const hasEmptyPlaceholder = Boolean(
    usersContainer.querySelector(".judging-empty")
  );

  const structureChanged =
    hasEmptyPlaceholder || currentButtons.length !== users.length;

  if (structureChanged) {
    usersContainer.innerHTML = users
      .map((name) => {
        const used = state.lieDetector.usedUsers.has(name);
        const selected = state.lieDetector.selectedUser === name;

        return `
          <button
            type="button"
            class="judging-player-button${
              selected ? " is-selected" : ""
            }${used ? " is-disabled" : ""}"
            data-lie-user="${escapeHtml(name)}"
            ${used ? "disabled" : ""}
          >
            ${escapeHtml(name)}${used ? " (использован)" : ""}
          </button>
        `;
      })
      .join("");
  } else {
    currentButtons.forEach((btn) => {
      const name = btn.dataset.lieUser;
      const used = state.lieDetector.usedUsers.has(name);
      const selected = state.lieDetector.selectedUser === name;

      btn.classList.toggle("is-selected", selected);
      btn.classList.toggle("is-disabled", used);
      btn.disabled = used;

      const newText = name + (used ? " (использован)" : "");

      if (btn.textContent !== newText) {
        btn.textContent = newText;
      }
    });
  }

  if (state.lieDetector.selectedUser) {
    const existingTargets = targetsContainer.querySelectorAll(
      "[data-lie-target]"
    );

    if (existingTargets.length !== state.assignments.length) {
      targetsContainer.innerHTML = state.assignments
        .map(
          (assignment) => `
            <button
              type="button"
              class="judging-player-button"
              data-lie-target="${escapeHtml(assignment.player)}"
            >
              ${escapeHtml(assignment.player)}
            </button>
          `
        )
        .join("");
    }

    targetsContainer.hidden = false;
  } else {
    targetsContainer.hidden = true;
  }

  output.textContent = state.lieDetector.output;
}

/* =========================================================
   Голосование — вспомогательные функции
========================================================= */

function updateVoterButtons() {
  const voterList = $("#voter-list");
  const initiatorList = $("#initiator-list");

  if (voterList) {
    voterList.querySelectorAll("[data-voter]").forEach((button) => {
      const voter = button.dataset.voter;

      button.classList.toggle(
        "is-selected",
        state.voting.voters.has(voter)
      );
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

  const voterPanel = $("#voter-panel");

  if (voterPanel) {
    voterPanel.hidden = true;
  }

  // PATCH 0.4.3 — fix: сужаем область поиска до контейнера
  // судейства, чтобы не задеть одноимённые data-атрибуты
  // в других модулях/модалках.
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
}

/* =========================================================
   Общий клик-обработчик судейства
========================================================= */

function handleJudgingClick(event) {
  const suspectButton = event.target.closest("[data-suspect]");

  if (suspectButton) {
    state.voting.suspect = suspectButton.dataset.suspect;
    state.voting.voters = new Set();
    state.voting.initiator = null;

    const voterPanel = $("#voter-panel");

    if (voterPanel) {
      voterPanel.hidden = false;
    }

    // PATCH 0.4.3 — fix: сужаем область поиска до контейнера
    // судейства (та же причина, что и в resetVotingState).
    const root = $("#judging-interface");

    if (root) {
      root.querySelectorAll("[data-suspect]").forEach((button) => {
        button.classList.toggle("is-selected", button === suspectButton);
      });
    }

    updateVoterButtons();
    return;
  }

  const initiatorButton = event.target.closest("[data-initiator]");

  if (initiatorButton) {
    state.voting.initiator = initiatorButton.dataset.initiator;
    updateVoterButtons();
    return;
  }

  const voterButton = event.target.closest("[data-voter]");

  if (voterButton) {
    const voter = voterButton.dataset.voter;

    if (state.voting.voters.has(voter)) {
      state.voting.voters.delete(voter);
    } else {
      state.voting.voters.add(voter);
    }

    updateVoterButtons();
    return;
  }

  const submitVoteButton = event.target.closest("#submit-vote");

  if (submitVoteButton) {
    submitVote();
    return;
  }

  const locationButton = event.target.closest(
    "[data-intercept-location]"
  );

  if (locationButton) {
    const location = locationButton.dataset.interceptLocation;

    interceptLocation(location);
    return;
  }

  const lieUserButton = event.target.closest("[data-lie-user]");

  if (lieUserButton) {
    const name = lieUserButton.dataset.lieUser;

    if (state.lieDetector.usedUsers.has(name)) return;

    state.lieDetector.selectedUser = name;
    state.lieDetector.output = "";

    renderLieDetector();
    return;
  }

  const lieTargetButton = event.target.closest("[data-lie-target]");

  if (lieTargetButton) {
    const user = state.lieDetector.selectedUser;
    if (!user) return;

    const target = lieTargetButton.dataset.lieTarget;

    state.lieDetector.usedUsers.add(user);
    state.lieDetector.selectedUser = null;
    state.lieDetector.output =
      `Игрок ${target} обязан честно ответить (Да/Нет): ` +
      "есть ли в названии его роли буква О?";

    playSuccess();
    renderLieDetector();
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

  // PATCH 0.4.2 — сообщник не может быть инициатором голосования.
  const initiatorAssignment = state.assignments.find(
    (item) => item.player === initiator
  );

  if (
    initiatorAssignment &&
    initiatorAssignment.roleType === "accomplice"
  ) {
    playFailure();

    if (voteStatus) {
      voteStatus.className = "judging-status judging-status--error";
      voteStatus.textContent =
        "Сообщник не может быть инициатором голосования.";
    }

    return;
  }

  const requiredVotes = Math.floor(state.assignments.length / 2) + 1;

  if (voters.size < requiredVotes) {
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

  if (assignment.roleType === "spy") {
    const active = state.activeGadgets[suspect] || {};

    if (active.fakeId) {
      active.fakeId = false;

      // PATCH 0.4.2 — фиксируем факт использования удостоверения
      // и сохраняем в storage.
      if (!state.gadgets[suspect]) {
        state.gadgets[suspect] = createEmptyInventory();
      }

      state.gadgets[suspect].fakeIdUsed = true;
      saveGadgets();

      playFailure();
      showToast(
        "Фальшивое удостоверение спасло подозреваемого"
      );

      resetVotingState();

      if (voteStatus) {
        voteStatus.textContent =
          "Подозреваемый предъявил алиби. Операция продолжается.";
      }

      return;
    }

    playSuccess();

    if (voteStatus) {
      voteStatus.className = "judging-status";
      voteStatus.textContent = "Шпион вычислен. Мирные побеждают!";
    }

    finishByVoting(suspect);
  } else {
    playFailure();
    showToast("Неверный выбор: голосование сброшено");

    resetVotingState();

    if (voteStatus) {
      voteStatus.className = "judging-status judging-status--error";
      voteStatus.textContent = "Это мирный игрок. Голосование сброшено.";
    }
  }
}

/* =========================================================
   Перехват локации
========================================================= */

function createInterceptConfirmModal() {
  let modal = $("#confirm-intercept-modal");

  if (modal) return modal;

  modal = document.createElement("dialog");
  modal.id = "confirm-intercept-modal";
  modal.className = "confirm-intercept-modal";

  modal.innerHTML = `
    <div class="confirm-intercept-modal__content">
      <h2 class="confirm-intercept-modal__title">
        Подтверждение перехвата
      </h2>

      <p class="confirm-intercept-modal__description"></p>

      <div class="confirm-intercept-modal__actions">
        <button
          type="button"
          class="button button--secondary"
          data-cancel-intercept
        >
          Отмена
        </button>

        <button
          type="button"
          class="button button--danger"
          data-confirm-intercept
        >
          Подтвердить перехват
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (
      event.target === modal ||
      event.target.closest("[data-cancel-intercept]")
    ) {
      closeDialog(modal);
      return;
    }

    const confirmBtn = event.target.closest("[data-confirm-intercept]");

    if (!confirmBtn) return;

    const locationName = modal.dataset.location;

    closeDialog(modal);

    if (locationName) {
      executeIntercept(locationName);
    }
  });

  return modal;
}

function executeIntercept(locationName) {
  if (state.gameEnded) return;

  const spies = getSpies();

  if (!spies.length) {
    showToast("В этой игре нет доступного шпиона");
    return;
  }

  // PATCH 0.4.1 — если шпионов несколько (в т.ч. при p100),
  // перехват всё равно одноразовый — вызываем finishBySpyLocation
  // ровно один раз.
  finishBySpyLocation(spies[0].player, locationName);
}

function interceptLocation(locationName) {
  if (state.gameEnded) return;

  const spies = getSpies();

  if (!spies.length) {
    showToast("В этой игре нет доступного шпиона");
    return;
  }

  const spyNames = spies
    .map((assignment) => assignment.player)
    .join(", ");

  const modal = createInterceptConfirmModal();

  modal.dataset.location = locationName;

  const messageEl = modal.querySelector(
    ".confirm-intercept-modal__description"
  );

  if (messageEl) {
    messageEl.textContent =
      `Телефон передан шпиону: ${spyNames}.\n\n` +
      `Выбрана локация: ${locationName}.`;
  }

  openDialog(modal);
}