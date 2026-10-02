/* =========================================================
   ШПИОН — app.js
   Patch 0.3.2
   Чистый Vanilla JavaScript без библиотек
========================================================= */
// @ts-nocheck
"use strict";

/* =========================================================
   КОНСТАНТЫ И СОСТОЯНИЕ
========================================================= */

const STORAGE_KEYS = {
  players: "spyfall_players",
  customLocations: "spyfall_custom_locations",
  settings: "spyfall_settings",
  balances: "spyfall_player_balances",
  radar: "spyfall_radar_purchases",
  gadgets: "spyfall_gadgets_v03"
};

const MIN_BALANCE = -500;
const ELITE_THRESHOLD = 500;
const DEBTOR_MARKUP = 0.2;
const ELITE_DISCOUNT = 0.1;
const DEBTOR_TAX = 0.25;
const CRISIS_CHANCE = 0.15;
const HUNT_STEAL = 50;

const RANDOM_EVENTS = {
  crisis: {
    title: "ЭКОНОМИЧЕСКИЙ КРИЗИС",
    description:
      "Все награды и штрафы в этом раунде удваиваются. Покупки заблокированы."
  },
  hunt: {
    title: "ОХОТА ЗА ГОЛОВАМИ",
    description:
      "Инициатор успешного голосования украдёт 50 коинов напрямую из баланса шпиона."
  },
  philanthropist: {
    title: "АНОНИМНЫЙ БЛАГОТВОРИТЕЛЬ",
    description:
      "Игрок с самым низким балансом бесплатно получает Радар 1 уровня на этот раунд."
  }
};

const GADGET_CATALOG = [
  {
    id: "radar1",
    key: "radar",
    level: 1,
    name: "Радар локаций ур. 1",
    description:
      "Сужает список возможных локаций до 50%. Сработает, если игрок станет шпионом. Если роль не подойдёт — предмет замораживается до следующей игры.",
    price: 100,
    side: "spy"
  },
  {
    id: "radar2",
    key: "radar",
    level: 2,
    name: "Радар локаций ур. 2",
    description:
      "Сужает список возможных локаций до 35%. Сработает, если игрок станет шпионом. Если роль не подойдёт — предмет замораживается до следующей игры.",
    price: 180,
    side: "spy"
  },
  {
    id: "jammer",
    key: "jammer",
    name: "Глушитель связи",
    description:
      "Для шпиона. Автоматически сокращает таймер раунда на 1 минуту при старте.",
    price: 120,
    side: "spy"
  },
  {
    id: "fakeId",
    key: "fakeId",
    name: "Фальшивое удостоверение",
    description:
      "Для шпиона. Если мирные успешно проголосуют против него — предмет спасёт шпиона. Одноразовый.",
    price: 150,
    side: "spy"
  },
  {
    id: "lieDetector",
    key: "lieDetector",
    name: "Детектор лжи",
    description:
      "Для мирного. Добавляет кнопку в интерфейс судейства. Позволяет 1 раз за раунд проверить любого игрока.",
    price: 100,
    side: "civilian"
  },
  {
    id: "extraInterrogation",
    key: "extraInterrogation",
    name: "Дополнительный допрос",
    description:
      "Для мирного. Добавляет +1 минуту к таймеру игры при старте.",
    price: 70,
    side: "civilian"
  },
  {
    id: "insurance",
    key: "insurance",
    name: "Страховка агентства",
    description:
      "Для мирного. Защищает баланс от списания коинов в случае проигрыша мирных.",
    price: 50,
    side: "civilian"
  }
];

const DEFAULT_LOCATIONS = [
  {
    name: "Орбитальная станция",
    roles: [
      "Космонавт",
      "Врач",
      "Бортинженер",
      "Инопланетный биолог",
      "Капитан",
      "Навигатор",
      "Связист"
    ]
  },
  {
    name: "Подводная лодка",
    roles: [
      "Капитан",
      "Акустик",
      "Торпедист",
      "Кок",
      "Матрос",
      "Механик",
      "Радист"
    ]
  },
  {
    name: "Пиратский корабль",
    roles: [
      "Капитан пиратов",
      "Штурман",
      "Кок",
      "Канонир",
      "Юнга",
      "Квартирмейстер",
      "Пленный дворянин"
    ]
  },
  {
    name: "Голливудская студия",
    roles: [
      "Режиссёр",
      "Актёр",
      "Оператор",
      "Гримёр",
      "Продюсер",
      "Каскадёр",
      "Сценарист"
    ]
  },
  {
    name: "Психиатрическая больница",
    roles: [
      "Главный врач",
      "Пациент",
      "Медсестра",
      "Санитар",
      "Психолог",
      "Охранник",
      "Посетитель"
    ]
  },
  {
    name: "Секретная лаборатория",
    roles: [
      "Учёный",
      "Лаборант",
      "Охранник",
      "Инженер",
      "Директор",
      "Инспектор",
      "Испытуемый"
    ]
  }
];

const state = {
  players: [],
  customLocations: [],
  selectedPack: "default",
  selectedLocation: null,

  durationMinutes: 10,
  roleMode: "classic",
  spiesSetting: "random",

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
  lastPointer: {
    x: 0,
    y: 0
  },

  revealRunId: 0,

  balances: {},

  gadgets: {},

  activeGadgets: {},

  pendingEvent: null,
  activeEvent: null,

  bonusRadar: null,

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

/* =========================================================
   DOM-ССЫЛКИ
========================================================= */

const $ = (selector) => document.querySelector(selector);

const elements = {
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

  toast: $("#toast")
};

/* =========================================================
   БАЗОВЫЕ ФУНКЦИИ
========================================================= */

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  if (!elements.toast) return;

  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeout);

  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Не удалось сохранить данные:", error);
  }
}

function readFromStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn("Не удалось прочитать данные:", error);
    return fallback;
  }
}

function showScreen(screenName) {
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

function openDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

/* =========================================================
   ЗВУКОВЫЕ ЭФФЕКТЫ
========================================================= */

function getAudioContext() {
  if (!state.audioContext) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }

  return state.audioContext;
}

function playTone({
  frequency = 440,
  duration = 0.12,
  type = "square",
  volume = 0.045,
  delay = 0
} = {}) {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  const startTime = context.currentTime + delay;
  const endTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
}

function playAuditClick() {
  playTone({
    frequency: 850,
    duration: 0.045,
    type: "square",
    volume: 0.025
  });
}

function playTimerTick() {
  playTone({
    frequency: 880,
    duration: 0.055,
    type: "square",
    volume: 0.04
  });
}

function playAlarm() {
  playTone({
    frequency: 260,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06
  });

  playTone({
    frequency: 180,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06,
    delay: 0.2
  });

  playTone({
    frequency: 260,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06,
    delay: 0.4
  });
}

function playSuccess() {
  playTone({
    frequency: 523.25,
    duration: 0.1,
    type: "square",
    volume: 0.045
  });

  playTone({
    frequency: 783.99,
    duration: 0.18,
    type: "square",
    volume: 0.045,
    delay: 0.11
  });
}

function playFailure() {
  playTone({
    frequency: 230,
    duration: 0.16,
    type: "sawtooth",
    volume: 0.055
  });

  playTone({
    frequency: 130,
    duration: 0.24,
    type: "sawtooth",
    volume: 0.055,
    delay: 0.17
  });
}

/* =========================================================
   ПРОФИЛИ ИГРОКОВ, РАНГИ И КОИНЫ
========================================================= */

function getPlayerRank(player) {
  const balance = getBalance(player);

  if (balance < 0) {
    return {
      label: "Должник Синдиката",
      modifier: "debtor"
    };
  }

  if (balance > ELITE_THRESHOLD) {
    return {
      label: "Элита МИ-6",
      modifier: "elite"
    };
  }

  return {
    label: "Агент под прикрытием",
    modifier: "agent"
  };
}

function getEffectivePrice(player, basePrice) {
  const balance = getBalance(player);

  let price = basePrice;

  if (balance > ELITE_THRESHOLD) {
    price = Math.max(1, Math.floor(price * (1 - ELITE_DISCOUNT)));
  }

  if (balance < 0) {
    price = Math.max(1, Math.ceil(price * (1 + DEBTOR_MARKUP)));
  }

  return price;
}

function normalizeBalances() {
  const result = {};

  state.players.forEach((player) => {
    const storedValue = Number(state.balances[player]);

    result[player] = Number.isFinite(storedValue)
      ? Math.max(MIN_BALANCE, Math.floor(storedValue))
      : 0;
  });

  state.balances = result;
  saveToStorage(STORAGE_KEYS.balances, state.balances);
}

