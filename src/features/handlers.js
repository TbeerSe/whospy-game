/* =========================================================
   features/handlers.js — все setupXxxHandlers + startMission
   PATCH 0.6.4 — редактирование паков, импорт JSON, undo/redo
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  MIN_PLAYERS,
  MIN_LOCATIONS
} from "../core/state.js";
import {
  elements,
  showScreen,
  openDialog,
  closeDialog
} from "../core/dom.js";
import {
  readSettingsFromForm,
  saveSettings,
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
  renderPlayers,
  exportPlayersToFile,
  importPlayersFromFile,
  resetAllPlayerProgress,
  deleteAllPlayers
} from "./players.js";
import { openPlayerShop } from "./shop.js";
import {
  toggleLocation,
  renderDefaultLocations,
  renderCustomLocations,
  updateLocationHint,
  saveCustomLocations,
  saveSelectedLocations,
  selectAllInPack,
  clearAllInPack,
  startEditLocation,
  cancelEditLocation,
  updateCustomLocation,
  undoLocationVersion,
  redoLocationVersion,
  importCustomLocationsFromFile,
  exportCustomLocationsToFile,
  downloadExampleTemplate
} from "./locations.js";
import {
  runEntropyAudit,
  getLowestBalanceSpy
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
  cancelRound,
  resetGame
} from "./rounds.js";
import { saveRoundSnapshot } from "./roundStore.js";
import {
  createJudgingInterface,
  renderJudgingInterface
} from "./judging.js";
import { DEFAULT_LOCATIONS } from "../constants/locations.js";

// PATCH 0.6.7 — статистика и полный бэкап
import {
  openStatisticsModal,
  clearRoundHistoryAndRender,
  openRoundDetailModal
} from "./statistics.js";
import {
  exportFullBackup,
  parseFullBackupFile,
  applyFullBackup
} from "./fullBackup.js";

const NEWLINE = "\n";

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

  // PATCH 0.6.5 — экспорт списка игроков с балансами
  if (elements.exportPlayers) {
    elements.exportPlayers.addEventListener("click", () => {
      const result = exportPlayersToFile();

      if (!result.ok) {
        playFailure();
        showToast("Нет игроков для экспорта");
        return;
      }

      playSuccess();
      showToast("Скачано игроков: " + result.count);
    });
  }

  // PATCH 0.6.5 — импорт игроков из JSON
  if (elements.importPlayers && elements.importPlayersInput) {
    elements.importPlayers.addEventListener("click", () => {
      elements.importPlayersInput.click();
    });

    elements.importPlayersInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const result = await importPlayersFromFile(file);
      event.target.value = "";

      if (result.error) {
        playFailure();
        showToast(result.error);
        return;
      }

      const parts = [];
      if (result.added) parts.push("добавлено: " + result.added);
      if (result.updated) parts.push("обновлено: " + result.updated);
      if (result.skipped) parts.push("пропущено: " + result.skipped);

      if (result.added || result.updated) {
        playSuccess();
        showToast(parts.join(", ") || "Импорт завершён");
      } else {
        playFailure();
        showToast("Ничего не импортировано");
      }
    });
  }

  // PATCH 0.6.5 — сброс прогресса (балансы + гаджеты) всех игроков
  if (elements.resetPlayersProgress) {
    elements.resetPlayersProgress.addEventListener("click", () => {
      if (!state.players.length) {
        playFailure();
        showToast("Список игроков пуст");
        return;
      }

      openDialog(elements.resetProgressModal);
    });
  }

  if (elements.closeResetProgress) {
    elements.closeResetProgress.addEventListener("click", () => {
      closeDialog(elements.resetProgressModal);
    });
  }

  if (elements.cancelResetProgress) {
    elements.cancelResetProgress.addEventListener("click", () => {
      closeDialog(elements.resetProgressModal);
    });
  }

  // PATCH 0.6.7 — подтверждение сброса с учётом выбранного режима.
  if (elements.confirmResetProgress) {
    elements.confirmResetProgress.addEventListener("click", () => {
      const mode = getResetProgressMode();
      closeDialog(elements.resetProgressModal);

      if (mode === "players") {
        const result = deleteAllPlayers();

        if (!result.ok) {
          playFailure();
          showToast("Список игроков пуст");
          return;
        }

        playSuccess();
        showToast(
          "Удалено игроков: " + result.count
        );
        return;
      }

      // mode === "progress" (по умолчанию)
      const result = resetAllPlayerProgress();

      if (!result.ok) {
        playFailure();
        showToast("Список игроков пуст");
        return;
      }

      playSuccess();
      showToast("Прогресс сброшен: " + result.count + " игроков");
    });
  }

  // PATCH 0.6.7 — обновляем текст примечания при смене режима.
  if (elements.resetProgressModeInputs) {
    elements.resetProgressModeInputs.forEach((input) => {
      input.addEventListener("change", updateResetProgressNote);
    });

    // Первичная синхронизация (на случай, если DOM уже с checked)
    updateResetProgressNote();
  }

  if (elements.resetProgressModal) {
    elements.resetProgressModal.addEventListener("click", (event) => {
      if (event.target === elements.resetProgressModal) {
        closeDialog(elements.resetProgressModal);
      }
    });
  }
}

/* =========================================================
   PATCH 0.6.7 — Вспомогательные функции для сброса прогресса
========================================================= */

