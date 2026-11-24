/**
 * Сортировка навыков на листе персонажа (ТЗ раздел 4).
 * Иконочная кнопка в заголовке блока «Навыки» переключает режим по кругу:
 * Стандартный → По алфавиту → По характеристике. При каждом рендере листа
 * переупорядочиваются DOM-элементы навыков. Выбор хранится в client-настройке
 * пользователя (на всех персонажей).
 * @module red-powder/skill-sort
 */

import { MODULE_ID, SETTINGS, SKILL_SORT_MODES, SKILL_SORT_CYCLE } from "./constants.mjs";

/** Селектор блока навыков на листе персонажа (character-details.hbs). */
const SKILLS_BOX_SELECTOR = "filigree-box.skills";

/** Порядок характеристик для режима «По характеристике». */
const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];

/** Data-атрибут, в котором запоминается исходный порядок навыков. */
const ORDER_ATTR = "data-red-powder-order";

/** Иконка кнопки (Font Awesome) для каждого режима. */
const MODE_ICONS = {
  [SKILL_SORT_MODES.STANDARD]: "fa-list",
  [SKILL_SORT_MODES.ALPHABETICAL]: "fa-arrow-down-a-z",
  [SKILL_SORT_MODES.ABILITY]: "fa-arrow-down-short-wide"
};

/** Ключ локализации названия режима. */
const MODE_LABEL_KEYS = {
  [SKILL_SORT_MODES.STANDARD]: "REDPOWDER.Settings.SkillSortMode.Standard",
  [SKILL_SORT_MODES.ALPHABETICAL]: "REDPOWDER.Settings.SkillSortMode.Alphabetical",
  [SKILL_SORT_MODES.ABILITY]: "REDPOWDER.Settings.SkillSortMode.Ability"
};

/* -------------------------------------------- */

/**
 * Возвращает текущий режим сортировки, нормализуя устаревшее значение "ability".
 * @returns {string}
 */
function getSortMode() {
  const mode = game.settings.get(MODULE_ID, SETTINGS.SKILL_SORT_MODE);
  if ( mode === "ability" ) return SKILL_SORT_MODES.ABILITY;
  return SKILL_SORT_CYCLE.includes(mode) ? mode : SKILL_SORT_MODES.STANDARD;
}

/**
 * Возвращает локализованное название режима.
 * @param {string} mode  Режим.
 * @returns {string}
 */
function modeLabel(mode) {
  return game.i18n.localize(MODE_LABEL_KEYS[mode]);
}

/**
 * Возвращает индекс группы характеристики навыка.
 * Характеристика берётся из данных актёра, чтобы учитывать переопределения.
 * @param {Actor} actor  Актёр.
 * @param {string} key  Ключ навыка.
 * @returns {number}  Индекс группы; неизвестные характеристики — в конец.
 */
function abilityGroupIndex(actor, key) {
  const ability = actor.system.skills?.[key]?.ability;
  const index = ability ? ABILITY_ORDER.indexOf(ability) : -1;
  return index === -1 ? ABILITY_ORDER.length : index;
}

/**
 * Возвращает отображаемое имя навыка из DOM-элемента.
 * @param {HTMLElement} li  Элемент навыка.
 * @returns {string}
 */
function skillName(li) {
  return li.querySelector("a.name")?.textContent ?? "";
}

/**
 * Переупорядочивает элементы навыков в указанном режиме.
 * @param {Actor} actor  Актёр.
 * @param {HTMLElement} element  Корневой элемент листа.
 * @param {string} mode  Режим сортировки.
 * @returns {void}
 */