function getBalance(player) {
  const value = Number(state.balances[player]);
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

function changeBalance(player, amount) {
  if (!player) return;

  const nextValue = getBalance(player) + Number(amount || 0);

  state.balances[player] = Math.max(
    MIN_BALANCE,
    Math.floor(nextValue)
  );

  saveToStorage(STORAGE_KEYS.balances, state.balances);
}

function applyRoundReward(player, baseAmount) {
  if (!player || !Number.isFinite(baseAmount) || baseAmount === 0) {
    return 0;
  }

  let amount = baseAmount;

  // Событие «Кризис» удваивает и награды, и штрафы ДО срабатывания
  // страховки. То есть страховка обнуляет уже удвоенный штраф —
  // это осознанное решение (страховка полностью покрывает урон
  // даже в кризис, но не даёт «прибыли»).
  if (state.activeEvent === "crisis") {
    amount = amount * 2;
  }

  if (amount < 0) {
    const gadgets = state.activeGadgets[player];

    if (gadgets && gadgets.insurance) {
      gadgets.insurance = false;
      return 0;
    }
  }

  if (amount > 0 && getBalance(player) < 0) {
    amount = Math.floor(amount * (1 - DEBTOR_TAX));
  }

  changeBalance(player, amount);

  return amount;
}

/* =========================================================
   ИНВЕНТАРЬ ГАДЖЕТОВ
========================================================= */

function createEmptyInventory() {
  return {
    radar: 0,
    jammer: 0,
    fakeId: 0,
    lieDetector: 0,
    extraInterrogation: 0,
    insurance: 0
  };
}

function normalizeGadgets() {
  const result = {};

  state.players.forEach((player) => {
    const stored = state.gadgets[player] || {};

    const radarLevel = Number(stored.radar);

    result[player] = {
      radar: [1, 2].includes(radarLevel) ? radarLevel : 0,
      jammer: stored.jammer ? 1 : 0,
      fakeId: stored.fakeId ? 1 : 0,
      lieDetector: stored.lieDetector ? 1 : 0,
      extraInterrogation: stored.extraInterrogation ? 1 : 0,
      insurance: stored.insurance ? 1 : 0
    };
  });

  state.gadgets = result;
  saveGadgets();
}

function saveGadgets() {
  saveToStorage(STORAGE_KEYS.gadgets, state.gadgets);
}

function migrateOldRadarPurchases() {
  const oldRadar = readFromStorage(STORAGE_KEYS.radar, {});

  if (!oldRadar || typeof oldRadar !== "object") return;

  Object.entries(oldRadar).forEach(([player, level]) => {
    if (!state.gadgets[player]) {
      state.gadgets[player] = createEmptyInventory();
    }

    const numericLevel = Number(level);

    if (
      [1, 2].includes(numericLevel) &&
      !state.gadgets[player].radar
    ) {
      state.gadgets[player].radar = numericLevel;
    }
  });

  saveGadgets();
}

function loadPlayers() {
  const savedPlayers = readFromStorage(STORAGE_KEYS.players, []);

  state.players = Array.isArray(savedPlayers)
    ? savedPlayers
        .filter((player) => typeof player === "string")
        .map((player) => player.trim())
        .filter(Boolean)
    : [];

  state.balances = readFromStorage(STORAGE_KEYS.balances, {});
  state.gadgets = readFromStorage(STORAGE_KEYS.gadgets, {});

  normalizeBalances();
  normalizeGadgets();
  migrateOldRadarPurchases();
  normalizeGadgets();

  renderPlayers();
}

function savePlayers() {
  saveToStorage(STORAGE_KEYS.players, state.players);
}

function addPlayer(name) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    showToast("Введите имя участника");
    return;
  }

  if (
    state.players.some(
      (player) =>
        player.toLowerCase() === normalizedName.toLowerCase()
    )
  ) {
    showToast("Такой участник уже добавлен");
    return;
  }

  if (state.players.length >= 100) {
    showToast("Максимальное количество участников — 100");
    return;
  }

  state.players.push(normalizedName);

  if (!Number.isFinite(Number(state.balances[normalizedName]))) {
    state.balances[normalizedName] = 0;
  }

  state.gadgets[normalizedName] = createEmptyInventory();

  savePlayers();
  normalizeBalances();
  normalizeGadgets();
  renderPlayers();

  elements.playerName.value = "";
  elements.playerName.focus();
}

function removePlayer(index) {
  const player = state.players[index];

  state.players.splice(index, 1);

  if (player) {
    delete state.balances[player];
    delete state.gadgets[player];
  }

  savePlayers();
  saveToStorage(STORAGE_KEYS.balances, state.balances);
  saveGadgets();

  renderPlayers();
}

function renderPlayers() {
  elements.playersList.innerHTML = "";
  elements.playersCount.textContent = String(state.players.length);
  elements.playersEmpty.hidden = state.players.length > 0;

  state.players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "player-item";

    const balance = getBalance(player);
    const rank = getPlayerRank(player);
    const inventory =
      state.gadgets[player] || createEmptyInventory();

    const badges = [];

    if (inventory.radar) {
      badges.push(`◉ Радар ${inventory.radar}`);
    }

    if (inventory.jammer) badges.push("⌁ Глушитель");
    if (inventory.fakeId) badges.push("✎ Удостоверение");
    if (inventory.lieDetector) badges.push("? Детектор");
    if (inventory.extraInterrogation) badges.push("+ Допрос");
    if (inventory.insurance) badges.push("⛨ Страховка");

    item.innerHTML = `
      <div class="player-item__identity">
        <span class="player-item__number">${index + 1}</span>

        <button
          type="button"
          class="player-item__name player-name-button"
          data-open-shop="${escapeHtml(player)}"
          title="Открыть магазин игрока"
        >
          ${escapeHtml(player)}
          <span class="player-item__balance">
            (${balance} 🪙)
          </span>
          <span class="player-item__rank player-item__rank--${rank.modifier}">
            ${escapeHtml(rank.label)}
          </span>
          ${
            badges.length
              ? `<span class="player-item__gadgets">${badges
                  .map(escapeHtml)
                  .join(" · ")}</span>`
              : ""
          }
        </button>
      </div>

      <button
        type="button"
        class="player-item__remove"
        aria-label="Удалить ${escapeHtml(player)}"
        title="Удалить участника"
        data-remove-player="${index}"
      >
        ×
      </button>
    `;

    elements.playersList.appendChild(item);
  });
}

/* =========================================================
   МАГАЗИН
========================================================= */