function getResetProgressMode() {
  if (!elements.resetProgressModeInputs) return "progress";

  let mode = "progress";

  elements.resetProgressModeInputs.forEach((input) => {
    if (input.checked) mode = input.value;
  });

  return mode;
}

function updateResetProgressNote() {
  if (!elements.resetProgressNote) return;

  const mode = getResetProgressMode();

  elements.resetProgressNote.textContent =
    mode === "players"
      ? "⚠ Это действие нельзя отменить. Все игроки будут удалены безвозвратно."
      : "⚠ Это действие нельзя отменить. Имена игроков останутся в списке.";
}

/* =========================================================
   Настройки
========================================================= */

export function setupSettingsHandlers() {
  elements.duration.addEventListener("change", () => {
    state.durationMinutes = Number(elements.duration.value);
    saveSettings();
  });

  if (elements.announceSpies) {
    elements.announceSpies.addEventListener("change", () => {
      state.announceSpies = elements.announceSpies.checked;
      saveSettings();
    });
  }

  // Массовый выбор: у каждой кнопки явно указан пак (data-bulk-pack).
  elements.bulkButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const pack = button.dataset.bulkPack;

      if (button.dataset.bulk === "select") {
        selectAllInPack(pack);
      } else {
        clearAllInPack(pack);
      }
    });
  });

  elements.spiesCount.addEventListener("change", () => {
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

      renderDefaultLocations();
      renderCustomLocations();
    });
  });

  elements.defaultLocations.addEventListener("click", (event) => {
    const card = event.target.closest("[data-location-index]");
    if (!card) return;

    state.selectedPack = "default";
    toggleLocation(Number(card.dataset.locationIndex));
  });

  elements.customLocations.addEventListener("click", (event) => {
    const card = event.target.closest("[data-location-index]");
    if (!card) return;

    state.selectedPack = "custom";
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
   Трекинг движения указателя
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
    // Защита от двойного нажатия: второй старт обнулял бы
    // счётчики раунда (попытки перехвата, голоса).
    if (state.roundPhase === "game" || state.gameEnded) return;

    getAudioContext();
    showScreen("game");
    startGameTimer();
    createJudgingInterface();
    renderJudgingInterface();
  });

  // Отмена на этапе раздачи: деньги не двигались, предметы
  // возвращаются.
  if (elements.cancelDealing) {
    elements.cancelDealing.addEventListener("click", () => {
      cancelRound();
    });
  }
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

  // «Отменить раунд»: никто ничего не получает и не теряет,
  // сгоревшие при старте предметы возвращаются владельцам.
  elements.confirmEndGame.addEventListener("click", () => {
    closeDialog(elements.confirmEndModal);
    cancelRound();
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
    cancelEditLocation();
    closeDialog(elements.customPacksModal);
  });

  elements.customPacksModal.addEventListener("click", (event) => {
    if (event.target === elements.customPacksModal) {
      cancelEditLocation();
      closeDialog(elements.customPacksModal);
    }
  });

  elements.customPacksModal.addEventListener("close", () => {
    cancelEditLocation();
  });

  elements.customLocationForm.addEventListener("submit", (event) => {
    event.preventDefault();

    elements.customLocationValidation.textContent = "";

    const name = elements.customLocationName.value.trim();
    const roles = elements.customLocationRoles.value
      .split(NEWLINE)
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

    const editingIndex = state.editingLocationIndex;

    const collidesWithCustom = state.customLocations.some(
      (location, idx) => {
        if (editingIndex !== null && idx === editingIndex) return false;
        return location.name.toLowerCase() === name.toLowerCase();
      }
    );

    const collidesWithDefault = DEFAULT_LOCATIONS.some(
      (location) =>
        location.name.toLowerCase() === name.toLowerCase()
    );

    if (collidesWithCustom || collidesWithDefault) {
      elements.customLocationValidation.textContent =
        "Локация с таким названием уже существует.";
      return;
    }

    if (editingIndex !== null) {
      const ok = updateCustomLocation(editingIndex, {
        name,
        roles: uniqueRoles
      });

      if (ok) {
        playSuccess();
        showToast("Изменения сохранены");
        cancelEditLocation();
      }
      return;
    }

    state.customLocations.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "loc_" + Date.now() + "_" +
            Math.random().toString(36).slice(2, 10),
      name,
      roles: uniqueRoles,
      history: [],
      future: []
    });

    saveCustomLocations();
    renderCustomLocations();
    updateLocationHint();

    elements.customLocationForm.reset();

    playSuccess();
    showToast("Локация добавлена");
  });

  if (elements.customLocationCancelEdit) {
    elements.customLocationCancelEdit.addEventListener("click", () => {
      cancelEditLocation();
    });
  }

  if (elements.importCustomPacks && elements.importCustomPacksInput) {
    elements.importCustomPacks.addEventListener("click", () => {
      elements.importCustomPacksInput.click();
    });

    elements.importCustomPacksInput.addEventListener(
      "change",
      async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const result = await importCustomLocationsFromFile(file);
        event.target.value = "";

        if (result.error) {
          playFailure();
          showToast(result.error);
          return;
        }

        if (result.imported > 0) {
          playSuccess();
          let message = "Импортировано: " + result.imported;
          if (result.skipped) {
            message += ", пропущено: " + result.skipped;
          }
          showToast(message);
        } else {
          playFailure();
          showToast("Ничего не импортировано");
        }
      }
    );
  }

  // PATCH 0.6.5 — скачать все кастомные локации в JSON
  if (elements.exportCustomPacks) {
    elements.exportCustomPacks.addEventListener("click", () => {
      const result = exportCustomLocationsToFile();

      if (!result.ok) {
        playFailure();

        if (result.reason === "empty") {
          showToast("Нет локаций для экспорта");
        }
        return;
      }

      playSuccess();
      showToast("Скачано локаций: " + result.count);
    });
  }

  // PATCH 0.6.5 — скачать пример-шаблон JSON
  if (elements.exampleCustomPacks) {
    elements.exampleCustomPacks.addEventListener("click", () => {
      downloadExampleTemplate();

      playSuccess();
      showToast("Шаблон скачан. Открой его и заполни своими локациями.");
    });
  }

  elements.customPacksList.addEventListener("click", (event) => {
    const undoBtn = event.target.closest("[data-undo-location]");
    if (undoBtn && !undoBtn.disabled) {
      const index = Number(undoBtn.dataset.undoLocation);
      if (undoLocationVersion(index)) {
        playSuccess();
        showToast("Версия откатана назад");
      }
      return;
    }

    const redoBtn = event.target.closest("[data-redo-location]");
    if (redoBtn && !redoBtn.disabled) {
      const index = Number(redoBtn.dataset.redoLocation);
      if (redoLocationVersion(index)) {
        playSuccess();
        showToast("Версия возвращена вперёд");
      }
      return;
    }

    const editButton = event.target.closest("[data-edit-location]");
    if (editButton) {
      startEditLocation(Number(editButton.dataset.editLocation));
      return;
    }

    const deleteButton = event.target.closest("[data-delete-location]");
    if (!deleteButton) return;

    const index = Number(deleteButton.dataset.deleteLocation);
    const deletedLocation = state.customLocations[index];

    state.customLocations.splice(index, 1);

    if (deletedLocation) {
      const poolIndex = state.selectedLocations.findIndex(
        (item) => item.name === deletedLocation.name
      );
      if (poolIndex >= 0) {
        state.selectedLocations.splice(poolIndex, 1);
        saveSelectedLocations();
      }
    }

    if (state.editingLocationIndex !== null) {
      cancelEditLocation();
    }

    saveCustomLocations();
    renderCustomLocations();
    updateLocationHint();
    showToast("Локация удалена");
  });
}

