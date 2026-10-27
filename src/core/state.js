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
  lastRound: "spyfall_last_round",
  // PATCH 0.6.7 — история сыгранных раундов
  roundHistory: "spyfall_round_history",
  // Снимок активного раунда — для восстановления после перезагрузки.
  activeRound: "spyfall_active_round",
  spyStreaks: "spyfall_spy_streaks"
};

/* ---------- Ротация роли шпиона ----------
   После каждой завершённой роли шпиона вес игрока при следующем
   розыгрыше уменьшается на 25%. Раунд без этой роли сбрасывает серию. */
export const SPY_REPEAT_WEIGHT_STEP = 0.25;
export const SPY_REPEAT_MIN_WEIGHT = 0.1;
export const INTERCEPT_WINDOW_SECONDS = 15;

/* ---------- Экономика ----------
   Все расчёты по итогам раунда делает economy.settleRound().
   Принцип: проигравшая команда платит «банк раунда», победившая
   делит его. Это игра с нулевой суммой — монеты не берутся из
   воздуха. Единственный источник новых монет — бонус за участие,
   единственный сток — покупки в магазине. */
export const MIN_BALANCE = -500;
export const ELITE_THRESHOLD = 500;
export const ELITE_DISCOUNT = 0.1;
export const DEBTOR_TAX = 0.25;

// Банк раунда = POT_PER_CIVILIAN × число мирных, но не больше MAX_POT.
export const POT_PER_CIVILIAN = 30;
export const MAX_POT = 240;

// Бонус за сыгранный (не отменённый) раунд — получают все игроки.
export const PARTICIPATION_BONUS = 15;

// Веса долей внутри команды (доли нормируются на банк).
export const INITIATOR_WEIGHT = 2;
export const PARTIAL_INITIATOR_BONUS = 0.5;
export const EXPELLED_WIN_WEIGHT = 0.5;
export const EXPELLED_LOSS_WEIGHT = 1.5;
export const INTERCEPTOR_WEIGHT = 2;

// Неверный голос мирного: −15% к доле выигрыша, +15% к доле проигрыша.
export const WRONG_VOTE_STEP = 0.15;
export const WRONG_VOTE_MIN_WEIGHT = 0.1;

// Успешный перехват умножает банк: чем больше локаций в пуле,
// тем сложнее угадать и тем больше награда.
export const INTERCEPT_POT_PER_LOCATION = 0.25;
export const INTERCEPT_POT_MIN_MULT = 0.5;
export const INTERCEPT_POT_MAX_MULT = 2;

/* ---------- Ограничения партии ---------- */
export const MIN_PLAYERS = 4;
export const MIN_LOCATIONS = 5;

/* ---------- Таймер ----------
   Скрытая добавка к времени раунда: по стартовому таймеру нельзя
   вычислить владельца Глушителя (−1 мин) или Допроса (+1 мин).
   Чтобы отключить — поставьте [0]. */
export const TIMER_NOISE_STEPS = [-60, -30, 0, 30, 60];
export const TIMER_NOISE_SEED_CONSTANT = 0x7143B015;
export const MIN_TIMER_SECONDS = 60;

// PATCH 0.8.5 — кэп на суммарный модификатор таймера от гаджетов.
// Раньше 8 мирных с Допросом давали +8 минут. Теперь суммарно
// не больше ±2 минут.
export const TIMER_MODIFIER_CAP_SECONDS = 120;

/* ---------- Личные коды (перехват и Верификатор) ----------
   PATCH 0.8.5 — ослаблено с 3/60 с: одна ошибка мирного больше не
   блокирует шпиона на минуту. Перебор 4-значного кода всё равно
   бесполезен, а блокировка мешала решать в концовке. */
export const ACCESS_CODE_LENGTH = 4;
export const ACCESS_CODE_MAX_FAILURES = 5;
export const ACCESS_CODE_LOCK_SECONDS = 15;

/* ---------- События раунда ---------- */
export const CRISIS_CHANCE = 0.15;
export const HUNT_STEAL = 50;

/* ---------- TRNG / радар ---------- */
// Больше не используется для выбора локации (теперь crypto), оставлена
// для обратной совместимости.
export const LOCATION_SEED_CONSTANT = 0x10CA7105;
export const RADAR_MIN_POOL_SIZE = 3;

/* ---------- PATCH 0.7.0 — Верификатор ---------- */
// Доля от всех имеющихся Верификаторов в игре, которая
// активируется каждый раунд (30%).
export const VERIFICATOR_ACTIVATION_CHANCE = 0.3;

// Вероятность правдивого вердикта Верификатора (75%).
export const VERIFICATOR_TRUTH_RATE = 0.75;

// XOR-константа для отдельного TRNG-потока активации
// Верификаторов. Не пересекается с LOCATION_SEED_CONSTANT.
export const VERIFICATOR_SEED_CONSTANT = 0x5E71F1CA;

// XOR-константа для отдельного TRNG-потока вердиктов
// Верификатора (какой вердикт выпадет при использовании).
export const VERIFICATOR_VERDICT_SEED_CONSTANT = 0xBEEFCAFE;

/* ---------- Лимит истории раундов ---------- */
export const MAX_ROUND_HISTORY = 50;