function createShopModal() {
  let modal = $("#equipment-shop-modal");

  if (modal) return modal;

  modal = document.createElement("dialog");
  modal.id = "equipment-shop-modal";
  modal.className = "equipment-shop-modal";

  modal.innerHTML = `
    <div class="equipment-shop-modal__content">
      <button
        type="button"
        class="modal-close"
        data-close-shop
        aria-label="Закрыть"
      >
        ×
      </button>

      <div class="equipment-shop-modal__eyebrow">
        EQUIPMENT MARKET // PATCH 0.3
      </div>

      <h2 class="equipment-shop-modal__title">
        Магазин снаряжения
      </h2>

      <p class="equipment-shop-modal__player"></p>

      <div class="equipment-shop-modal__balance"></div>

      <div class="equipment-shop-modal__items"></div>

      <p class="equipment-shop-modal__status"></p>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (
      event.target === modal ||
      event.target.closest("[data-close-shop]")
    ) {
      closeDialog(modal);
    }

    const buyButton = event.target.closest("[data-buy-gadget]");

    if (!buyButton) return;

    const player = modal.dataset.player;
    const gadgetId = buyButton.dataset.buyGadget;

    buyGadget(player, gadgetId);
    renderShopModal(player);
  });

  return modal;
}

function renderShopModal(player) {
  const modal = createShopModal();

  modal.dataset.player = player;

  const balance = getBalance(player);
  const rank = getPlayerRank(player);
  const inventory =
    state.gadgets[player] || createEmptyInventory();

  const playerElement = modal.querySelector(
    ".equipment-shop-modal__player"
  );

  const balanceElement = modal.querySelector(
    ".equipment-shop-modal__balance"
  );

  const itemsContainer = modal.querySelector(
    ".equipment-shop-modal__items"
  );

  const statusElement = modal.querySelector(
    ".equipment-shop-modal__status"
  );

  playerElement.textContent = `Профиль: ${player} — ${rank.label}`;
  balanceElement.textContent = `Баланс: ${balance} 🪙`;

  itemsContainer.innerHTML = GADGET_CATALOG.map((gadget) => {
    const owned =
      gadget.key === "radar"
        ? inventory.radar > 0
        : Boolean(inventory[gadget.key]);

    const price = getEffectivePrice(player, gadget.price);
    const canAfford = balance >= price;
    const crisis = state.activeEvent === "crisis";

    const disabled = owned || !canAfford || crisis;

    const buttonModifier =
      gadget.side === "spy"
        ? "button--danger"
        : "button--primary";

    const buttonLabel = owned
      ? "Уже куплено"
      : crisis
      ? "Заблокировано"
      : !canAfford
      ? `Недостаточно (${price} 🪙)`
      : `${price} 🪙`;

    return `
      <article class="equipment-item">
        <div class="equipment-item__icon">
          ${gadget.side === "spy" ? "☠" : "⛨"}
        </div>

        <div class="equipment-item__body">
          <h3>${escapeHtml(gadget.name)}</h3>
          <p>${escapeHtml(gadget.description)}</p>

          <div class="equipment-item__actions">
            <button
              type="button"
              class="button ${buttonModifier}"
              data-buy-gadget="${gadget.id}"
              ${disabled ? "disabled" : ""}
            >
              ${buttonLabel}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  if (state.activeEvent === "crisis") {
    statusElement.textContent =
      "⚠ ЭКОНОМИЧЕСКИЙ КРИЗИС: покупки временно заблокированы.";
    statusElement.className =
      "equipment-shop-modal__status equipment-shop-modal__status--danger";
  } else if (balance < 0) {
    statusElement.textContent =
      "⚠ Должник Синдиката: наценка +20%, выигрыш урезан на 25%.";
    statusElement.className =
      "equipment-shop-modal__status equipment-shop-modal__status--danger";
  } else if (balance > ELITE_THRESHOLD) {
    statusElement.textContent =
      "★ Элита МИ-6: автоматическая скидка 10% на все покупки.";
    statusElement.className =
      "equipment-shop-modal__status equipment-shop-modal__status--elite";
  } else {
    statusElement.textContent =
      "Предметы покупаются втайне. Если роль не подойдёт — предмет замораживается.";
    statusElement.className = "equipment-shop-modal__status";
  }
}

function openPlayerShop(player) {
  if (!state.players.includes(player)) return;

  if (state.activeEvent === "crisis") {
    showToast("Покупки заблокированы: экономический кризис");
    playFailure();
    return;
  }

  const modal = createShopModal();

  renderShopModal(player);
  openDialog(modal);
}

function buyGadget(player, gadgetId) {
  const gadget = GADGET_CATALOG.find(
    (item) => item.id === gadgetId
  );

  if (!gadget) return;

  if (state.activeEvent === "crisis") {
    showToast("Покупки заблокированы: экономический кризис");
    playFailure();
    return;
  }

  if (!state.gadgets[player]) {
    state.gadgets[player] = createEmptyInventory();
  }

  const inventory = state.gadgets[player];

  if (gadget.key === "radar") {
    if (inventory.radar) {
      showToast("У игрока уже есть радар");
      playFailure();
      return;
    }
  } else if (inventory[gadget.key]) {
    showToast("Этот предмет уже куплен");
    playFailure();
    return;
  }

  const price = getEffectivePrice(player, gadget.price);

  if (getBalance(player) < price) {
    showToast("Недостаточно коинов");
    playFailure();
    return;
  }

  changeBalance(player, -price);

  if (gadget.key === "radar") {
    inventory.radar = gadget.level;
  } else {
    inventory[gadget.key] = 1;
  }

  saveGadgets();
  renderPlayers();
  playSuccess();
  showToast(`Куплено: ${gadget.name} за ${price} 🪙`);
}

/* =========================================================
   КАСТОМНЫЕ ЛОКАЦИИ
========================================================= */

function loadCustomLocations() {
  const savedLocations = readFromStorage(
    STORAGE_KEYS.customLocations,
    []
  );

  state.customLocations = Array.isArray(savedLocations)
    ? savedLocations.filter((location) => {
        return (
          location &&
          typeof location.name === "string" &&
          Array.isArray(location.roles) &&
          location.roles.length >= 5
        );
      })
    : [];

  renderCustomLocations();
}

function saveCustomLocations() {
  saveToStorage(
    STORAGE_KEYS.customLocations,
    state.customLocations
  );
}

function getCurrentLocations() {
  return state.selectedPack === "custom"
    ? state.customLocations
    : DEFAULT_LOCATIONS;
}

function renderDefaultLocations() {
  renderLocationCards(
    elements.defaultLocations,
    DEFAULT_LOCATIONS
  );
}

function renderCustomLocations() {
  renderLocationCards(
    elements.customLocations,
    state.customLocations
  );

  elements.customPacksList.innerHTML = "";

  elements.customLocationsCount.textContent = String(
    state.customLocations.length
  );

  elements.customPacksEmpty.hidden =
    state.customLocations.length > 0;

  state.customLocations.forEach((location, index) => {
    const item = document.createElement("div");
    item.className = "custom-pack-item";

    item.innerHTML = `
      <div>
        <div class="custom-pack-item__name">
          ${escapeHtml(location.name)}
        </div>

        <div class="custom-pack-item__roles">
          ${location.roles.length} ролей
        </div>
      </div>

      <button
        type="button"
        class="custom-pack-item__delete"
        title="Удалить локацию"
        aria-label="Удалить ${escapeHtml(location.name)}"
        data-delete-location="${index}"
      >
        ×
      </button>
    `;

    elements.customPacksList.appendChild(item);
  });
}

function renderLocationCards(container, locations) {
  container.innerHTML = "";

  if (!locations.length) {
    container.innerHTML = `
      <div class="empty-state empty-state--compact">
        <p>В этом паке пока нет локаций.</p>
      </div>
    `;

    return;
  }

  locations.forEach((location, index) => {
    const card = document.createElement("button");

    card.type = "button";
    card.className = "location-card";
    card.dataset.locationIndex = String(index);

    const isCustomContainer =
      container === elements.customLocations;

    const isSelected =
      state.selectedLocation &&
      state.selectedLocation.name === location.name &&
      state.selectedPack ===
        (isCustomContainer ? "custom" : "default");

    card.classList.toggle("is-selected", Boolean(isSelected));

    card.innerHTML = `
      <div class="location-card__icon">◈</div>

      <div class="location-card__name">
        ${escapeHtml(location.name)}
      </div>

      <div class="location-card__roles">
        ${location.roles
          .slice(0, 3)
          .map(escapeHtml)
          .join(" · ")}
        ${location.roles.length > 3 ? " …" : ""}
      </div>

      <span class="location-card__check">✓</span>
    `;

    container.appendChild(card);
  });
}

function selectLocation(index) {
  const locations = getCurrentLocations();
  const selected = locations[index];

  if (!selected) return;

  state.selectedLocation = selected;

  elements.locationHint.textContent =
    `Выбрана локация: ${selected.name}`;

  renderDefaultLocations();
  renderCustomLocations();
}

/* =========================================================
   НАСТРОЙКИ
========================================================= */

function loadSettings() {
  const savedSettings = readFromStorage(
    STORAGE_KEYS.settings,
    {}
  );

  if (savedSettings.durationMinutes) {
    state.durationMinutes = Number(
      savedSettings.durationMinutes
    );

    elements.duration.value = String(
      state.durationMinutes
    );
  }

  if (savedSettings.roleMode) {
    state.roleMode = savedSettings.roleMode;

    elements.roleModeInputs.forEach((input) => {
      input.checked = input.value === state.roleMode;
    });
  }

  if (savedSettings.spiesSetting) {
    state.spiesSetting = savedSettings.spiesSetting;
    elements.spiesCount.value = state.spiesSetting;
  }

  ensureSpiesVisibility();
}

function saveSettings() {
  saveToStorage(STORAGE_KEYS.settings, {
    durationMinutes: state.durationMinutes,
    roleMode: state.roleMode,
    spiesSetting: state.spiesSetting
  });
}

function ensureSpiesVisibility() {
  // Секция «Количество шпионов» сейчас всегда видима:
  // настройка релевантна и для classic, и для accomplice.
  // Функция сохранена как точка расширения для будущей логики.
  if (elements.spiesSettings) {
    elements.spiesSettings.hidden = false;
  }
}