/* =========================================================
   Снимок раунда при сворачивании / закрытии вкладки
   (на телефоне beforeunload не срабатывает, pagehide — да)
========================================================= */

export function setupRoundPersistence() {
  window.addEventListener("pagehide", saveRoundSnapshot);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveRoundSnapshot();
  });
}

/* =========================================================
   Правила игры
========================================================= */

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

/* =========================================================
   PATCH 0.6.7 — Статистика раундов
========================================================= */

export function setupStatisticsHandlers() {
  if (elements.openStatistics) {
    elements.openStatistics.addEventListener("click", () => {
      openStatisticsModal();
    });
  }

  if (elements.closeStatistics) {
    elements.closeStatistics.addEventListener("click", () => {
      closeDialog(elements.statisticsModal);
    });
  }

  if (elements.statisticsModal) {
    elements.statisticsModal.addEventListener("click", (event) => {
      if (event.target === elements.statisticsModal) {
        closeDialog(elements.statisticsModal);
      }
    });
  }

  // Кнопка «Очистить историю» открывает модалку подтверждения
  if (elements.statisticsClear) {
    elements.statisticsClear.addEventListener("click", () => {
      openDialog(elements.statisticsClearModal);
    });
  }

  if (elements.closeStatisticsClear) {
    elements.closeStatisticsClear.addEventListener("click", () => {
      closeDialog(elements.statisticsClearModal);
    });
  }

  if (elements.cancelStatisticsClear) {
    elements.cancelStatisticsClear.addEventListener("click", () => {
      closeDialog(elements.statisticsClearModal);
    });
  }

  if (elements.confirmStatisticsClear) {
    elements.confirmStatisticsClear.addEventListener("click", () => {
      closeDialog(elements.statisticsClearModal);
      clearRoundHistoryAndRender();
      playSuccess();
      showToast("История раундов очищена");
    });
  }

  if (elements.statisticsClearModal) {
    elements.statisticsClearModal.addEventListener("click", (event) => {
      if (event.target === elements.statisticsClearModal) {
        closeDialog(elements.statisticsClearModal);
      }
    });
  }
}

