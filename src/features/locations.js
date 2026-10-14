/* =========================================================
   features/locations.js
   PATCH 0.6.4 — редактирование, импорт JSON, undo/redo версии
========================================================= */
// @ts-nocheck
"use strict";

import { state, STORAGE_KEYS, MIN_LOCATIONS } from "../core/state.js";
import { elements } from "../core/dom.js";
import { readFromStorage, saveToStorage } from "../core/storage.js";
import { escapeHtml, downloadJsonFile } from "../core/utils.js";
import { DEFAULT_LOCATIONS } from "../constants/locations.js";

const MAX_HISTORY = 10;

function generateLocationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "loc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

function normalizeSnapshot(raw) {
  return {
    name: typeof raw?.name === "string" ? raw.name.trim() : "",
    roles: Array.isArray(raw?.roles)
      ? raw.roles.map((r) => String(r).trim()).filter(Boolean)
      : [],
    savedAt: Number(raw?.savedAt) || Date.now()
  };
}

function normalizeCustomLocation(raw) {
  const history = Array.isArray(raw?.history)
    ? raw.history
        .filter((e) => e && typeof e === "object")
        .map(normalizeSnapshot)
        .slice(-MAX_HISTORY)
    : [];

  const future = Array.isArray(raw?.future)
    ? raw.future
        .filter((e) => e && typeof e === "object")
        .map(normalizeSnapshot)
        .slice(-MAX_HISTORY)
    : [];

  return {
    id:
      typeof raw?.id === "string" && raw.id
        ? raw.id
        : generateLocationId(),
    name: typeof raw?.name === "string" ? raw.name.trim() : "",
    roles: Array.isArray(raw?.roles)
      ? raw.roles.map((r) => String(r).trim()).filter(Boolean)
      : [],
    history,
    future
  };
}

export function loadCustomLocations() {
  const saved = readFromStorage(STORAGE_KEYS.customLocations, []);

  state.customLocations = Array.isArray(saved)
    ? saved
        .filter(
          (l) =>
            l &&
            typeof l.name === "string" &&
            Array.isArray(l.roles) &&
            l.roles.length >= 5
        )
        .map(normalizeCustomLocation)
    : [];

  renderCustomLocations();
}

export function saveCustomLocations() {
  saveToStorage(STORAGE_KEYS.customLocations, state.customLocations);
}

export function getCurrentLocations() {
  return state.selectedPack === "custom"
    ? state.customLocations
    : DEFAULT_LOCATIONS;
}

export function renderDefaultLocations() {
  renderLocationCards(elements.defaultLocations, DEFAULT_LOCATIONS);
}

export function renderCustomLocations() {
  renderLocationCards(elements.customLocations, state.customLocations);

  if (elements.customPacksList) {
    elements.customPacksList.innerHTML = "";

    state.customLocations.forEach((loc, index) => {
      const item = document.createElement("div");
      item.className = "custom-pack-item";

      const canUndo = loc.history.length > 0;
      const canRedo = loc.future.length > 0;
      const totalVersions = loc.history.length + loc.future.length;

      item.innerHTML =
        '<div class="custom-pack-item__info">' +
          '<div class="custom-pack-item__name">' +
            escapeHtml(loc.name) +
          '</div>' +
          '<div class="custom-pack-item__roles">' +
            loc.roles.length + ' ролей' +
            (totalVersions ? ' · версий: ' + totalVersions : '') +
          '</div>' +
        '</div>' +
        '<div class="custom-pack-item__actions">' +
          '<button type="button" class="custom-pack-item__undo"' +
            ' title="' + (canUndo ? 'Предыдущая версия' : 'Нет предыдущих версий') + '"' +
            ' aria-label="Предыдущая версия ' + escapeHtml(loc.name) + '"' +
            ' data-undo-location="' + index + '"' +
            (canUndo ? '' : ' disabled') + '>↶</button>' +
          '<button type="button" class="custom-pack-item__redo"' +
            ' title="' + (canRedo ? 'Следующая версия' : 'Нет следующих версий') + '"' +
            ' aria-label="Следующая версия ' + escapeHtml(loc.name) + '"' +
            ' data-redo-location="' + index + '"' +
            (canRedo ? '' : ' disabled') + '>↷</button>' +
          '<button type="button" class="custom-pack-item__edit"' +
            ' title="Редактировать"' +
            ' aria-label="Редактировать ' + escapeHtml(loc.name) + '"' +
            ' data-edit-location="' + index + '">✎</button>' +
          '<button type="button" class="custom-pack-item__delete"' +
            ' title="Удалить"' +
            ' aria-label="Удалить ' + escapeHtml(loc.name) + '"' +
            ' data-delete-location="' + index + '">×</button>' +
        '</div>';

      elements.customPacksList.appendChild(item);
    });
  }

  if (elements.customLocationsCount) {
    elements.customLocationsCount.textContent = String(
      state.customLocations.length
    );
  }

  if (elements.customPacksEmpty) {
    elements.customPacksEmpty.hidden = state.customLocations.length > 0;
  }
}

