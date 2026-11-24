/**
 * Интеграция с листом персонажа: счётчик сигарет в сайдбаре и кнопка «Выкурить»
 * в строке валюты вкладки «Инвентарь».
 * «Всего сигарет» считается по формуле ТЗ 3.1 (пачки × заряды), а не по quantity.
 * @module red-powder/sheet-integration
 */

import { countCigarettes, smokeCigarette } from "./cigarettes.mjs";
import { TEMPLATES } from "./constants.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/** Селектор строки валюты на вкладке «Инвентарь» (templates/inventory/inventory.hbs). */
const CURRENCY_SELECTOR = ".tab[data-tab='inventory'] .currency";

/** Селектор блока статистики в сайдбаре (templates/actors/character-sidebar.hbs). */
const SIDEBAR_STATS_SELECTOR = ".sidebar .stats";

/** Атрибут-маркер, чтобы не вставлять кнопку дважды. */
const BUTTON_ATTR = "data-red-powder-smoke-button";

/** Атрибут-маркер, чтобы не вставлять счётчик дважды. */
const INDICATOR_ATTR = "data-red-powder-cigarette-indicator";

/* -------------------------------------------- */

/**
 * Проверяет, можно ли выкурить сигарету: пользователь — владелец, есть сигареты и истощение.
 * @param {Actor} actor  Актёр.
 * @returns {boolean}
 */
function canSmoke(actor) {
  if ( !actor.isOwner ) return false;
  if ( countCigarettes(actor) < 1 ) return false;
  return (actor.system.attributes?.exhaustion ?? 0) > 0;
}

/* -------------------------------------------- */
/*  Счётчик сигарет в сайдбаре                  */
/* -------------------------------------------- */

/**
 * Вставляет счётчик сигарет после блока статистики в сайдбаре.
 * Виден владельцу и GM. Показывает «всего сигарет» (ТЗ 3.1).
 * @param {Actor} actor  Актёр.
 * @param {HTMLElement} element  Корневой элемент листа.
 * @returns {void}
 */
function injectIndicator(actor, element) {
  if ( element.querySelector(`[${INDICATOR_ATTR}]`) ) return;
  if ( !actor.isOwner && !game.user.isGM ) return;
  const anchor = element.querySelector(SIDEBAR_STATS_SELECTOR);
  if ( !anchor ) return;
  const indicator = document.createElement("div");
  indicator.className = "red-powder-cigarette-indicator";
  indicator.setAttribute(INDICATOR_ATTR, "");
  indicator.dataset.tooltip = "REDPOWDER.Cigarette.Indicator";
  indicator.setAttribute("aria-label", game.i18n.localize("REDPOWDER.Cigarette.Indicator"));
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-smoking";
  icon.setAttribute("inert", "");
  const value = document.createElement("span");
  value.className = "red-powder-cigarette-count";
  indicator.append(icon, value);
  anchor.insertAdjacentElement("afterend", indicator);
  refreshIndicator(actor, element);
}

/**
 * Обновляет число сигарет в счётчике.
 * @param {Actor} actor  Актёр.
 * @param {HTMLElement} element  Корневой элемент листа.
 * @returns {void}
 */
function refreshIndicator(actor, element) {
  const value = element.querySelector(`[${INDICATOR_ATTR}] .red-powder-cigarette-count`);
  if ( value ) value.textContent = String(countCigarettes(actor));
}

/* -------------------------------------------- */
/*  Кнопка «Выкурить» в строке валюты           */
/* -------------------------------------------- */

/**
 * Вставляет кнопку «Выкурить» в строку валюты (вкладка «Инвентарь»).
 * Видна только владельцу актёра.
 * @param {Actor} actor  Актёр.
 * @param {HTMLElement} element  Корневой элемент листа.
 * @returns {Promise<void>}
 */
async function injectButton(actor, element) {
  if ( element.querySelector(`[${BUTTON_ATTR}]`) ) return;
  if ( !actor.isOwner ) return;
  const anchor = element.querySelector(CURRENCY_SELECTOR);
  if ( !anchor ) return;
  const html = await renderTemplate(TEMPLATES.CIGARETTE_BUTTON, { disabled: !canSmoke(actor) });
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  const button = wrapper.firstElementChild;
  if ( !button ) return;
  button.setAttribute(BUTTON_ATTR, "");
  button.addEventListener("click", event => onSmokeClick(event, actor));
  anchor.append(button);
}

/**
 * Обновляет состояние кнопки «Выкурить» в строке валюты.
 * @param {Actor} actor  Актёр.
 * @param {HTMLElement} element  Корневой элемент листа.
 * @returns {void}
 */
function refreshButton(actor, element) {
  const button = element.querySelector(`[${BUTTON_ATTR}]`);
  if ( button ) button.disabled = !canSmoke(actor);
}

/* -------------------------------------------- */
/*  Общие обработчики                           */
/* -------------------------------------------- */

/**
 * Обрабатывает клик по кнопке «Выкурить».
 * @param {MouseEvent} event  Событие клика.
 * @param {Actor} actor  Актёр.
 * @returns {Promise<void>}
 */
async function onSmokeClick(event, actor) {
  const button = event.currentTarget;
  if ( !button || button.disabled ) return;
  // Защита от двойного клика: блокируем кнопку до завершения операции.
  button.disabled = true;
  try {
    await smokeCigarette(actor);
  } finally {
    button.disabled = !canSmoke(actor);
  }
}

/**
 * Обновляет счётчик и кнопку на всех открытых листах указанного актёра.
 * @param {Actor} actor  Актёр.
 * @returns {void}
 */
function refreshActorSheets(actor) {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.document !== actor ) continue;
    const element = app.element;
    if ( !element ) continue;
    refreshIndicator(actor, element);
    refreshButton(actor, element);
  }
}

/* -------------------------------------------- */

/**
 * Регистрирует хуки интеграции с листом персонажа.
 * @returns {void}
 */
export function registerSheetIntegration() {
  Hooks.on("renderActorSheetV2", async (app, element) => {
    const actor = app.document;
    if ( actor?.type !== "character" ) return;
    injectIndicator(actor, element);
    await injectButton(actor, element);
  });

  const onItemChange = item => {
    const actor = item.parent;
    if ( actor?.type === "character" ) refreshActorSheets(actor);
  };
  Hooks.on("createItem", onItemChange);
  Hooks.on("updateItem", onItemChange);
  Hooks.on("deleteItem", onItemChange);

  Hooks.on("updateActor", actor => {
    if ( actor.type === "character" ) refreshActorSheets(actor);
  });
}