export function sortSkills(actor, element, mode) {
  const ul = element.querySelector(`${SKILLS_BOX_SELECTOR} > ul`);
  if ( !ul ) return;
  const items = [...ul.querySelectorAll("li[data-key]")];
  if ( items.length < 2 ) return;

  // Запоминаем исходный (отданный dnd5e) порядок в data-атрибуте.
  items.forEach((li, index) => li.setAttribute(ORDER_ATTR, String(index)));

  let sorted;
  if ( mode === SKILL_SORT_MODES.ABILITY ) {
    sorted = [...items].sort((a, b) => {
      const diff = abilityGroupIndex(actor, a.dataset.key) - abilityGroupIndex(actor, b.dataset.key);
      return diff !== 0 ? diff : skillName(a).localeCompare(skillName(b), game.i18n.lang);
    });
  } else if ( mode === SKILL_SORT_MODES.ALPHABETICAL ) {
    sorted = [...items].sort((a, b) => skillName(a).localeCompare(skillName(b), game.i18n.lang));
  } else {
    // «Стандартный»: восстанавливаем исходный порядок.
    sorted = [...items].sort((a, b) => Number(a.dataset.redPowderOrder) - Number(b.dataset.redPowderOrder));
  }
  for ( const li of sorted ) ul.append(li);
}

/* -------------------------------------------- */

/**
 * Обновляет иконку и подсказку кнопки для режима.
 * @param {HTMLElement} button  Кнопка.
 * @param {string} mode  Режим.
 * @returns {void}
 */
function updateButton(button, mode) {
  button.querySelector("i").className = `fa-solid ${MODE_ICONS[mode]}`;
  const tooltip = game.i18n.format("REDPOWDER.Sheet.SkillSort", { mode: modeLabel(mode) });
  button.dataset.tooltip = tooltip;
  button.setAttribute("aria-label", tooltip);
}

/**
 * Вставляет кнопку сортировки в заголовок блока навыков.
 * Кнопка — последний элемент flex-заголовка, `margin-left: auto` прижимает её вправо.
 * @param {Actor} actor  Актёр.
 * @param {HTMLElement} element  Корневой элемент листа.
 * @returns {void}
 */
function injectSortButton(actor, element) {
  const header = element.querySelector(`${SKILLS_BOX_SELECTOR} > h3`);
  if ( !header || header.querySelector(".red-powder-skill-sort") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "red-powder-skill-sort";
  const icon = document.createElement("i");
  icon.setAttribute("inert", "");
  button.append(icon);
  updateButton(button, getSortMode());
  button.addEventListener("click", event => onSortButtonClick(event, actor, element));
  header.append(button);
}

/**
 * Обрабатывает клик по кнопке сортировки: переключает режим по кругу,
 * сохраняет настройку и пересортировывает навыки на всех открытых
 * листах персонажей.
 * @param {Event} event  Событие клика.
 * @param {Actor} actor  Актёр листа, где находится кнопка.
 * @param {HTMLElement} element  Корневой элемент этого листа.
 * @returns {Promise<void>}
 */
async function onSortButtonClick(event, actor, element) {
  // Клик не должен доходить до обработчиков заголовка (например, сворачивания блока).
  event.stopPropagation();
  const current = getSortMode();
  const mode = SKILL_SORT_CYCLE[(SKILL_SORT_CYCLE.indexOf(current) + 1) % SKILL_SORT_CYCLE.length];
  await game.settings.set(MODULE_ID, SETTINGS.SKILL_SORT_MODE, mode);
  sortSkills(actor, element, mode);
  // Настройка client-общая: обновляем остальные открытые листы персонажей.
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.element === element || !app.element ) continue;
    const doc = app.document;
    if ( doc?.type !== "character" ) continue;
    sortSkills(doc, app.element, mode);
    const button = app.element.querySelector(".red-powder-skill-sort");
    if ( button ) updateButton(button, mode);
  }
  const button = element.querySelector(".red-powder-skill-sort");
  if ( button ) updateButton(button, mode);
}

/* -------------------------------------------- */

/**
 * Регистрирует хук сортировки навыков.
 * @returns {void}
 */
export function registerSkillSort() {
  Hooks.on("renderActorSheetV2", (app, element) => {
    const actor = app.document;
    if ( actor?.type !== "character" ) return;
    injectSortButton(actor, element);
    sortSkills(actor, element, getSortMode());
  });
}