function renderLocationCards(container, locations) {
  if (!container) return;
  container.innerHTML = "";

  if (!locations.length) {
    container.innerHTML =
      '<div class="empty-state empty-state--compact">' +
        '<p>В этом паке пока нет локаций.</p>' +
      '</div>';
    return;
  }

  locations.forEach((loc, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "location-card";
    card.dataset.locationIndex = String(index);

    const isSelected = state.selectedLocations.some(
      (i) => i.name === loc.name
    );

    card.classList.toggle("is-selected", Boolean(isSelected));

    card.innerHTML =
      '<div class="location-card__icon">◈</div>' +
      '<div class="location-card__name">' +
        escapeHtml(loc.name) +
      '</div>' +
      '<div class="location-card__roles">' +
        loc.roles.slice(0, 3).map(escapeHtml).join(" · ") +
        (loc.roles.length > 3 ? " …" : "") +
      '</div>' +
      '<span class="location-card__check">✓</span>';

    container.appendChild(card);
  });
}

export function updateLocationHint() {
  if (!elements.locationHint) return;

  const count = state.selectedLocations.length;

  if (count < MIN_LOCATIONS) {
    elements.locationHint.textContent =
      "Выбрано локаций: " + count +
      ". Нужно минимум " + MIN_LOCATIONS +
      ": чем больше пул, тем сложнее перехват.";
  } else {
    elements.locationHint.textContent =
      "Выбрано локаций: " + count +
      ". Игра случайно выберет одну из них.";
  }
}

export function toggleLocation(index) {
  const locations = getCurrentLocations();
  const loc = locations[index];
  if (!loc) return;

  const existingIndex = state.selectedLocations.findIndex(
    (i) => i.name === loc.name
  );

  if (existingIndex >= 0) {
    state.selectedLocations.splice(existingIndex, 1);
  } else {
    state.selectedLocations.push(loc);
  }

  saveSelectedLocations();
  updateLocationHint();
  renderDefaultLocations();
  renderCustomLocations();
}

/* ---------- Выбрать / снять все локации текущего пака ---------- */
function getPackLocations(pack) {
  return pack === "custom" ? state.customLocations : DEFAULT_LOCATIONS;
}

/* Выбрать / снять все локации ОДНОГО пака ("default" или "custom").
   Выбор в другом паке не затрагивается. */
export function selectAllInPack(pack) {
  getPackLocations(pack).forEach((loc) => {
    const exists = state.selectedLocations.some(
      (item) => item.name === loc.name
    );

    if (!exists) {
      state.selectedLocations.push({
        name: loc.name,
        roles: [...loc.roles]
      });
    }
  });

  refreshLocationSelection();
}

export function clearAllInPack(pack) {
  const names = new Set(getPackLocations(pack).map((loc) => loc.name));

  state.selectedLocations = state.selectedLocations.filter(
    (item) => !names.has(item.name)
  );

  refreshLocationSelection();
}

function refreshLocationSelection() {
  saveSelectedLocations();
  updateLocationHint();
  renderDefaultLocations();
  renderCustomLocations();
}

export function saveSelectedLocations() {
  const minimal = state.selectedLocations.map((l) => ({
    name: l.name,
    roles: Array.isArray(l.roles) ? l.roles : []
  }));

  saveToStorage(STORAGE_KEYS.selectedLocations, minimal);
}