/* =========================================================
   PATCH 0.6.7 — Детали раунда (модалка «?»)
========================================================= */

export function setupRoundDetailHandlers() {
  // Открытие через делегирование: в списке раундов кнопки
  // пересоздаются при каждом рендере.
  if (elements.statisticsList) {
    elements.statisticsList.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-round-detail]");
      if (!btn) return;

      const roundId = btn.dataset.roundDetail;
      if (!roundId) return;

      openRoundDetailModal(roundId);
    });
  }

  if (elements.closeRoundDetail && elements.roundDetailModal) {
    elements.closeRoundDetail.addEventListener("click", () => {
      closeDialog(elements.roundDetailModal);
    });
  }

  if (elements.roundDetailModal) {
    elements.roundDetailModal.addEventListener("click", (event) => {
      if (event.target === elements.roundDetailModal) {
        closeDialog(elements.roundDetailModal);
      }
    });
  }
}

/* =========================================================
   PATCH 0.6.7 — Полный экспорт/импорт игры
========================================================= */

// Отложенный payload между «выбрал файл» и «подтвердил импорт»
let pendingFullBackup = null;

export function setupFullBackupHandlers() {
  // --- Экспорт ---
  if (elements.exportFullBackup) {
    elements.exportFullBackup.addEventListener("click", () => {
      const result = exportFullBackup();

      if (!result.ok) {
        playFailure();
        showToast("Не удалось создать резервную копию");
        return;
      }

      playSuccess();
      showToast(
        "Скачано: игроков " + result.players +
        ", локаций " + result.locations +
        ", раундов " + result.rounds
      );
    });
  }

  // --- Импорт: клик по кнопке → открыть выбор файла ---
  if (elements.importFullBackup && elements.importFullBackupInput) {
    elements.importFullBackup.addEventListener("click", () => {
      elements.importFullBackupInput.click();
    });

    elements.importFullBackupInput.addEventListener(
      "change",
      async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;

        const parsed = await parseFullBackupFile(file);

        if (!parsed.ok) {
          playFailure();
          showToast(parsed.error || "Не удалось прочитать файл");
          return;
        }

        pendingFullBackup = parsed.payload;

        // Заполняем сводку в модалке подтверждения
        if (elements.importFullBackupSummary) {
          const p = parsed.preview || {};
          elements.importFullBackupSummary.textContent =
            "Игроков: " + (p.players || 0) +
            " · Кастомных локаций: " + (p.customLocations || 0) +
            " · Выбранных локаций: " + (p.selectedLocations || 0) +
            " · Раундов в истории: " + (p.roundHistory || 0);
        }

        openDialog(elements.importFullBackupModal);
      }
    );
  }

  // --- Модалка подтверждения ---
  if (elements.closeImportFullBackup) {
    elements.closeImportFullBackup.addEventListener("click", () => {
      pendingFullBackup = null;
      closeDialog(elements.importFullBackupModal);
    });
  }

  if (elements.cancelImportFullBackup) {
    elements.cancelImportFullBackup.addEventListener("click", () => {
      pendingFullBackup = null;
      closeDialog(elements.importFullBackupModal);
    });
  }

  if (elements.confirmImportFullBackup) {
    elements.confirmImportFullBackup.addEventListener("click", () => {
      closeDialog(elements.importFullBackupModal);

      if (!pendingFullBackup) {
        playFailure();
        showToast("Данные для импорта потеряны");
        return;
      }

      const result = applyFullBackup(pendingFullBackup);
      pendingFullBackup = null;

      if (!result.ok) {
        playFailure();
        showToast(result.error || "Ошибка импорта");
        return;
      }

      playSuccess();
      showToast(
        "Импортировано: игроков " + result.players +
        ", локаций " + result.locations +
        ", раундов " + result.rounds
      );
    });
  }

  if (elements.importFullBackupModal) {
    elements.importFullBackupModal.addEventListener("click", (event) => {
      if (event.target === elements.importFullBackupModal) {
        pendingFullBackup = null;
        closeDialog(elements.importFullBackupModal);
      }
    });
  }
}