/* ---------- Живое состояние приложения ---------- */
export const state = {
  players: [],
  customLocations: [],
  selectedPack: "default",
  editingLocationIndex: null,

  // PATCH 0.4 — пул выбранных локаций
  selectedLocations: [],

  // PATCH 0.4 — реальная локация текущего раунда
  currentRoundLocation: null,

  durationMinutes: 10,

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
  // Серии завершённых раундов в роли шпиона: { playerName: count }.
  spyStreaks: {},
  activeGadgets: {},

  pendingEvent: null,
  activeEvent: null,
  bonusRadar: null,

  lastBalanceChanges: null,
  soundEnabled: true,

  // PATCH 0.6.7 — метка старта текущего раунда (для статистики).
  currentRoundStartedAt: null,

  // PATCH 0.6.7 — история сыгранных раундов (до MAX_ROUND_HISTORY).
  roundHistory: [],

  // PATCH 0.6.7 — хронология текущего раунда: массив событий
  // { at: ms-от-старта, type: string, data: object }.
  // Заполняется pushRoundEvent() из различных модулей, сбрасывается
  // при старте нового раунда и при resetGame().
  currentRoundEvents: [],

  // PATCH 0.6.1 — счётчик неверных голосов за раунд:
  // { playerName: count }. -15% к награде и +15% к штрафу
  // за каждый неверный голос.
  wrongVotes: {},

  voting: {
    suspect: null,
    initiator: null,
    voters: new Set(),
    // PATCH 0.6.1 — голоса привязаны к подозреваемому:
    // { voterName: suspectName }. Пока голос не отменён или
    // не сброшен после провала — игрок не может голосовать
    // за другого подозреваемого.
    committedVotes: {}
  },

  // =========================================================
  // PATCH 0.7.0 — Верификатор
  // =========================================================
  // verificatorActive — { player: true } — у кого Верификатор
  //   активирован в ЭТОМ раунде (ролл 30% при старте).
  // verificatorUsedThisRound — Set игроков, которые уже применили
  //   свой Верификатор в этом раунде (повторно нельзя).
  // verificatorRolledPlayers — Set игроков, чей Верификатор был
  //   активирован (для отображения кнопки в интерфейсе судейства).
  //   Дублирует ключи verificatorActive, но удобнее как Set.
  verificatorActive: {},
  verificatorUsedThisRound: new Set(),
  verificatorRolledPlayers: new Set(),

  // =========================================================
  // PATCH 0.7.0 — Перехват локации (персональный)
  // =========================================================
  // priorInterceptFailures — счётчик провалов перехвата
  //   В ЭТОМ раунде. Влияет на награду перехватчика
  //   (эскалация). Сбрасывается при новом раунде.
  // interceptAttempts — Set игроков, которые уже пробовали
  //   перехват в этом раунде (каждый пробует один раз).
  // interceptResults — массив { player, location, success,
  //   priorFailures } для статистики и финала.
  // interceptInProgress — блокировка: пока идёт публичное
  //   вскрытие перехвата, повторный вызов запрещён.
  priorInterceptFailures: 0,
  interceptAttempts: new Set(),
  interceptResults: [],
  interceptInProgress: false,

  // PATCH 0.8.5 — флаг активного голосования больше НЕ блокирует
  // перехват (см. intercept.js). Оставлен для совместимости со
  // снимком раунда и обратной совместимости с бэкапами.
  votingInProgress: false,

  // Фаза активного раунда: null | "dealing" | "game".
  roundPhase: null,

  // Пул локаций, зафиксированный на старте раунда (перехват и радар
  // работают по нему, а не по настройкам, которые могут измениться).
  roundPool: [],

  // Момент (ms, Date.now()), когда таймер дойдёт до нуля.
  // Таймер считает по часам, а не по числу тиков setInterval.
  timerDeadline: null,

  // Остаток времени (ms), пока таймер на паузе.
  timerPausedRemainingMs: null,

  // Скрытая добавка к таймеру (см. TIMER_NOISE_STEPS).
  timerNoiseSeconds: 0,

  // Шпионы, пойманные голосованием, пока игра продолжалась:
  // [{ suspect, initiator }]. Нужны для расчёта по итогам раунда.
  partialCatches: [],

  // Снимки перед стартом раунда — для отмены без последствий.
  balancesBeforeRound: null,
  gadgetsBeforeRound: null,

  // Защита ввода кода от перебора.
  codeFailures: 0,
  codeLockedUntil: 0,

  // Раунд уже рассчитан (защита от двойной выплаты).
  roundSettled: false,

  // Банк последнего завершённого раунда (для экрана итогов).
  lastPot: 0,

  // Объявлять ли число шпионов в начале раунда.
  announceSpies: true,

  audioContext: null,
  lastTickSecond: null
};


/* =========================================================
   PATCH 0.6.7 — Запись события текущего раунда
========================================================= */

/* Публичный API: любой модуль может записать событие в
   хронологию текущего раунда. Если раунд ещё не стартовал
   (currentRoundStartedAt === null) — вызов игнорируется.

   Пример:
     pushRoundEvent("vote_submitted", { suspect, voters });
     pushRoundEvent("intercept_result", { location, correct });
--------------------------------------------------------- */
export function pushRoundEvent(type, data) {
  if (state.currentRoundStartedAt === null) return;
  if (typeof type !== "string" || !type) return;

  state.currentRoundEvents.push({
    at: Math.max(0, Date.now() - state.currentRoundStartedAt),
    type,
    data: data && typeof data === "object" ? data : {}
  });
}