export function loadSelectedLocations() {
  // Первый запуск (ключа ещё нет): выбираем весь стандартный пак,
  // чтобы игру можно было начать сразу.
  let firstRun = false;

  try {
    firstRun = localStorage.getItem(STORAGE_KEYS.selectedLocations) === null;
  } catch (error) {
    firstRun = false;
  }

  if (firstRun) {
    state.selectedLocations = DEFAULT_LOCATIONS.map((l) => ({
      name: l.name,
      roles: [...l.roles]
    }));

    saveSelectedLocations();
    return;
  }

  const saved = readFromStorage(STORAGE_KEYS.selectedLocations, []);

  if (!Array.isArray(saved)) {
    state.selectedLocations = [];
    return;
  }

  const known = new Set();
  DEFAULT_LOCATIONS.forEach((l) => known.add(l.name));
  state.customLocations.forEach((l) => known.add(l.name));

  state.selectedLocations = saved
    .filter(
      (l) =>
        l &&
        typeof l.name === "string" &&
        known.has(l.name) &&
        Array.isArray(l.roles) &&
        l.roles.length >= 3
    )
    .map((l) => ({ name: l.name, roles: [...l.roles] }));

  state.selectedLocations = state.selectedLocations.map((s) => {
    const d = DEFAULT_LOCATIONS.find((i) => i.name === s.name);
    if (d) return { name: d.name, roles: [...d.roles] };

    const c = state.customLocations.find((i) => i.name === s.name);
    if (c) return { name: c.name, roles: [...c.roles] };

    return s;
  });
}

function snapshotOf(loc) {
  return {
    name: loc.name,
    roles: [...loc.roles],
    savedAt: Date.now()
  };
}

function pushHistory(loc, snapshot) {
  loc.history.push(snapshot);
  if (loc.history.length > MAX_HISTORY) {
    loc.history.splice(0, loc.history.length - MAX_HISTORY);
  }
}

function pushFuture(loc, snapshot) {
  loc.future.push(snapshot);
  if (loc.future.length > MAX_HISTORY) {
    loc.future.splice(0, loc.future.length - MAX_HISTORY);
  }
}

function syncPoolFromLocation(oldName, newName, newRoles) {
  const poolIndex = state.selectedLocations.findIndex(
    (i) => i.name === oldName
  );

  if (poolIndex >= 0) {
    state.selectedLocations[poolIndex] = {
      name: newName,
      roles: [...newRoles]
    };
    saveSelectedLocations();
  }
}

export function startEditLocation(index) {
  const loc = state.customLocations[index];
  if (!loc) return;

  state.editingLocationIndex = index;

  if (elements.customLocationName) {
    elements.customLocationName.value = loc.name;
  }
  if (elements.customLocationRoles) {
    elements.customLocationRoles.value = loc.roles.join("\n");
  }
  if (elements.customLocationValidation) {
    elements.customLocationValidation.textContent = "";
  }
  if (elements.customLocationEditHint) {
    elements.customLocationEditHint.classList.remove("is-hidden");
  }
  if (elements.customLocationEditName) {
    elements.customLocationEditName.textContent = loc.name;
  }
  if (elements.customLocationSubmit) {
    elements.customLocationSubmit.textContent = "Сохранить изменения";
  }
  if (elements.customLocationCancelEdit) {
    elements.customLocationCancelEdit.classList.remove("is-hidden");
  }
  if (elements.customLocationName) {
    elements.customLocationName.focus();
  }
}

export function cancelEditLocation() {
  state.editingLocationIndex = null;

  if (elements.customLocationForm) {
    elements.customLocationForm.reset();
  }
  if (elements.customLocationValidation) {
    elements.customLocationValidation.textContent = "";
  }
  if (elements.customLocationEditHint) {
    elements.customLocationEditHint.classList.add("is-hidden");
  }
  if (elements.customLocationSubmit) {
    elements.customLocationSubmit.textContent = "Добавить локацию";
  }
  if (elements.customLocationCancelEdit) {
    elements.customLocationCancelEdit.classList.add("is-hidden");
  }
}