export async function startMission() {
  if (state.roundPhase) return;

  elements.settingsValidation.textContent = "";

  readSettingsFromForm();

  if (state.players.length < MIN_PLAYERS) {
    elements.settingsValidation.textContent =
      `Добавьте минимум ${MIN_PLAYERS} участника.`;

    playFailure();
    return;
  }

  if (state.selectedLocations.length < MIN_LOCATIONS) {
    elements.settingsValidation.textContent =
      `Выберите минимум ${MIN_LOCATIONS} локаций: ` +
      "при меньшем пуле перехват слишком лёгкий.";

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

    // Пул локаций фиксируется на старте: перехват и радар работают
    // по нему, даже если настройки изменятся.
    state.roundPool = state.selectedLocations.map((location) => ({
      name: location.name,
      roles: [...location.roles]
    }));

    state.assignments = createAssignments(entropy);

    state.activeEvent = state.pendingEvent;

    if (state.activeEvent === "philanthropist") {
      state.bonusRadar = getLowestBalanceSpy();
    }

    // Снимки ДО активации предметов: нужны для отмены раунда.
    state.gadgetsBeforeRound = JSON.parse(
      JSON.stringify(state.gadgets)
    );

    state.partialCatches = [];
    state.roundSettled = false;
    state.gameEnded = false;
    state.gameOutcome = null;

    activateGadgets();
    renderPlayers();

    prepareDealingScreen();
    showScreen("dealing");
  } catch (error) {
    console.error("Не удалось начать раунд:", error);

    state.assignments = [];
    state.roundPhase = null;

    showScreen("settings");

    elements.settingsValidation.textContent =
      "Не удалось начать раунд. Попробуйте ещё раз.";

    playFailure();
  } finally {
    elements.startMission.disabled = false;
  }
}
