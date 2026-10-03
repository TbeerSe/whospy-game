/* =========================================================
   features/handlers.js — все setupXxxHandlers + startMission
   Patch 0.4.4
========================================================= */
// @ts-nocheck
"use strict";

import { state, STORAGE_KEYS } from "../core/state.js";
import {
  elements,
  showScreen,
  openDialog,
  closeDialog
} from "../core/dom.js";
import {
  readSettingsFromForm,
  saveSettings,
  saveToStorage,
  migrateSpiesSetting
} from "../core/storage.js";
import { showToast } from "../core/utils.js";
import {
  getAudioContext,
  playFailure,
  playSuccess
} from "../core/audio.js";
import {
  addPlayer,
  removePlayer,
  renderPlayers
} from "./players.js";
import { openPlayerShop } from "./shop.js";
import {
  toggleLocation,
  renderDefaultLocations,
  renderCustomLocations,
  updateLocationHint,
  saveCustomLocations,
  saveSelectedLocations
} from "./locations.js";
import {
  runEntropyAudit,
  getLowestBalancePlayer
} from "./trng.js";
import { createAssignments } from "./assignments.js";
import { activateGadgets } from "./gadgets.js";
import {
  prepareDealingScreen,
  revealCurrentRole,
  hideCurrentRole
} from "./dealing.js";
import {
  startGameTimer,
  togglePauseTimer
} from "./timer.js";
import {
  finishTimer,
  resetGame
} from "./rounds.js";
import {
  createJudgingInterface,
  renderJudgingInterface
} from "./judging.js";

/* =========================================================
   Игроки
========================================================= */

export function setupPlayerHandlers() {
  elements.playerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addPlayer(elements.playerName.value);
  });

  elements.playersList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-player]");

    if (removeButton) {
      removePlayer(Number(removeButton.dataset.removePlayer));

      return;
    }

    const shopButton = event.target.closest("[data-open-shop]");

    if (shopButton) {
      openPlayerShop(shopButton.dataset.openShop);
    }
  });
}

/* =========================================================
   Настройки
========================================================= */

export function setupSettingsHandlers() {
  elements.duration.addEventListener("change", () => {
    state.durationMinutes = Number(elements.duration.value);

    saveSettings();
  });

  elements.roleModeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.roleMode = input.value;
      saveSettings();
    });
  });

  elements.spiesCount.addEventListener("change", () => {
    // PATCH 0.4.3 — fix: используем общий migrateSpiesSetting()
    // из storage.js, чтобы корректно обрабатывать старые значения
    // ("random", "all", "2"–"5") из HTML и localStorage.
    state.spiesSetting = migrateSpiesSetting(elements.spiesCount.value);

    if (elements.spiesCount.value !== state.spiesSetting) {
      elements.spiesCount.value = state.spiesSetting;
    }

    saveSettings();
  });

  elements.locationTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const pack = tab.dataset.pack;

      state.selectedPack = pack;

      elements.locationTabs.forEach((item) => {
        const isActive = item === tab;

        item.classList.toggle("is-active", isActive);

        item.setAttribute("aria-selected", String(isActive));
      });

      elements.defaultLocations.classList.toggle(
        "is-hidden",
        pack !== "default"
      );

      elements.customLocations.classList.toggle(
        "is-hidden",
        pack !== "custom"
      );

      // PATCH 0.4 — при переключении вкладок НЕ сбрасываем
      // выбранные локации: пул может содержать локации из обоих паков.
      renderDefaultLocations();
      renderCustomLocations();
    });
  });

  elements.defaultLocations.addEventListener("click", (event) => {
    const card = event.target.closest("[data-location-index]");

    if (!card) return;

    state.selectedPack = "default";

    // PATCH 0.4 — toggleLocation вместо selectLocation.
    toggleLocation(Number(card.dataset.locationIndex));
  });

  elements.customLocations.addEventListener("click", (event) => {
    const card = event.target.closest("[data-location-index]");

    if (!card) return;

    state.selectedPack = "custom";

    // PATCH 0.4 — toggleLocation вместо selectLocation.
    toggleLocation(Number(card.dataset.locationIndex));
  });

  elements.startMission.addEventListener("pointerdown", (event) => {
    state.lastPointer = {
      x: Math.round(event.clientX || 0),
      y: Math.round(event.clientY || 0)
    };
  });

  elements.startMission.addEventListener("click", startMission);
}

/* =========================================================
   Трекинг движения указателя — источник энтропии
========================================================= */

export function setupPointerEntropyTracking() {
  let lastUpdate = 0;

  document.addEventListener("pointermove", (event) => {
    const now = performance.now();

    if (now - lastUpdate < 50) return;

    lastUpdate = now;

    state.lastPointer.x = Math.round(event.clientX || 0);
    state.lastPointer.y = Math.round(event.clientY || 0);
  });
}

/* =========================================================
   Раздача
========================================================= */

export function setupDealingHandlers() {
  elements.revealRole.addEventListener("click", () => {
    getAudioContext();
    revealCurrentRole();
  });

  elements.hideRole.addEventListener("click", hideCurrentRole);

  elements.startTimer.addEventListener("click", () => {
    getAudioContext();
    showScreen("game");
    startGameTimer();
    // Модуль судейства создаётся после входа на игровой экран.
    // Раньше это было в startGameTimer, но перенесли сюда,
    // чтобы timer.js не тянул judging.js (циклический импорт).
    createJudgingInterface();
    renderJudgingInterface();
  });
}

/* =========================================================
   Таймер / финал раунда
========================================================= */