function readSettingsFromForm() {
  state.durationMinutes = Number(elements.duration.value);

  state.roleMode =
    document.querySelector(
      'input[name="role-mode"]:checked'
    )?.value || "classic";

  state.spiesSetting = elements.spiesCount.value;

  saveSettings();
}

/* =========================================================
   TRNG И ЭНТРОПИЯ
========================================================= */

async function getBatteryEntropy() {
  const fallback = {
    level: "unavailable",
    charging: "unknown"
  };

  try {
    if (!navigator.getBattery) {
      return fallback;
    }

    const battery = await navigator.getBattery();

    return {
      level: Math.round(battery.level * 100),
      charging: battery.charging ? "yes" : "no"
    };
  } catch (error) {
    return fallback;
  }
}

function getMemoryEntropy() {
  if (
    performance.memory &&
    Number.isFinite(performance.memory.usedJSHeapSize)
  ) {
    return Math.round(
      performance.memory.usedJSHeapSize / 1024 / 1024
    );
  }

  return "unavailable";
}

function stringToSeed(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

async function collectEntropy() {
  const battery = await getBatteryEntropy();
  const memory = getMemoryEntropy();
  const preciseTime = performance.now();
  const wallClockTime = Date.now();

  let cryptoPart = "";

  if (window.crypto?.getRandomValues) {
    const randomBytes = new Uint32Array(4);

    window.crypto.getRandomValues(randomBytes);

    cryptoPart = Array.from(randomBytes).join("-");
  }

  const pool = [
    preciseTime.toFixed(6),
    wallClockTime,
    battery.level,
    battery.charging,
    memory,
    state.lastPointer.x,
    state.lastPointer.y,
    window.innerWidth,
    window.innerHeight,
    navigator.language,
    navigator.hardwareConcurrency || "unknown",
    navigator.platform || "unknown",
    cryptoPart
  ].join("|");

  return {
    pool,
    preciseTime,
    battery,
    memory,
    seed: stringToSeed(pool)
  };
}

function createRandomGenerator(seed) {
  let currentSeed = seed >>> 0;

  return function random() {
    currentSeed ^= currentSeed << 13;
    currentSeed ^= currentSeed >>> 17;
    currentSeed ^= currentSeed << 5;
    currentSeed >>>= 0;

    return currentSeed / 4294967296;
  };
}

function shuffleArray(array, random) {
  const result = [...array];

  for (
    let index = result.length - 1;
    index > 0;
    index -= 1
  ) {
    const targetIndex = Math.floor(
      random() * (index + 1)
    );

    [result[index], result[targetIndex]] = [
      result[targetIndex],
      result[index]
    ];
  }

  return result;
}

/* =========================================================
   АУДИТ ЭНТРОПИИ И СЛУЧАЙНЫЕ СОБЫТИЯ
========================================================= */

function addAuditLine(text, type = "") {
  const line = document.createElement("div");

  line.className = "audit-log__line";

  if (type) {
    line.classList.add(`audit-log__line--${type}`);
  }

  line.textContent = text;
  elements.auditLog.appendChild(line);

  playAuditClick();
}

function getLowestBalancePlayer() {
  if (!state.players.length) return null;

  let lowestPlayer = state.players[0];
  let lowestBalance = getBalance(lowestPlayer);

  state.players.forEach((player) => {
    const balance = getBalance(player);

    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestPlayer = player;
    }
  });

  return lowestPlayer;
}

function rollRandomEvent(random) {
  const eventRoll = random();

  if (eventRoll >= CRISIS_CHANCE) {
    return null;
  }

  const pick = random();

  if (pick < 0.34) return "crisis";
  if (pick < 0.67) return "hunt";

  return "philanthropist";
}

async function runEntropyAudit() {
  elements.auditLog.innerHTML = "";

  elements.auditProgressBar.style.animation = "none";
  elements.auditProgressBar.offsetHeight;
  elements.auditProgressBar.style.animation = "";

  const entropyPromise = collectEntropy();

  addAuditLine("Считывание энтропии устройства...");
  await sleep(300);

  const entropy = await entropyPromise;

  addAuditLine(
    `Заряд батареи: ${entropy.battery.level}%`
  );

  await sleep(300);

  addAuditLine(
    `Микросекунды клика: ${entropy.preciseTime.toFixed(6)}...`
  );

  await sleep(300);

  addAuditLine(
    `Поток RAM: ${entropy.memory}MB...`
  );

  await sleep(300);

  addAuditLine("Смешивание хаотичных параметров...");

  await sleep(300);

  addAuditLine(
    "АНАЛИЗ ХАОСА ЗАВЕРШЕН. РОЛИ РАСПРЕДЕЛЕНЫ",
    "success"
  );

  await sleep(400);

  const eventRandom = createRandomGenerator(
    (entropy.seed ^ 0x9e3779b9) >>> 0
  );

  const eventKey = rollRandomEvent(eventRandom);

  state.pendingEvent = eventKey;

  if (eventKey) {
    const eventData = RANDOM_EVENTS[eventKey];

    addAuditLine(
      `СЛУЧАЙНОЕ СОБЫТИЕ: ${eventData.title}`,
      "danger"
    );

    await sleep(320);

    addAuditLine(eventData.description, "danger");

    await sleep(360);
  }

  await sleep(420);

  return entropy;
}

/* =========================================================
   РАСПРЕДЕЛЕНИЕ РОЛЕЙ
========================================================= */

function getSpiesCount(playerCount, setting, random) {
  const maximumAllowed = Math.max(
    1,
    Math.floor(playerCount * 0.25)
  );

  if (setting === "all") {
    return playerCount;
  }

  if (setting === "random") {
    return 1 + Math.floor(random() * maximumAllowed);
  }

  const requested = Number(setting);

  return Math.min(
    Math.max(1, requested || 1),
    maximumAllowed,
    playerCount - 1
  );
}

function createAssignments(entropy) {
  const random = createRandomGenerator(entropy.seed);
  const players = shuffleArray(state.players, random);
  const location = state.selectedLocation;
  const roles = shuffleArray(location.roles, random);

  if (state.spiesSetting === "all") {
    return players.map((player) => ({
      player,
      roleType: "spy",
      role: null,
      location: location.name
    }));
  }

  const spiesCount = getSpiesCount(
    players.length,
    state.spiesSetting,
    random
  );

  const assignments = players.map((player, index) => ({
    player,
    roleType: "civilian",
    role: roles[index % roles.length],
    location: location.name
  }));

  const availableIndexes = shuffleArray(
    assignments.map((_, index) => index),
    random
  );

  const spyIndexes = availableIndexes.slice(
    0,
    spiesCount
  );

  spyIndexes.forEach((index) => {
    assignments[index].roleType = "spy";
    assignments[index].role = null;
  });

  if (state.roleMode === "accomplice") {
    const accompliceIndex = availableIndexes.find(
      (index) => !spyIndexes.includes(index)
    );

    if (accompliceIndex !== undefined) {
      assignments[accompliceIndex].roleType =
        "accomplice";

      assignments[accompliceIndex].role =
        "Сообщник шпиона";
    }
  }

  return assignments;
}

/* =========================================================
   АКТИВАЦИЯ ГАДЖЕТОВ
========================================================= */

function activateGadgets() {
  state.activeGadgets = {};
  state.timerModifierSeconds = 0;

  const bonusRadarPlayer = state.bonusRadar;

  state.assignments.forEach((assignment) => {
    const player = assignment.player;

    if (!state.gadgets[player]) {
      state.gadgets[player] = createEmptyInventory();
    }

    const inventory = state.gadgets[player];
    const active = {};

    const isSpy = assignment.roleType === "spy";
    const isCivilian = assignment.roleType === "civilian";

    // ВАЖНО: сгорают только предметы, подходящие роли игрока.
    // Если радар купил мирный — он остаётся в инвентаре до следующей игры
    // (замораживается). То же касается остальных «не тех» предметов.

    if (inventory.radar && isSpy) {
      active.radar = inventory.radar;
      inventory.radar = 0;
    }

    if (inventory.jammer && isSpy) {
      active.jammer = true;
      state.timerModifierSeconds -= 60;
      inventory.jammer = 0;
    }

    if (inventory.fakeId && isSpy) {
      active.fakeId = true;
      inventory.fakeId = 0;
    }

    if (inventory.lieDetector && isCivilian) {
      active.lieDetector = true;
      inventory.lieDetector = 0;
    }

    if (inventory.extraInterrogation && isCivilian) {
      active.extraInterrogation = true;
      state.timerModifierSeconds += 60;
      inventory.extraInterrogation = 0;
    }

    if (inventory.insurance && isCivilian) {
      active.insurance = true;
      inventory.insurance = 0;
    }

    if (
      bonusRadarPlayer === player &&
      isSpy &&
      !active.radar
    ) {
      active.radar = 1;
    }

    state.activeGadgets[player] = active;
  });

  state.bonusRadar = null;

  saveGadgets();
  renderPlayers();
}

