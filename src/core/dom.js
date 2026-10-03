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
  roleModeInputs: document.querySelectorAll('input[name="role-mode"]'),
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

  hideRole: $("#hide-role"),
  hideRoleLabel: $("#hide-role-label"),
  dealingProgressBar: $("#dealing-progress-bar"),
  dealingProgressText: $("#dealing-progress-text"),

  startTimer: $("#start-timer"),
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

  confirmEndModal: $("#confirm-end-modal"),
  closeConfirmEnd: $("#close-confirm-end"),
  cancelEndGame: $("#cancel-end-game"),
  confirmEndGame: $("#confirm-end-game"),

  // PATCH 0.4.4 — модалка правил игры
  rulesModal: $("#rules-modal"),
  openRules: $("#open-rules"),
  closeRules: $("#close-rules"),

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