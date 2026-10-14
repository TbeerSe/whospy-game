/* =========================================================
   core/dom.js — короткие ссылки на DOM и утилиты экранов
   Patch 0.4.4
========================================================= */
// @ts-nocheck
"use strict";

/* ---------- Короткий querySelector ---------- */
export const $ = (selector) => document.querySelector(selector);

/* ---------- Единый реестр элементов ---------- */
export const elements = {
  screens: {
    settings: $("#settings-screen"),
    audit: $("#audit-screen"),
    dealing: $("#dealing-screen"),
    game: $("#game-screen")
  },

  playersList: $("#players-list"),
  playersEmpty: $("#players-empty-state"),
  playersCount: $("#players-count"),
  playerForm: $("#player-form"),
  playerName: $("#player-name"),

  duration: $("#game-duration"),
  spiesCount: $("#spies-count"),
  spiesSettings: $("#spies-settings"),

  defaultLocations: $("#default-locations"),
  customLocations: $("#custom-locations"),
  locationTabs: document.querySelectorAll(".location-tab"),
  locationHint: $("#location-hint"),

  startMission: $("#start-mission"),
  settingsValidation: $("#settings-validation"),

  auditLog: $("#audit-log"),
  auditProgressBar: $("#audit-progress-bar"),

  currentPlayerNumber: $("#current-player-number"),
  totalPlayers: $("#total-players"),
  currentPlayerName: $("#current-player-name"),
  revealInstruction: $("#reveal-instruction"),
  revealRole: $("#reveal-role"),

  roleCard: $("#role-card"),
  roleCardLabel: $("#role-card-label"),
  roleCardIcon: $("#role-card-icon"),
  roleCardTitle: $("#role-card-title"),
  roleCardLocation: $("#role-card-location"),
  roleCardDescription: $("#role-card-description"),
  roleCardCode: $("#role-card-code"),

  hideRole: $("#hide-role"),
  hideRoleLabel: $("#hide-role-label"),
  dealingProgressBar: $("#dealing-progress-bar"),
  dealingProgressText: $("#dealing-progress-text"),

  startTimer: $("#start-timer"),
  cancelDealing: $("#cancel-dealing"),
  spyCountBadge: $("#spy-count-badge"),
  announceSpies: $("#announce-spies"),
  playersWarning: $("#players-warning"),
  bulkButtons: document.querySelectorAll("[data-bulk]"),
  resumeRoundModal: $("#resume-round-modal"),
  resumeRoundSummary: $("#resume-round-summary"),
  resumeRoundContinue: $("#resume-round-continue"),
  resumeRoundCancel: $("#resume-round-cancel"),
  timerMinutes: $("#timer-minutes"),
  timerSeconds: $("#timer-seconds"),
  timerProgressBar: $("#timer-progress-bar"),
  gameTimer: $("#game-timer"),

  gameResult: $("#game-result"),
  pauseGame: $("#pause-game"),
  endGame: $("#end-game"),
  gameStatus: $("#game-status"),

  customPacksModal: $("#custom-packs-modal"),
  openCustomPacks: $("#open-custom-packs"),
  closeCustomPacks: $("#close-custom-packs"),
  customLocationForm: $("#custom-location-form"),
  customLocationName: $("#custom-location-name"),
  customLocationRoles: $("#custom-location-roles"),
  customLocationValidation: $("#custom-location-validation"),
  customPacksList: $("#custom-packs-list"),
  customPacksEmpty: $("#custom-packs-empty-state"),
  customLocationsCount: $("#custom-locations-count"),

  customLocationSubmit: $("#custom-location-submit"),
  customLocationCancelEdit: $("#custom-location-cancel-edit"),
  customLocationEditHint: $("#custom-location-edit-hint"),
  customLocationEditName: $("#custom-location-edit-name"),
  importCustomPacks: $("#import-custom-packs"),
  importCustomPacksInput: $("#import-custom-packs-input"),
  exportCustomPacks: $("#export-custom-packs"),
  exampleCustomPacks: $("#example-custom-packs"),


  exportPlayers: $("#export-players"),
  importPlayers: $("#import-players"),
  importPlayersInput: $("#import-players-input"),
  resetPlayersProgress: $("#reset-players-progress"),

  resetProgressModal: $("#reset-progress-modal"),
  closeResetProgress: $("#close-reset-progress"),
  cancelResetProgress: $("#cancel-reset-progress"),
  confirmResetProgress: $("#confirm-reset-progress"),

  confirmEndModal: $("#confirm-end-modal"),
  closeConfirmEnd: $("#close-confirm-end"),
  cancelEndGame: $("#cancel-end-game"),
  confirmEndGame: $("#confirm-end-game"),

  // PATCH 0.4.4 — модалка правил игры
  rulesModal: $("#rules-modal"),
  openRules: $("#open-rules"),
  closeRules: $("#close-rules"),

  // PATCH 0.6.7 — статистика раундов
  statisticsModal: $("#statistics-modal"),
  openStatistics: $("#open-statistics"),
  closeStatistics: $("#close-statistics"),
  statisticsList: $("#statistics-list"),
  statisticsEmpty: $("#statistics-empty"),
  statisticsCount: $("#statistics-count"),
  statisticsClear: $("#statistics-clear"),
  statisticsClearModal: $("#statistics-clear-modal"),
  closeStatisticsClear: $("#close-statistics-clear"),
  cancelStatisticsClear: $("#cancel-statistics-clear"),
  confirmStatisticsClear: $("#confirm-statistics-clear"),

  // PATCH 0.6.7 — полный экспорт/импорт
  exportFullBackup: $("#export-full-backup"),
  importFullBackup: $("#import-full-backup"),
  importFullBackupInput: $("#import-full-backup-input"),
  importFullBackupModal: $("#import-full-backup-modal"),
  closeImportFullBackup: $("#close-import-full-backup"),
  cancelImportFullBackup: $("#cancel-import-full-backup"),
  confirmImportFullBackup: $("#confirm-import-full-backup"),
  importFullBackupSummary: $("#import-full-backup-summary"),

  // PATCH 0.6.7 — радио-выбор в модалке сброса прогресса
  resetProgressModeInputs: document.querySelectorAll(
    'input[name="reset-mode"]'
  ),
  resetProgressNote: $("#reset-progress-note"),

  // PATCH 0.6.7 — модалка деталей раунда
  roundDetailModal: $("#round-detail-modal"),
  closeRoundDetail: $("#close-round-detail"),
  roundDetailBody: $("#round-detail-body"),

  toast: $("#toast")
};

/* ---------- Переключение экранов ---------- */
export function showScreen(screenName) {
  Object.entries(elements.screens).forEach(([name, screen]) => {
    if (!screen) return;

    const isActive = name === screenName;

    screen.hidden = !isActive;
    screen.classList.toggle("is-active", isActive);
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ---------- Модальные диалоги ---------- */
export function openDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

export function closeDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}