/* =========================================================
   ЭКРАН РАЗДАЧИ
========================================================= */

function prepareDealingScreen() {
  state.currentPlayerIndex = 0;
  state.revealedCount = 0;
  state.roleVisible = false;

  elements.roleCard.classList.add("is-hidden");
  elements.revealRole.classList.remove("is-hidden");

  elements.totalPlayers.textContent = String(
    state.assignments.length
  );

  renderCurrentPlayer();
  updateDealingProgress();

  elements.startTimer.classList.add("is-hidden");
}

function renderCurrentPlayer() {
  // BUG 1 (0.3.1): если все карты уже выданы — не показываем кнопку reveal заново.
  if (state.revealedCount >= state.assignments.length) {
    state.roleVisible = false;
    elements.revealRole.classList.add("is-hidden");
    elements.roleCard.classList.add("is-hidden");
    return;
  }

  const assignment =
    state.assignments[state.currentPlayerIndex];

  if (!assignment) return;

  const currentNumber = state.currentPlayerIndex + 1;
  const totalPlayers = state.assignments.length;

  elements.currentPlayerNumber.textContent =
    String(currentNumber);

  elements.currentPlayerName.textContent =
    assignment.player;

  elements.revealInstruction.textContent =
    "Возьмите телефон и нажмите кнопку, чтобы увидеть свою роль.";

  elements.revealRole.classList.remove("is-hidden");
  elements.roleCard.classList.add("is-hidden");

  elements.hideRoleLabel.textContent =
    currentNumber < totalPlayers
      ? `Скрыть карту и передать ${
          state.assignments[currentNumber].player
        }`
      : "Скрыть карту";

  state.roleVisible = false;
}

function getRadarLocations(realLocation, level, random = Math.random) {
  const locations = getCurrentLocations().map(
    (location) => location.name
  );

  const total = locations.length;

  // BUG 4 (0.3.1): защита от пака из одной локации — радар не должен
  // давать шпиону мгновенную подсказку.
  if (total < 2) {
    return [realLocation];
  }

  const ratio = level === 2 ? 0.35 : 0.5;

  // BUG 2 (0.3.2): Math.round вместо Math.ceil, чтобы уровень 2
  // действительно сужал список сильнее уровня 1 даже на 6 локациях.
  //  5 локаций: lvl1 = 3, lvl2 = 2
  //  6 локаций: lvl1 = 3, lvl2 = 2 (было 3/3 из-за ceil)
  // 10 локаций: lvl1 = 5, lvl2 = 4
  const count = Math.max(
    2,
    Math.min(total, Math.round(total * ratio))
  );

  const pool = locations.filter(
    (location) => location !== realLocation
  );

  const selected = [];

  while (
    selected.length < count - 1 &&
    pool.length > 0
  ) {
    const index = Math.floor(random() * pool.length);

    const candidate = pool.splice(index, 1)[0];

    if (candidate && !selected.includes(candidate)) {
      selected.push(candidate);
    }
  }

  selected.push(realLocation);

  return selected.sort();
}

function revealCurrentRole() {
  const assignment =
    state.assignments[state.currentPlayerIndex];

  if (!assignment) return;

  state.roleVisible = true;

  elements.revealRole.classList.add("is-hidden");
  elements.roleCard.classList.remove("is-hidden");

  elements.roleCardLocation.textContent = "";
  elements.roleCardDescription.textContent = "";

  if (assignment.roleType === "spy") {
    const active =
      state.activeGadgets[assignment.player] || {};

    const radarLevel = active.radar;

    elements.roleCardLabel.textContent =
      "ОПАСНОСТЬ // СЕКРЕТНО";

    elements.roleCardIcon.textContent = "☠";
    elements.roleCardTitle.textContent = "Вы ШПИОН";

    const extras = [];

    if (active.jammer) {
      extras.push("Глушитель связи активен (−1 мин).");
    }

    if (active.fakeId) {
      extras.push(
        "Фальшивое удостоверение активно: спасёт от голосования."
      );
    }

    if (radarLevel) {
      // BUG 3 (0.3.1): используем TRNG вместо Math.random.
      // Персональный сид = seed игры XOR hash(имя игрока),
      // чтобы разные шпионы не получали одинаковый список.
      const radarRandom = createRandomGenerator(
        (state.entropySeed ^ stringToSeed(assignment.player)) >>> 0
      );

      const possibleLocations = getRadarLocations(
        assignment.location,
        radarLevel,
        radarRandom
      );

      elements.roleCardLocation.innerHTML = `
        <strong>
          Радар локаций уровня ${radarLevel}
        </strong>

        <span class="radar-location-list">
          ${possibleLocations
            .map(
              (location) =>
                `<span>${escapeHtml(location)}</span>`
            )
            .join("")}
        </span>
      `;

      extras.push(
        "Настоящая локация находится среди вариантов. Радар сгорает после игры."
      );
    } else {
      elements.roleCardLocation.textContent =
        "Локация скрыта";

      extras.push(
        "Вычислите локацию по вопросам других игроков. Не выдайте себя."
      );
    }

    elements.roleCardDescription.textContent =
      extras.join(" ");
  } else if (assignment.roleType === "accomplice") {
    elements.roleCardLabel.textContent =
      "СЕКРЕТНАЯ РОЛЬ";

    elements.roleCardIcon.textContent = "◉";
    elements.roleCardTitle.textContent =
      "Сообщник шпиона";

    elements.roleCardLocation.textContent =
      `Локация: ${assignment.location}`;

    elements.roleCardDescription.textContent =
      "Ваша роль: Сообщник шпиона. Защищайте шпиона, не выдавая себя!";
  } else {
    const active =
      state.activeGadgets[assignment.player] || {};

    const extras = [];

    if (active.lieDetector) {
      extras.push(
        "Детектор лжи активен: проверьте любого игрока."
      );
    }

    if (active.extraInterrogation) {
      extras.push("Дополнительный допрос: +1 мин к таймеру.");
    }

    if (active.insurance) {
      extras.push("Страховка агентства: защита баланса.");
    }

    elements.roleCardLabel.textContent =
      "СЕКРЕТНАЯ ИНФОРМАЦИЯ";

    elements.roleCardIcon.textContent = "◈";
    elements.roleCardTitle.textContent =
      assignment.role;

    elements.roleCardLocation.textContent =
      `Локация: ${assignment.location}`;

    let description =
      "Задавайте осторожные вопросы и попытайтесь вычислить шпиона.";

    if (extras.length) {
      description += " " + extras.join(" ");
    }

    elements.roleCardDescription.textContent = description;
  }
}

function hideCurrentRole() {
  const isLastPlayer =
    state.currentPlayerIndex >=
    state.assignments.length - 1;

  state.roleVisible = false;

  elements.roleCard.classList.add("is-hidden");

  // BUG 2 (0.3.1): отдельный счётчик реально скрытых карт.
  state.revealedCount += 1;

  if (isLastPlayer) {
    elements.revealRole.classList.add("is-hidden");
    elements.startTimer.classList.remove("is-hidden");
  } else {
    state.currentPlayerIndex += 1;
  }

  renderCurrentPlayer();
  updateDealingProgress();
}

function updateDealingProgress() {
  const revealedCount = state.revealedCount;
  const total = state.assignments.length;

  const percentage = total
    ? (revealedCount / total) * 100
    : 0;

  elements.dealingProgressBar.style.width =
    `${percentage}%`;

  if (revealedCount === 0) {
    elements.dealingProgressText.textContent =
      "Карты ещё не открывались";
  } else if (revealedCount >= total) {
    elements.dealingProgressText.textContent =
      "Все карты выданы. Можно начинать допрос.";
  } else {
    elements.dealingProgressText.textContent =
      `Подготовлено карт: ${revealedCount} из ${total}`;
  }
}

