/* =========================================================
   features/locations.js — локации, кастомные паки, пул
========================================================= */
// @ts-nocheck
"use strict";

import { state, STORAGE_KEYS } from "../core/state.js";
import { elements } from "../core/dom.js";
import {
  readFromStorage,
  saveToStorage
} from "../core/storage.js";
import { escapeHtml } from "../core/utils.js";
import { DEFAULT_LOCATIONS } from "../constants/locations.js";

/* ---------- Загрузка кастомных локаций ---------- */
export function loadCustomLocations() {
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

/* ---------- Сохранение кастомных локаций ---------- */
export function saveCustomLocations() {
  saveToStorage(
    STORAGE_KEYS.customLocations,
    state.customLocations
  );
}

/* ---------- Текущий активный пак (по вкладке) ---------- */
export function getCurrentLocations() {
  return state.selectedPack === "custom"
    ? state.customLocations
    : DEFAULT_LOCATIONS;
}

/* ---------- Отрисовка паков ---------- */
export function renderDefaultLocations() {
  renderLocationCards(
    elements.defaultLocations,
    DEFAULT_LOCATIONS
  );
}

export function renderCustomLocations() {
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

/* ---------- Карточки локаций (внутренняя) ---------- */
function renderLocationCards(container, locations) {
  if (!container) return;

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

    // PATCH 0.4 — проверяем принадлежность к пулу выбранных локаций
    // по имени (пул может содержать локации из разных паков).
    const isSelected = state.selectedLocations.some(
      (item) => item.name === location.name
    );

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

/* ---------- Хинт под пулом локаций ---------- */
// PATCH 0.4 — хинт под пулом локаций.
export function updateLocationHint() {
  if (!elements.locationHint) return;

  const count = state.selectedLocations.length;

  if (count === 0) {
    elements.locationHint.textContent =
      "Выберите хотя бы одну локацию для операции.";
  } else {
    elements.locationHint.textContent =
      `Выбрано локаций: ${count}. Игра случайно выберет одну из них.`;
  }
}

/* ---------- Toggle локации в пуле ---------- */
// PATCH 0.4 — toggleLocation вместо selectLocation: клик по карточке
// добавляет/удаляет локацию из пула.
export function toggleLocation(index) {
  const locations = getCurrentLocations();
  const location = locations[index];

  if (!location) return;

  const existingIndex = state.selectedLocations.findIndex(
    (item) => item.name === location.name
  );

  if (existingIndex >= 0) {
    state.selectedLocations.splice(existingIndex, 1);
  } else {
    state.selectedLocations.push(location);
  }

  // PATCH 0.4.2 — сохраняем пул выбранных локаций.
  saveSelectedLocations();

  updateLocationHint();
  renderDefaultLocations();
  renderCustomLocations();
}

/* ---------- Сохранение пула выбранных локаций ---------- */
// PATCH 0.4.2 — сохранение пула выбранных локаций.
export function saveSelectedLocations() {
  const minimal = state.selectedLocations.map((location) => ({
    name: location.name,
    roles: Array.isArray(location.roles) ? location.roles : []
  }));

  saveToStorage(STORAGE_KEYS.selectedLocations, minimal);
}

/* ---------- Загрузка пула выбранных локаций ---------- */
// PATCH 0.4.2 — загрузка пула с фильтрацией несуществующих локаций.
export function loadSelectedLocations() {
  const saved = readFromStorage(STORAGE_KEYS.selectedLocations, []);

  if (!Array.isArray(saved)) {
    state.selectedLocations = [];
    return;
  }

  const knownNames = new Set();

  DEFAULT_LOCATIONS.forEach((location) => {
    knownNames.add(location.name);
  });

  state.customLocations.forEach((location) => {
    knownNames.add(location.name);
  });

  state.selectedLocations = saved
    .filter((location) => {
      return (
        location &&
        typeof location.name === "string" &&
        knownNames.has(location.name) &&
        Array.isArray(location.roles) &&
        location.roles.length >= 3
      );
    })
    .map((location) => ({
      name: location.name,
      roles: [...location.roles]
    }));

  // PATCH 0.4.2 — синхронизируем роли с актуальными источниками.
  state.selectedLocations = state.selectedLocations.map((saved) => {
    const fromDefault = DEFAULT_LOCATIONS.find(
      (item) => item.name === saved.name
    );

    if (fromDefault) {
      return {
        name: fromDefault.name,
        roles: [...fromDefault.roles]
      };
    }

    const fromCustom = state.customLocations.find(
      (item) => item.name === saved.name
    );

    if (fromCustom) {
      return {
        name: fromCustom.name,
        roles: [...fromCustom.roles]
      };
    }

    return saved;
  });
}
