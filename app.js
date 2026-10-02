/* =========================================================
   ШПИОН — app.js
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
  settings: "spyfall_settings"
};

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
  roleVisible: false,

  timerTotalSeconds: 0,
  timerRemainingSeconds: 0,
  timerInterval: null,
  timerPaused: false,
  gameEnded: false,

  lastPointer: {
    x: 0,
    y: 0
  },

  entropySeed: 0,
  revealRunId: 0
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
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeout);

  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2600);
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
   ИГРОКИ
========================================================= */

function loadPlayers() {
  const savedPlayers = readFromStorage(STORAGE_KEYS.players, []);

  state.players = Array.isArray(savedPlayers)
    ? savedPlayers
        .filter((player) => typeof player === "string")
        .map((player) => player.trim())
        .filter(Boolean)
    : [];

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

  savePlayers();
  renderPlayers();

  elements.playerName.value = "";
  elements.playerName.focus();
}

function removePlayer(index) {
  state.players.splice(index, 1);
  savePlayers();
  renderPlayers();
}

function renderPlayers() {
  elements.playersList.innerHTML = "";
  elements.playersCount.textContent = String(state.players.length);
  elements.playersEmpty.hidden = state.players.length > 0;

  state.players.forEach((player, index) => {
    const item = document.createElement("div");

    item.className = "player-item";

    item.innerHTML = `
      <div class="player-item__identity">
        <span class="player-item__number">${index + 1}</span>
        <span class="player-item__name">${escapeHtml(player)}</span>
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

  updateSpiesVisibility();
}

function saveSettings() {
  saveToStorage(STORAGE_KEYS.settings, {
    durationMinutes: state.durationMinutes,
    roleMode: state.roleMode,
    spiesSetting: state.spiesSetting
  });
}

function updateSpiesVisibility() {
  elements.spiesSettings.hidden = false;
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
   ЭНТРОПИЯ И ПСЕВДОСЛУЧАЙНЫЙ ГЕНЕРАТОР
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
   АУДИТ ЭНТРОПИИ
========================================================= */

function addAuditLine(text, type = "") {
  const line = document.createElement("div");

  line.className = "audit-log__line";

  if (type) {
    line.classList.add(`audit-log__line--${type}`);
  }

  line.textContent = text;
  elements.auditLog.appendChild(line);
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

  addAuditLine(`Поток RAM: ${entropy.memory}MB...`);

  await sleep(300);

  addAuditLine("Смешивание хаотичных параметров...");

  await sleep(300);

  addAuditLine(
    "АНАЛИЗ ХАОСА ЗАВЕРШЕН. РОЛИ РАСПРЕДЕЛЕНЫ",
    "success"
  );

  await sleep(500);

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

  if (setting === "random") {
    return (
      1 + Math.floor(random() * maximumAllowed)
    );
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
   ЭКРАН РАЗДАЧИ
========================================================= */

function prepareDealingScreen() {
  state.currentPlayerIndex = 0;
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
    elements.roleCardLabel.textContent =
      "ОПАСНОСТЬ // СЕКРЕТНО";

    elements.roleCardIcon.textContent = "☠";
    elements.roleCardTitle.textContent = "Вы ШПИОН";
    elements.roleCardLocation.textContent =
      "Локация скрыта";

    elements.roleCardDescription.textContent =
      "Вычислите локацию по вопросам других игроков. Не выдайте себя.";
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
    elements.roleCardLabel.textContent =
      "СЕКРЕТНАЯ ИНФОРМАЦИЯ";

    elements.roleCardIcon.textContent = "◈";
    elements.roleCardTitle.textContent =
      assignment.role;

    elements.roleCardLocation.textContent =
      `Локация: ${assignment.location}`;

    elements.roleCardDescription.textContent =
      "Задавайте осторожные вопросы и попытайтесь вычислить шпиона.";
  }
}

function hideCurrentRole() {
  const isLastPlayer =
    state.currentPlayerIndex >=
    state.assignments.length - 1;

  state.roleVisible = false;

  elements.roleCard.classList.add("is-hidden");

  if (isLastPlayer) {
    elements.revealRole.classList.add("is-hidden");
    elements.startTimer.classList.remove("is-hidden");

    elements.dealingProgressText.textContent =
      "Все карты выданы. Можно начинать допрос.";
  } else {
    state.currentPlayerIndex += 1;
  }

  renderCurrentPlayer();
  updateDealingProgress();
}

function updateDealingProgress() {
  const revealedCount = state.currentPlayerIndex;
  const total = state.assignments.length;

  const percentage = total
    ? (revealedCount / total) * 100
    : 0;

  elements.dealingProgressBar.style.width =
    `${percentage}%`;

  if (revealedCount === 0) {
    elements.dealingProgressText.textContent =
      "Карты ещё не открывались";
  } else {
    elements.dealingProgressText.textContent =
      `Подготовлено карт: ${revealedCount} из ${total}`;
  }
}

/* =========================================================
   ТАЙМЕР
========================================================= */

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(remainingSeconds).padStart(2, "0")
  };
}

function renderTimer() {
  const formatted = formatTime(
    state.timerRemainingSeconds
  );

  elements.timerMinutes.textContent =
    formatted.minutes;

  elements.timerSeconds.textContent =
    formatted.seconds;

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

  state.timerTotalSeconds =
    state.durationMinutes * 60;

  state.timerRemainingSeconds =
    state.timerTotalSeconds;

  state.timerPaused = false;
  state.gameEnded = false;

  state.revealRunId += 1;

  elements.gameResult.classList.add("is-hidden");

  setEndGameButtonToDefault();

  elements.pauseGame.disabled = false;

  const timerWrapper =
    elements.gameTimer.parentElement;

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

  state.timerInterval = window.setInterval(() => {
    if (state.timerPaused || state.gameEnded) {
      return;
    }

    state.timerRemainingSeconds -= 1;

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
   ЗАВЕРШЕНИЕ ИГРЫ И РАСКРЫТИЕ РОЛЕЙ
========================================================= */

function finishTimer() {
  if (state.gameEnded) {
    return;
  }

  state.gameEnded = true;
  state.timerRemainingSeconds = 0;
  state.timerPaused = true;

  renderTimer();
  stopGameTimer();

  elements.gameStatus.innerHTML = `
    <span class="status-dot"></span>
    ENDED
  `;

  elements.pauseGame.disabled = true;

  setEndGameButtonToMenu();

  const timerWrapper =
    elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "none";
  }

  revealAllRolesAtEnd();
}

async function revealAllRolesAtEnd() {
  const currentRevealRunId = ++state.revealRunId;

  elements.gameResult.classList.remove("is-hidden");

  const resultTitle =
    elements.gameResult.querySelector(
      ".game-result__title"
    );

  const resultDesc =
    elements.gameResult.querySelector(
      ".game-result__description"
    );

  let rolesListContainer = $("#end-roles-list");

  if (!rolesListContainer) {
    rolesListContainer = document.createElement("div");
    rolesListContainer.id = "end-roles-list";
    rolesListContainer.className = "end-roles-list";

    elements.gameResult.appendChild(
      rolesListContainer
    );
  }

  rolesListContainer.innerHTML = "";

  if (state.spiesSetting === "all") {
    resultTitle.textContent =
      "🚨 РЕЖИМ «ПАРАНОЙЯ»";

    resultDesc.textContent =
      "Абсолютный хаос! В этой операции не было мирных жителей.";
  } else {
    resultTitle.textContent =
      "⏱ ВРЕМЯ ИСТЕКЛО!";

    resultDesc.textContent =
      "Операция завершена. Раскрытие засекреченных досье агентов:";
  }

  for (
    let index = 0;
    index < state.assignments.length;
    index += 1
  ) {
    await sleep(500);

    if (currentRevealRunId !== state.revealRunId) {
      return;
    }

    const assignment = state.assignments[index];
    const card = document.createElement("div");

    card.className = "end-role-badge";

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
    } else if (
      assignment.roleType === "accomplice"
    ) {
      card.classList.add(
        "end-role-badge--accomplice"
      );

      card.innerHTML = `
        <span class="end-role-badge__name">
          ${escapeHtml(assignment.player)}
        </span>

        <span class="end-role-badge__role">
          ◉ СООБЩНИК (${escapeHtml(assignment.location)})
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

function resetGame() {
  state.revealRunId += 1;

  stopGameTimer();

  state.assignments = [];
  state.currentPlayerIndex = 0;
  state.roleVisible = false;
  state.timerPaused = false;
  state.timerRemainingSeconds = 0;
  state.timerTotalSeconds = 0;
  state.gameEnded = false;

  elements.pauseGame.disabled = false;
  elements.gameResult.classList.add("is-hidden");

  setEndGameButtonToDefault();

  const timerWrapper =
    elements.gameTimer.parentElement;

  if (timerWrapper) {
    timerWrapper.style.display = "";
  }

  const rolesListContainer = $("#end-roles-list");

  if (rolesListContainer) {
    rolesListContainer.remove();
  }

  closeDialog(elements.confirmEndModal);

  showScreen("settings");
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

      if (!removeButton) return;

      removePlayer(
        Number(removeButton.dataset.removePlayer)
      );
    }
  );
}

/* =========================================================
   ОБРАБОТЧИКИ НАСТРОЕК
========================================================= */

function setupSettingsHandlers() {
  elements.duration.addEventListener("change", () => {
    state.durationMinutes = Number(
      elements.duration.value
    );

    saveSettings();
  });

  elements.roleModeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.roleMode = input.value;
      saveSettings();
    });
  });

  elements.spiesCount.addEventListener("change", () => {
    state.spiesSetting = elements.spiesCount.value;
    saveSettings();
  });

  elements.locationTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const pack = tab.dataset.pack;

      state.selectedPack = pack;

      elements.locationTabs.forEach((item) => {
        const isActive = item === tab;

        item.classList.toggle(
          "is-active",
          isActive
        );

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
    });
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