/* =========================================================
   СУДЕЙСТВО: ДИНАМИЧЕСКИЙ ИНТЕРФЕЙС
========================================================= */

function createJudgingInterface() {
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

        <div
          id="suspect-list"
          class="judging-list"
        ></div>

        <div
          id="voter-panel"
          class="voter-panel"
          hidden
        >
          <h4>Инициатор голосования</h4>

          <div
            id="initiator-list"
            class="judging-list"
          ></div>

          <h4>Кто отдаёт голос?</h4>

          <div
            id="voter-list"
            class="judging-list"
          ></div>

          <button
            type="button"
            class="button button--primary"
            id="submit-vote"
          >
            Проверить голосование
          </button>

          <p
            id="vote-status"
            class="judging-status"
          ></p>
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

        <div
          id="lie-detector-users"
          class="judging-list"
        ></div>

        <div
          id="lie-detector-targets"
          class="judging-list"
          hidden
        ></div>

        <p
          id="lie-detector-output"
          class="judging-status"
        ></p>
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

function renderJudgingInterface() {
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

  const locations = getCurrentLocations();

  locationList.innerHTML = locations
    .map(
      (location) => `
        <button
          type="button"
          class="judging-location-button"
          data-intercept-location="${escapeHtml(
            location.name
          )}"
        >
          ${escapeHtml(location.name)}
        </button>
      `
    )
    .join("");

  renderLieDetector();
}

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
    usersContainer.innerHTML = `
      <span class="judging-empty">
        Нет активных детекторов в этом раунде.
      </span>
    `;

    targetsContainer.hidden = true;
    output.textContent = "";

    return;
  }

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

  if (state.lieDetector.selectedUser) {
    targetsContainer.hidden = false;

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
  } else {
    targetsContainer.hidden = true;
    targetsContainer.innerHTML = "";
  }

  output.textContent = state.lieDetector.output;
}

function updateVoterButtons() {
  const voterList = $("#voter-list");
  const initiatorList = $("#initiator-list");

  if (voterList) {
    voterList
      .querySelectorAll("[data-voter]")
      .forEach((button) => {
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

// BUG 6 (0.3.1): единый хелпер сброса состояния голосования.
function resetVotingState() {
  state.voting.suspect = null;
  state.voting.initiator = null;
  state.voting.voters = new Set();

  const voterPanel = $("#voter-panel");

  if (voterPanel) {
    voterPanel.hidden = true;
  }

  // BUG 5 (0.3.1): снимаем подсветку со всех кнопок голосования.
  document
    .querySelectorAll(
      "[data-suspect], [data-voter], [data-initiator]"
    )
    .forEach((button) => {
      button.classList.remove("is-selected");
    });

  const voteStatus = $("#vote-status");

  if (voteStatus) {
    // BUG 3 (0.3.2): при сбросе всегда возвращаем нейтральный класс.
    voteStatus.className = "judging-status";
    voteStatus.textContent = "";
  }
}

function handleJudgingClick(event) {
  const suspectButton = event.target.closest(
    "[data-suspect]"
  );

  if (suspectButton) {
    state.voting.suspect = suspectButton.dataset.suspect;
    state.voting.voters = new Set();
    state.voting.initiator = null;

    const voterPanel = $("#voter-panel");

    if (voterPanel) {
      voterPanel.hidden = false;
    }

    document
      .querySelectorAll("[data-suspect]")
      .forEach((button) => {
        button.classList.toggle(
          "is-selected",
          button === suspectButton
        );
      });

    updateVoterButtons();
    return;
  }

  const initiatorButton = event.target.closest(
    "[data-initiator]"
  );

  if (initiatorButton) {
    state.voting.initiator = initiatorButton.dataset.initiator;
    updateVoterButtons();
    return;
  }

  const voterButton = event.target.closest(
    "[data-voter]"
  );

  if (voterButton) {
    const voter = voterButton.dataset.voter;

    if (state.voting.voters.has(voter)) {
      state.voting.voters.delete(voter);
    } else {
      state.voting.voters.add(voter);
    }

    // BUG 7 (0.3.1): инициатор теперь назначается только явным выбором,
    // никакого «молчаливого» назначения первого голосующего.

    updateVoterButtons();
    return;
  }

  const submitVoteButton = event.target.closest(
    "#submit-vote"
  );

  if (submitVoteButton) {
    submitVote();
    return;
  }

  const locationButton = event.target.closest(
    "[data-intercept-location]"
  );

  if (locationButton) {
    const location =
      locationButton.dataset.interceptLocation;

    interceptLocation(location);
    return;
  }

  const lieUserButton = event.target.closest(
    "[data-lie-user]"
  );

  if (lieUserButton) {
    const name = lieUserButton.dataset.lieUser;

    if (state.lieDetector.usedUsers.has(name)) return;

    state.lieDetector.selectedUser = name;
    state.lieDetector.output = "";

    renderLieDetector();
    return;
  }

  const lieTargetButton = event.target.closest(
    "[data-lie-target]"
  );

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

function submitVote() {
  const suspect = state.voting.suspect;
  const voters = state.voting.voters;
  const initiator = state.voting.initiator;

  const voteStatus = $("#vote-status");

  if (!suspect) {
    playFailure();

    if (voteStatus) {
      // BUG 3 (0.3.2): явный класс ошибки.
      voteStatus.className =
        "judging-status judging-status--error";
      voteStatus.textContent =
        "Сначала выберите подозреваемого.";
    }

    return;
  }

  // BUG 7 (0.3.1): обязательное явное указание инициатора.
  if (!initiator) {
    playFailure();

    if (voteStatus) {
      voteStatus.className =
        "judging-status judging-status--error";
      voteStatus.textContent =
        "Выберите инициатора голосования.";
    }

    return;
  }

  const requiredVotes =
    Math.floor(state.assignments.length / 2) + 1;

  if (voters.size < requiredVotes) {
    playFailure();

    if (voteStatus) {
      voteStatus.className =
        "judging-status judging-status--error";
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
    const active =
      state.activeGadgets[suspect] || {};

    if (active.fakeId) {
      active.fakeId = false;

      playFailure();
      showToast(
        "Фальшивое удостоверение спасло подозреваемого"
      );

      // BUG 5 + BUG 6 (0.3.1): полный сброс через хелпер.
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
      voteStatus.textContent =
        "Шпион вычислен. Мирные побеждают!";
    }

    finishByVoting(suspect);
  } else {
    playFailure();
    showToast(
      "Неверный выбор: голосование сброшено"
    );

    resetVotingState();

    if (voteStatus) {
      // Это тоже ошибка выбора — подсвечиваем красным.
      voteStatus.className =
        "judging-status judging-status--error";
      voteStatus.textContent =
        "Это мирный игрок. Голосование сброшено.";
    }
  }
}

/* =========================================================
   ТАЙМЕР
========================================================= */

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(remainingSeconds).padStart(2, "0")
  };
}

function renderTimer() {
  const formatted = formatTime(
    state.timerRemainingSeconds
  );

  elements.timerMinutes.textContent = formatted.minutes;
  elements.timerSeconds.textContent = formatted.seconds;

  const progress =
    state.timerTotalSeconds > 0
      ? (state.timerRemainingSeconds /
          state.timerTotalSeconds) *
        100
      : 0;

  elements.timerProgressBar.style.width =
    `${Math.max(0, progress)}%`;

  elements.gameTimer.classList.toggle(
    "is-warning",
    state.timerRemainingSeconds <= 60 &&
      state.timerRemainingSeconds > 20
  );

  elements.gameTimer.classList.toggle(
    "is-danger",
    state.timerRemainingSeconds <= 20
  );

  elements.timerProgressBar.style.background =
    state.timerRemainingSeconds <= 20
      ? "var(--color-danger)"
      : state.timerRemainingSeconds <= 60
      ? "var(--color-orange)"
      : "var(--color-primary)";
}

function setEndGameButtonToDefault() {
  elements.endGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">■</span>
    Завершить игру
  `;
}

function setEndGameButtonToMenu() {
  elements.endGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">⌂</span>
    В главное меню
  `;
}

function startGameTimer() {
  stopGameTimer();

  const baseSeconds = state.durationMinutes * 60;

  const modifiedSeconds = Math.max(
    60,
    baseSeconds + state.timerModifierSeconds
  );

  state.timerTotalSeconds = modifiedSeconds;
  state.timerRemainingSeconds = modifiedSeconds;

  state.timerPaused = false;
  state.gameEnded = false;
  state.gameOutcome = null;
  state.lastTickSecond = null;
  state.revealRunId += 1;

  elements.gameResult.classList.add("is-hidden");
  setEndGameButtonToDefault();

  elements.pauseGame.disabled = false;

  const timerWrapper = elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "";
  }

  elements.pauseGame.innerHTML = `
    <span class="button__icon" aria-hidden="true">Ⅱ</span>
    Пауза
  `;

  elements.gameStatus.innerHTML = `
    <span class="status-dot status-dot--active"></span>
    LIVE
  `;

  renderTimer();
  createJudgingInterface();
  renderJudgingInterface();

  state.timerInterval = window.setInterval(() => {
    if (state.timerPaused || state.gameEnded) {
      return;
    }

    state.timerRemainingSeconds -= 1;

    if (
      state.timerRemainingSeconds <= 20 &&
      state.timerRemainingSeconds > 0
    ) {
      if (
        state.lastTickSecond !==
        state.timerRemainingSeconds
      ) {
        playTimerTick();
        state.lastTickSecond =
          state.timerRemainingSeconds;
      }
    }

    renderTimer();

    if (state.timerRemainingSeconds <= 0) {
      finishTimer();
    }
  }, 1000);
}

function stopGameTimer() {
  if (state.timerInterval !== null) {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function togglePauseTimer() {
  if (
    state.timerRemainingSeconds <= 0 ||
    state.gameEnded
  ) {
    return;
  }

  state.timerPaused = !state.timerPaused;

  if (state.timerPaused) {
    elements.pauseGame.innerHTML = `
      <span class="button__icon" aria-hidden="true">▶</span>
      Продолжить
    `;

    elements.gameStatus.innerHTML = `
      <span class="status-dot"></span>
      PAUSED
    `;
  } else {
    elements.pauseGame.innerHTML = `
      <span class="button__icon" aria-hidden="true">Ⅱ</span>
      Пауза
    `;

    elements.gameStatus.innerHTML = `
      <span class="status-dot status-dot--active"></span>
      LIVE
    `;
  }
}

/* =========================================================
   ЗАВЕРШЕНИЕ ИГРЫ И НАЧИСЛЕНИЯ
========================================================= */

function getSpies() {
  return state.assignments.filter(
    (assignment) => assignment.roleType === "spy"
  );
}

function awardTimerVictory() {
  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, 120);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, 100);
    } else {
      applyRoundReward(assignment.player, -30);
    }
  });

  renderPlayers();
}

