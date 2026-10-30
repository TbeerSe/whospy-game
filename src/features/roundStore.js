/* =========================================================
   features/roundStore.js — снимок активного раунда

   Зачем: телефон в игре «передай по кругу» постоянно блокируется,
   а вкладку мобильный браузер может выгрузить. Раньше любая
   перезагрузка уничтожала раунд, а купленные предметы сгорали.

   Снимок пишется после каждого значимого действия и каждые
   5 секунд таймера. При запуске игра предлагает продолжить
   раунд (таймер встаёт на паузу) или отменить его с возвратом
   предметов.

   Модуль зависит только от state/storage, чтобы его можно было
   импортировать откуда угодно без циклов.
========================================================= */
// @ts-nocheck
"use strict";

import { state, STORAGE_KEYS } from "../core/state.js";
import { readFromStorage, saveToStorage } from "../core/storage.js";

const SNAPSHOT_VERSION = 1;

/* ---------- Глубокая копия через JSON ---------- */
function clone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

/* ---------- Сколько мс осталось на таймере ---------- */
function getRemainingMs() {
  if (state.roundPhase !== "game") return null;

  if (state.timerPaused) {
    return Math.max(
      0,
      Number(state.timerPausedRemainingMs) ||
        state.timerRemainingSeconds * 1000
    );
  }

  if (state.timerDeadline === null) {
    return Math.max(0, state.timerRemainingSeconds * 1000);
  }

  return Math.max(0, state.timerDeadline - Date.now());
}

/* ---------- Сборка снимка ---------- */
export function buildRoundSnapshot() {
  return {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    phase: state.roundPhase,

    assignments: clone(state.assignments),
    currentRoundLocation: state.currentRoundLocation,
    roundPool: clone(state.roundPool),
    entropySeed: state.entropySeed,
    activeEvent: state.activeEvent,
    activeGadgets: clone(state.activeGadgets),

    durationMinutes: state.durationMinutes,
    timerModifierSeconds: state.timerModifierSeconds,
    timerNoiseSeconds: state.timerNoiseSeconds,
    timerTotalSeconds: state.timerTotalSeconds,
    remainingMs: getRemainingMs(),

    currentPlayerIndex: state.currentPlayerIndex,
    revealedCount: state.revealedCount,

    wrongVotes: clone(state.wrongVotes),
    partialCatches: clone(state.partialCatches),
    priorInterceptFailures: state.priorInterceptFailures,
    interceptAttempts: Array.from(state.interceptAttempts),
    interceptResults: clone(state.interceptResults),

    verificatorActive: clone(state.verificatorActive),
    verificatorUsedThisRound: Array.from(
      state.verificatorUsedThisRound
    ),
    verificatorRolledPlayers: Array.from(
      state.verificatorRolledPlayers
    ),

    currentRoundStartedAt: state.currentRoundStartedAt,
    currentRoundEvents: clone(state.currentRoundEvents),
    lastBalanceChanges: clone(state.lastBalanceChanges),

    gadgetsBeforeRound: clone(state.gadgetsBeforeRound),
    spiesAnnounced: Boolean(state.announceSpies),

    // Блокировка ввода личного кода переживает перезагрузку, иначе
    // лимит попыток обходится обновлением страницы.
    codeFailures: state.codeFailures,
    codeLockedUntil: state.codeLockedUntil
  };
}

/* ---------- Сохранение ---------- */
export function saveRoundSnapshot() {
  if (
    (state.roundPhase !== "dealing" && state.roundPhase !== "game") ||
    state.gameEnded ||
    !state.assignments.length
  ) {
    return;
  }

  saveToStorage(STORAGE_KEYS.activeRound, buildRoundSnapshot());
}

export function clearRoundSnapshot() {
  try {
    localStorage.removeItem(STORAGE_KEYS.activeRound);
  } catch (error) {
    /* localStorage недоступен — нечего очищать */
  }
}