export function setupTimerHandlers() {
  elements.pauseGame.addEventListener("click", togglePauseTimer);

  elements.endGame.addEventListener("click", () => {
    if (state.gameEnded) {
      resetGame();
      return;
    }

    openDialog(elements.confirmEndModal);
  });

  elements.closeConfirmEnd.addEventListener("click", () => {
    closeDialog(elements.confirmEndModal);
  });

  elements.cancelEndGame.addEventListener("click", () => {
    closeDialog(elements.confirmEndModal);
  });

  elements.confirmEndGame.addEventListener("click", () => {
    closeDialog(elements.confirmEndModal);
    finishTimer();
  });

  elements.confirmEndModal.addEventListener("click", (event) => {
    if (event.target === elements.confirmEndModal) {
      closeDialog(elements.confirmEndModal);
    }
  });
}

/* =========================================================
   Кастомные паки
========================================================= */

export function setupCustomPackHandlers() {
  elements.openCustomPacks.addEventListener("click", () => {
    renderCustomLocations();
    openDialog(elements.customPacksModal);
  });

  elements.closeCustomPacks.addEventListener("click", () => {
    closeDialog(elements.customPacksModal);
  });

  elements.customPacksModal.addEventListener("click", (event) => {
    if (event.target === elements.customPacksModal) {
      closeDialog(elements.customPacksModal);
    }
  });

  elements.customLocationForm.addEventListener("submit", (event) => {
    event.preventDefault();

    elements.customLocationValidation.textContent = "";

    const name = elements.customLocationName.value.trim();

    const roles = elements.customLocationRoles.value
      .split("\n")
      .map((role) => role.trim())
      .filter(Boolean);

    if (name.length < 2) {
      elements.customLocationValidation.textContent =
        "Введите название локации.";

      return;
    }

    if (roles.length < 5) {
      elements.customLocationValidation.textContent =
        "Добавьте минимум 5 уникальных ролей.";

      return;
    }

    const uniqueRoles = [...new Set(roles)];

    if (uniqueRoles.length < 5) {
      elements.customLocationValidation.textContent =
        "Роли не должны повторяться.";

      return;
    }

    if (
      state.customLocations.some(
        (location) =>
          location.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      elements.customLocationValidation.textContent =
        "Локация с таким названием уже существует.";

      return;
    }

    state.customLocations.push({
      name,
      roles: uniqueRoles
    });

    saveCustomLocations();
    renderCustomLocations();

    elements.customLocationForm.reset();

    playSuccess();
    showToast("Локация добавлена");
  });

  elements.customPacksList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-location]");

    if (!deleteButton) return;

    const index = Number(deleteButton.dataset.deleteLocation);

    const deletedLocation = state.customLocations[index];

    state.customLocations.splice(index, 1);

    // PATCH 0.4 — если удаляемая локация была в пуле выбранных,
    // убираем её оттуда и перерисовываем хинт.
    if (deletedLocation) {
      const poolIndex = state.selectedLocations.findIndex(
        (item) => item.name === deletedLocation.name
      );

      if (poolIndex >= 0) {
        state.selectedLocations.splice(poolIndex, 1);
        saveSelectedLocations();
      }
    }

    saveCustomLocations();
    renderCustomLocations();
    updateLocationHint();

    showToast("Локация удалена");
  });
}

/* =========================================================
   Снимок прерванного раунда
========================================================= */

// PATCH 0.4.2 — сохраняем снимок при закрытии страницы.
export function setupBeforeUnloadSnapshot() {
  window.addEventListener("beforeunload", () => {
    if (state.assignments.length > 0 && !state.gameEnded) {
      saveToStorage(STORAGE_KEYS.lastRound, {
        assignments: state.assignments,
        currentRoundLocation: state.currentRoundLocation,
        balances: state.balances,
        timestamp: Date.now()
      });
    }
  });
}

/* =========================================================
   Правила игры
========================================================= */

// PATCH 0.4.4 — модалка правил открывается по кнопке в шапке.
export function setupRulesHandlers() {
  if (!elements.openRules || !elements.rulesModal) return;

  elements.openRules.addEventListener("click", () => {
    openDialog(elements.rulesModal);
  });

  elements.closeRules.addEventListener("click", () => {
    closeDialog(elements.rulesModal);
  });

  elements.rulesModal.addEventListener("click", (event) => {
    if (event.target === elements.rulesModal) {
      closeDialog(elements.rulesModal);
    }
  });
}

/* =========================================================
   Запуск операции
========================================================= */

export async function startMission() {
  elements.settingsValidation.textContent = "";

  readSettingsFromForm();

  if (state.players.length < 3) {
    elements.settingsValidation.textContent =
      "Добавьте минимум 3 участника.";

    playFailure();
    return;
  }

  // PATCH 0.4 — валидация пула локаций вместо одиночного выбора.
  if (!state.selectedLocations.length) {
    elements.settingsValidation.textContent =
      "Выберите хотя бы одну локацию для операции.";

    playFailure();
    return;
  }

  if (state.roleMode === "accomplice" && state.players.length < 4) {
    elements.settingsValidation.textContent =
      "Для режима «Сообщник» необходимо минимум 4 игрока.";

    playFailure();
    return;
  }

  elements.startMission.disabled = true;

  showScreen("audit");

  try {
    state.pendingEvent = null;
    state.bonusRadar = null;

    const entropy = await runEntropyAudit();

    state.entropySeed = entropy.seed;
    state.assignments = createAssignments(entropy);

    state.activeEvent = state.pendingEvent;

    if (state.activeEvent === "philanthropist") {
      state.bonusRadar = getLowestBalancePlayer();
    }

    activateGadgets();
    // Раньше renderPlayers() вызывался внутри activateGadgets().
    // Теперь вызываем здесь — чтобы gadgets.js не тянул players.js.
    renderPlayers();

    prepareDealingScreen();
    showScreen("dealing");
  } finally {
    elements.startMission.disabled = false;
  }
}