function awardVotingVictory(suspect) {
  const initiator = state.voting.initiator;

  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "civilian") {
      const base =
        assignment.player === initiator ? 100 : 70;

      applyRoundReward(assignment.player, base);
    } else if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, -150);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, -100);
    }
  });

  // Событие «Охота за головами»: кража идёт НАПРЯМУЮ через changeBalance
  // (по ТЗ — «украдёт напрямую из баланса шпиона»), поэтому кризис
  // её не удваивает. Это осознанное поведение.
  if (
    state.activeEvent === "hunt" &&
    initiator &&
    suspect
  ) {
    changeBalance(suspect, -HUNT_STEAL);
    changeBalance(initiator, HUNT_STEAL);

    showToast(
      `Охота за головами: ${initiator} украл ${HUNT_STEAL} 🪙 у ${suspect}`
    );
  }

  renderPlayers();
}

function awardSpyLocationVictory() {
  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, 200);
    } else if (assignment.roleType === "accomplice") {
      applyRoundReward(assignment.player, 150);
    } else {
      applyRoundReward(assignment.player, -50);
    }
  });

  renderPlayers();
}

function awardSpyLocationFailure() {
  state.assignments.forEach((assignment) => {
    if (assignment.roleType === "spy") {
      applyRoundReward(assignment.player, -200);
    } else if (assignment.roleType === "civilian") {
      applyRoundReward(assignment.player, 80);
    }
  });

  renderPlayers();
}

function hideTimerInterface() {
  const timerWrapper = elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "none";
  }

  elements.pauseGame.disabled = true;
  setEndGameButtonToMenu();
}

function finishTimer() {
  if (state.gameEnded) return;

  state.gameEnded = true;
  state.gameOutcome = "timeout";
  state.timerRemainingSeconds = 0;
  state.timerPaused = true;

  renderTimer();
  stopGameTimer();

  awardTimerVictory();
  playAlarm();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    ENDED
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("timeout");
}

function finishByVoting(suspect) {
  if (state.gameEnded) return;

  state.gameEnded = true;
  state.gameOutcome = "voting";
  state.timerPaused = true;

  stopGameTimer();
  awardVotingVictory(suspect);
  playSuccess();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    CIVILIANS WIN
  `;

  hideTimerInterface();
  revealAllRolesAtEnd("voting");
}

function finishBySpyLocation(spy, guessedLocation) {
  if (state.gameEnded) return;

  state.gameEnded = true;
  state.timerPaused = true;

  stopGameTimer();

  const realLocation = state.selectedLocation.name;
  const isCorrect = guessedLocation === realLocation;

  state.gameOutcome = isCorrect
    ? "spy-location-success"
    : "spy-location-failure";

  if (isCorrect) {
    awardSpyLocationVictory();
    playSuccess();

    elements.gameStatus.innerHTML = `
      <span class="status-dot"></span>
      SPY WINS
    `;
  } else {
    awardSpyLocationFailure();
    playFailure();

    elements.gameStatus.innerHTML = `
      <span class="status-dot"></span>
      CIVILIANS WIN
    `;
  }

  hideTimerInterface();
  revealAllRolesAtEnd(state.gameOutcome);

  void spy;
}

function getResultText(outcome) {
  if (outcome === "voting") {
    return {
      title: "МИРНЫЕ ПОБЕДИЛИ",
      description:
        "Шпион был вычислен большинством голосов."
    };
  }

  if (outcome === "spy-location-success") {
    return {
      title: "ШПИОН ПОБЕДИЛ",
      description:
        "Шпион правильно перехватил локацию."
    };
  }

  if (outcome === "spy-location-failure") {
    return {
      title: "МИРНЫЕ ПОБЕДИЛИ",
      description:
        "Шпион ошибся при перехвате локации."
    };
  }

  return {
    title: "ВРЕМЯ ИСТЕКЛО",
    description:
      "Шпиону удалось пережить всю операцию."
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

  if (state.spiesSetting === "all") {
    resultTitle.textContent = "🚨 РЕЖИМ «ПАРАНОЙЯ»";
    resultDesc.textContent =
      "Абсолютный хаос! В этой операции не было мирных жителей.";
  } else {
    resultTitle.textContent = resultText.title;
    resultDesc.textContent = resultText.description;
  }

  let rolesListContainer = $("#end-roles-list");

  if (!rolesListContainer) {
    rolesListContainer = document.createElement("div");
    rolesListContainer.id = "end-roles-list";
    rolesListContainer.className = "end-roles-list";

    elements.gameResult.appendChild(rolesListContainer);
  }

  rolesListContainer.innerHTML = "";

  for (
    let index = 0;
    index < state.assignments.length;
    index += 1
  ) {
    await sleep(350);

    if (currentRevealRunId !== state.revealRunId) {
      return;
    }

    const assignment = state.assignments[index];

    const card = document.createElement("div");

    card.className = "end-role-badge";

    // BUG 4 (0.3.2): прокидываем индекс в CSS-переменную,
    // чтобы заработал каскадный animation-delay.
    card.style.setProperty("--badge-index", String(index));

    if (assignment.roleType === "spy") {
      card.classList.add("end-role-badge--spy");

      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ☠ ШПИОН
        </span>
      `;
    } else if (assignment.roleType === "accomplice") {
      card.classList.add("end-role-badge--accomplice");

      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ◉ СООБЩНИК
          (${escapeHtml(assignment.location)})
        </span>
      `;
    } else {
      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ◈ ${escapeHtml(assignment.role)}
          (${escapeHtml(assignment.location)})
        </span>
      `;
    }

    rolesListContainer.appendChild(card);
  }
}

/* =========================================================
   ПЕРЕХВАТ ЛОКАЦИИ ШПИОНОМ
========================================================= */