async function startMission() {
  elements.settingsValidation.textContent = "";

  readSettingsFromForm();

  if (state.players.length < 3) {
    elements.settingsValidation.textContent =
      "Добавьте минимум 3 участника.";

    return;
  }

  if (!state.selectedLocation) {
    elements.settingsValidation.textContent =
      "Выберите локацию для операции.";

    return;
  }

  if (
    state.roleMode === "accomplice" &&
    state.players.length < 4
  ) {
    elements.settingsValidation.textContent =
      "Для режима «Сообщник» необходимо минимум 4 игрока.";

    return;
  }

  elements.startMission.disabled = true;

  showScreen("audit");

  try {
    const entropy = await runEntropyAudit();

    state.entropySeed = entropy.seed;
    state.assignments = createAssignments(entropy);

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
    revealCurrentRole
  );

  elements.hideRole.addEventListener(
    "click",
    hideCurrentRole
  );

  elements.startTimer.addEventListener(
    "click",
    () => {
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
      /*
       Если игра уже завершена, повторное нажатие
       сразу возвращает пользователя в меню.
      */
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
      if (
        event.target === elements.confirmEndModal
      ) {
        closeDialog(elements.confirmEndModal);
      }
    }
  );
}

/* =========================================================
   КАСТОМНЫЕ ПАКИ — ОБРАБОТЧИКИ
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

      elements.customLocationValidation.textContent =
        "";

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

  showScreen("settings");
}

document.addEventListener("DOMContentLoaded", init);