/* ---------- Чтение и проверка ---------- */
export function loadRoundSnapshot() {
  const snap = readFromStorage(STORAGE_KEYS.activeRound, null);

  if (!snap || typeof snap !== "object") return null;
  if (snap.version !== SNAPSHOT_VERSION) return null;
  if (snap.phase !== "dealing" && snap.phase !== "game") return null;

  if (!Array.isArray(snap.assignments) || snap.assignments.length < 3) {
    return null;
  }

  const known = new Set(state.players);

  const assignmentsValid = snap.assignments.every(
    (item) =>
      item &&
      typeof item.player === "string" &&
      known.has(item.player) &&
      (item.roleType === "spy" || item.roleType === "civilian") &&
      typeof item.accessCode === "string"
  );

  if (!assignmentsValid) return null;

  if (!Array.isArray(snap.roundPool) || !snap.roundPool.length) {
    return null;
  }

  if (
    !snap.roundPool.some((item) => item.name === snap.currentRoundLocation)
  ) {
    return null;
  }

  return snap;
}

/* ---------- Применение снимка к состоянию ----------
   Экраны и таймер восстанавливает resume.js. */
export function applyRoundSnapshot(snap) {
  state.assignments = clone(snap.assignments);
  state.currentRoundLocation = snap.currentRoundLocation;
  state.roundPool = clone(snap.roundPool);
  state.entropySeed = Number(snap.entropySeed) || 0;
  state.activeEvent = snap.activeEvent || null;
  state.activeGadgets = clone(snap.activeGadgets) || {};

  state.durationMinutes =
    Number(snap.durationMinutes) || state.durationMinutes;
  state.timerModifierSeconds = Number(snap.timerModifierSeconds) || 0;
  state.timerNoiseSeconds = Number(snap.timerNoiseSeconds) || 0;
  state.timerTotalSeconds = Number(snap.timerTotalSeconds) || 0;

  state.currentPlayerIndex = Number(snap.currentPlayerIndex) || 0;
  state.revealedCount = Number(snap.revealedCount) || 0;

  state.wrongVotes = clone(snap.wrongVotes) || {};
  state.partialCatches = clone(snap.partialCatches) || [];
  state.priorInterceptFailures =
    Number(snap.priorInterceptFailures) || 0;
  state.interceptAttempts = new Set(snap.interceptAttempts || []);
  state.interceptResults = clone(snap.interceptResults) || [];

  state.verificatorActive = clone(snap.verificatorActive) || {};
  state.verificatorUsedThisRound = new Set(
    snap.verificatorUsedThisRound || []
  );
  state.verificatorRolledPlayers = new Set(
    snap.verificatorRolledPlayers || []
  );

  state.currentRoundStartedAt =
    Number(snap.currentRoundStartedAt) || Date.now();
  state.currentRoundEvents = clone(snap.currentRoundEvents) || [];
  state.lastBalanceChanges = snap.lastBalanceChanges
    ? clone(snap.lastBalanceChanges)
    : null;

  state.gadgetsBeforeRound = clone(snap.gadgetsBeforeRound);
  state.announceSpies = snap.spiesAnnounced !== false;

  state.codeFailures = Math.max(0, Number(snap.codeFailures) || 0);
  state.codeLockedUntil = Math.max(0, Number(snap.codeLockedUntil) || 0);

  state.voting.suspect = null;
  state.voting.initiator = null;
  state.voting.voters = new Set();
  state.voting.committedVotes = {};
  state.votingInProgress = false;
  state.interceptInProgress = false;

  state.gameEnded = false;
  state.gameOutcome = null;
  state.roundSettled = false;
  state.roundPhase = snap.phase;

  // Таймер после восстановления всегда на паузе.
  if (snap.phase === "game") {
    const remaining = Math.max(1000, Number(snap.remainingMs) || 0);

    state.timerPaused = true;
    state.timerPausedRemainingMs = remaining;
    state.timerDeadline = null;
    state.timerRemainingSeconds = Math.ceil(remaining / 1000);
  }
}