// BUG 10 (0.3.1): вместо window.confirm — нативный <dialog>.
// BUG 1 (0.3.2): класс сообщения приведён в соответствие с CSS
// (.confirm-intercept-modal__description вместо ...__message).
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

    const confirmBtn = event.target.closest(
      "[data-confirm-intercept]"
    );

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

  // В режиме «Паранойя» (spiesSetting === "all") шпионов много,
  // но перехват — одноразовое действие. Вызываем finishBySpyLocation
  // ровно один раз, а не N раз в цикле.
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

  // BUG 1 (0.3.2): используем класс __description, совпадающий с CSS.
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

/* =========================================================
   СБРОС ИГРЫ
========================================================= */

function resetGame() {
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
  state.activeGadgets = {};

  state.pendingEvent = null;
  state.activeEvent = null;
  state.bonusRadar = null;

  state.voting.suspect = null;
  state.voting.initiator = null;
  state.voting.voters = new Set();

  state.lieDetector.selectedUser = null;
  state.lieDetector.usedUsers = new Set();
  state.lieDetector.output = "";

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

  closeDialog(elements.confirmEndModal);
  showScreen("settings");
  renderPlayers();

  showToast("Операция завершена");
}

/* =========================================================
   ОБРАБОТЧИКИ ИГРОКОВ
========================================================= */

function setupPlayerHandlers() {
  elements.playerForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      addPlayer(elements.playerName.value);
    }
  );

  elements.playersList.addEventListener(
    "click",
    (event) => {
      const removeButton = event.target.closest(
        "[data-remove-player]"
      );

      if (removeButton) {
        removePlayer(
          Number(removeButton.dataset.removePlayer)
        );

        return;
      }

      const shopButton = event.target.closest(
        "[data-open-shop]"
      );

      if (shopButton) {
        openPlayerShop(shopButton.dataset.openShop);
      }
    }
  );
}

/* =========================================================
   ОБРАБОТЧИКИ НАСТРОЕК
========================================================= */

function setupSettingsHandlers() {
  elements.duration.addEventListener(
    "change",
    () => {
      state.durationMinutes = Number(
        elements.duration.value
      );

      saveSettings();
    }
  );

  elements.roleModeInputs.forEach((input) => {
    input.addEventListener(
      "change",
      () => {
        state.roleMode = input.value;
        saveSettings();
      }
    );
  });

  elements.spiesCount.addEventListener(
    "change",
    () => {
      state.spiesSetting = elements.spiesCount.value;
      saveSettings();
    }
  );

  elements.locationTabs.forEach((tab) => {
    tab.addEventListener(
      "click",
      () => {
        const pack = tab.dataset.pack;

        state.selectedPack = pack;

        elements.locationTabs.forEach((item) => {
          const isActive = item === tab;

          item.classList.toggle("is-active", isActive);

          item.setAttribute(
            "aria-selected",
            String(isActive)
          );
        });

        elements.defaultLocations.classList.toggle(
          "is-hidden",
          pack !== "default"
        );

        elements.customLocations.classList.toggle(
          "is-hidden",
          pack !== "custom"
        );

        const locations = getCurrentLocations();

        if (
          state.selectedLocation &&
          !locations.some(
            (location) =>
              location.name ===
              state.selectedLocation.name
          )
        ) {
          state.selectedLocation = null;

          elements.locationHint.textContent =
            "Выберите одну локацию для текущей операции.";
        }

        renderDefaultLocations();
        renderCustomLocations();
      }
    );
  });

  elements.defaultLocations.addEventListener(
    "click",
    (event) => {
      const card = event.target.closest(
        "[data-location-index]"
      );

      if (!card) return;

      state.selectedPack = "default";

      selectLocation(
        Number(card.dataset.locationIndex)
      );
    }
  );

  elements.customLocations.addEventListener(
    "click",
    (event) => {
      const card = event.target.closest(
        "[data-location-index]"
      );

      if (!card) return;

      state.selectedPack = "custom";

      selectLocation(
        Number(card.dataset.locationIndex)
      );
    }
  );

  elements.startMission.addEventListener(
    "pointerdown",
    (event) => {
      state.lastPointer = {
        x: Math.round(event.clientX || 0),
        y: Math.round(event.clientY || 0)
      };
    }
  );

  elements.startMission.addEventListener(
    "click",
    startMission
  );
}

// BUG 11 (0.3.1): глобальное отслеживание указателя с throttle 50 мс,
// чтобы энтропия координат не «застывала» между раундами.
function setupPointerEntropyTracking() {
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
   ЗАПУСК ОПЕРАЦИИ
========================================================= */

async function startMission() {
  elements.settingsValidation.textContent = "";

  readSettingsFromForm();

  if (state.players.length < 3) {
    elements.settingsValidation.textContent =
      "Добавьте минимум 3 участника.";

    playFailure();
    return;
  }

  if (!state.selectedLocation) {
    elements.settingsValidation.textContent =
      "Выберите локацию для операции.";

    playFailure();
    return;
  }

  if (
    state.roleMode === "accomplice" &&
    state.players.length < 4
  ) {
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

    prepareDealingScreen();
    showScreen("dealing");
  } finally {
    elements.startMission.disabled = false;
  }
}

/* =========================================================
   ОБРАБОТЧИКИ РАЗДАЧИ
========================================================= */

function setupDealingHandlers() {
  elements.revealRole.addEventListener(
    "click",
    () => {
      getAudioContext();
      revealCurrentRole();
    }
  );

  elements.hideRole.addEventListener(
    "click",
    hideCurrentRole
  );

  elements.startTimer.addEventListener(
    "click",
    () => {
      getAudioContext();
      showScreen("game");
      startGameTimer();
    }
  );
}

/* =========================================================
   ОБРАБОТЧИКИ ТАЙМЕРА
========================================================= */

function setupTimerHandlers() {
  elements.pauseGame.addEventListener(
    "click",
    togglePauseTimer
  );

  elements.endGame.addEventListener(
    "click",
    () => {
      if (state.gameEnded) {
        resetGame();
        return;
      }

      openDialog(elements.confirmEndModal);
    }
  );

  elements.closeConfirmEnd.addEventListener(
    "click",
    () => {
      closeDialog(elements.confirmEndModal);
    }
  );

  elements.cancelEndGame.addEventListener(
    "click",
    () => {
      closeDialog(elements.confirmEndModal);
    }
  );

  elements.confirmEndGame.addEventListener(
    "click",
    () => {
      closeDialog(elements.confirmEndModal);
      finishTimer();
    }
  );

  elements.confirmEndModal.addEventListener(
    "click",
    (event) => {
      if (event.target === elements.confirmEndModal) {
        closeDialog(elements.confirmEndModal);
      }
    }
  );
}

/* =========================================================
   КАСТОМНЫЕ ПАКИ
========================================================= */

function setupCustomPackHandlers() {
  elements.openCustomPacks.addEventListener(
    "click",
    () => {
      renderCustomLocations();
      openDialog(elements.customPacksModal);
    }
  );

  elements.closeCustomPacks.addEventListener(
    "click",
    () => {
      closeDialog(elements.customPacksModal);
    }
  );

  elements.customPacksModal.addEventListener(
    "click",
    (event) => {
      if (
        event.target === elements.customPacksModal
      ) {
        closeDialog(elements.customPacksModal);
      }
    }
  );

  elements.customLocationForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      elements.customLocationValidation.textContent = "";

      const name =
        elements.customLocationName.value.trim();

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
            location.name.toLowerCase() ===
            name.toLowerCase()
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
    }
  );

  elements.customPacksList.addEventListener(
    "click",
    (event) => {
      const deleteButton = event.target.closest(
        "[data-delete-location]"
      );

      if (!deleteButton) return;

      const index = Number(
        deleteButton.dataset.deleteLocation
      );

      const deletedLocation =
        state.customLocations[index];

      state.customLocations.splice(index, 1);

      saveCustomLocations();
      renderCustomLocations();

      if (
        state.selectedLocation &&
        deletedLocation &&
        state.selectedLocation.name ===
          deletedLocation.name
      ) {
        state.selectedLocation = null;

        elements.locationHint.textContent =
          "Выберите одну локацию для текущей операции.";
      }

      showToast("Локация удалена");
    }
  );
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
========================================================= */

function init() {
  loadPlayers();
  loadCustomLocations();
  loadSettings();

  renderDefaultLocations();
  renderCustomLocations();

  setupPlayerHandlers();
  setupSettingsHandlers();
  setupDealingHandlers();
  setupTimerHandlers();
  setupCustomPackHandlers();
  setupPointerEntropyTracking();

  showScreen("settings");
}

document.addEventListener("DOMContentLoaded", init);