export function updateCustomLocation(index, { name, roles }) {
  const loc = state.customLocations[index];
  if (!loc) return false;

  const oldName = loc.name;

  pushHistory(loc, snapshotOf(loc));
  loc.future = [];

  loc.name = name;
  loc.roles = [...roles];

  syncPoolFromLocation(oldName, name, roles);

  saveCustomLocations();
  renderCustomLocations();
  updateLocationHint();
  return true;
}

export function undoLocationVersion(index) {
  const loc = state.customLocations[index];
  if (!loc || !loc.history.length) return false;

  const oldName = loc.name;

  pushFuture(loc, snapshotOf(loc));

  const prev = loc.history.pop();
  loc.name = prev.name;
  loc.roles = [...prev.roles];

  syncPoolFromLocation(oldName, prev.name, prev.roles);

  saveCustomLocations();
  renderCustomLocations();
  updateLocationHint();
  return true;
}

export function redoLocationVersion(index) {
  const loc = state.customLocations[index];
  if (!loc || !loc.future.length) return false;

  const oldName = loc.name;

  pushHistory(loc, snapshotOf(loc));

  const next = loc.future.pop();
  loc.name = next.name;
  loc.roles = [...next.roles];

  syncPoolFromLocation(oldName, next.name, next.roles);

  saveCustomLocations();
  renderCustomLocations();
  updateLocationHint();
  return true;
}

export async function importCustomLocationsFromFile(file) {
  if (!file) return { imported: 0, skipped: 0, error: null };

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (e) {
    return { imported: 0, skipped: 0, error: "Не удалось прочитать JSON" };
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && Array.isArray(parsed.locations)
    ? parsed.locations
    : parsed && typeof parsed === "object"
    ? [parsed]
    : [];

  if (!candidates.length) {
    return { imported: 0, skipped: 0, error: "Файл не содержит локаций" };
  }

  let imported = 0;
  let skipped = 0;

  candidates.forEach((raw) => {
    const loc = normalizeCustomLocation(raw);

    if (!loc.name || loc.roles.length < 5) {
      skipped += 1;
      return;
    }

    // Название стандартной локации занято: в пуле раунда имена
    // должны быть уникальными.
    const collidesWithDefault = DEFAULT_LOCATIONS.some(
      (i) => i.name.toLowerCase() === loc.name.toLowerCase()
    );

    if (collidesWithDefault) {
      skipped += 1;
      return;
    }

    const existing = state.customLocations.find(
      (i) => i.name.toLowerCase() === loc.name.toLowerCase()
    );

    if (existing) {
      const oldName = existing.name;

      pushHistory(existing, snapshotOf(existing));
      existing.future = [];
      existing.name = loc.name;
      existing.roles = [...loc.roles];

      syncPoolFromLocation(oldName, loc.name, loc.roles);
    } else {
      state.customLocations.push({
        id: loc.id,
        name: loc.name,
        roles: [...loc.roles],
        history: [],
        future: []
      });
    }

    imported += 1;
  });

  saveCustomLocations();
  renderCustomLocations();
  updateLocationHint();

  return { imported, skipped, error: null };
}

/* =========================================================
   PATCH 0.6.5 — экспорт кастомных локаций в JSON-файл
   и скачивание примера-шаблона
========================================================= */


/* Выгружает ВСЕ текущие кастомные локации в файл */
export function exportCustomLocationsToFile() {
  if (!state.customLocations.length) {
    return {
      ok: false,
      reason: "empty"
    };
  }

  const data = state.customLocations.map((loc) => ({
    name: loc.name,
    roles: [...loc.roles]
  }));

  const timestamp = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  downloadJsonFile(
    "spyfall-locations-" + timestamp + ".json",
    data
  );

  return {
    ok: true,
    count: data.length
  };
}

/* Скачивает готовый пример-шаблон, чтобы человек
   увидел формат и мог сделать свой файл */
export function downloadExampleTemplate() {
  const template = [
    {
      name: "Заброшенный маяк",
      roles: [
        "Смотритель",
        "Радист",
        "Капитан катера",
        "Исследователь",
        "Контрабандист"
      ]
    },
    {
      name: "Ресторан на крыше",
      roles: [
        "Шеф-повар",
        "Официант",
        "Сомелье",
        "Критик",
        "Владелец",
        "Музыкант"
      ]
    }
  ];

  downloadJsonFile("spyfall-template.json", template);

  return { ok: true };
}
