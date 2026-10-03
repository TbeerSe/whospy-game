/* =========================================================
   core/state.js — единый источник состояния и констант
========================================================= */
// @ts-nocheck
"use strict";

/* ---------- Ключи localStorage (не менять!) ---------- */
export const STORAGE_KEYS = {
  players: "spyfall_players",
  customLocations: "spyfall_custom_locations",
  settings: "spyfall_settings",
  balances: "spyfall_player_balances",
  radar: "spyfall_radar_purchases",
  gadgets: "spyfall_gadgets_v03",
  selectedLocations: "spyfall_selected_locations",
  lastRound: "spyfall_last_round"
};

/* ---------- Экономика ---------- */
export const MIN_BALANCE = -500;
export const ELITE_THRESHOLD = 500;
export const DEBTOR_MARKUP = 0.2;
export const ELITE_DISCOUNT = 0.1;
export const DEBTOR_TAX = 0.25;

/* ---------- События раунда ---------- */
export const CRISIS_CHANCE = 0.15;
export const HUNT_STEAL = 50;

/* ---------- TRNG / радар ---------- */
export const LOCATION_SEED_CONSTANT = 0x10CA7105;
export const RADAR_MIN_POOL_SIZE = 3;

/* ---------- Живое состояние приложения ---------- */
export const state = {
  players: [],
  customLocations: [],
  selectedPack: "default",

  // PATCH 0.4 — пул выбранных локаций
  selectedLocations: [],

  // PATCH 0.4 — реальная локация текущего раунда
  currentRoundLocation: null,

  durationMinutes: 10,
  roleMode: "classic",

  spiesSetting: "p25",

  assignments: [],
  currentPlayerIndex: 0,
  revealedCount: 0,
  roleVisible: false,

  timerTotalSeconds: 0,
  timerRemainingSeconds: 0,
  timerInterval: null,
  timerPaused: false,
  timerModifierSeconds: 0,

  gameEnded: false,
  gameOutcome: null,

  entropySeed: 0,
  lastPointer: { x: 0, y: 0 },

  revealRunId: 0,

  balances: {},
  gadgets: {},
  activeGadgets: {},

  pendingEvent: null,
  activeEvent: null,
  bonusRadar: null,

  lastBalanceChanges: null,
  soundEnabled: true,

  voting: {
    suspect: null,
    initiator: null,
    voters: new Set()
  },

  lieDetector: {
    selectedUser: null,
    usedUsers: new Set(),
    output: ""
  },

  audioContext: null,
  lastTickSecond: null
};
