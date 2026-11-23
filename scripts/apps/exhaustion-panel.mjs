/**
 * Окно «Панель истощения» мастера.
 * @module red-powder/apps/exhaustion-panel
 */

import { applyExhaustion, EXHAUSTION_REASONS } from "../exhaustion.mjs";
import { FLAGS, MODULE_ID, PANEL_ID, SETTINGS, TEMPLATES } from "../constants.mjs";
import { applyExhaustionToAll, formatTime, getTimerRemaining, getTimerState, pauseTimer, resetTimer, startTimer, updateTimerConfig } from "../timer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* -------------------------------------------- */
/*  Состояние панели (world-настройка)          */
/* -------------------------------------------- */

/**
 * Возвращает список UUID актёров на панели.
 * @returns {string[]}
 */
export function getPanelActorUuids() {
  return game.settings.get(MODULE_ID, SETTINGS.PANEL_ACTORS) ?? [];
}

/**
 * Сохраняет список UUID актёров на панели.
 * @param {string[]} uuids  Новый список.
 * @returns {Promise<void>}
 */
async function setPanelActorUuids(uuids) {
  await game.settings.set(MODULE_ID, SETTINGS.PANEL_ACTORS, uuids);
}

/**
 * Добавляет актёра в список панели, если его там ещё нет.
 * @param {string} uuid  UUID актёра.
 * @returns {Promise<void>}
 */
export async function addPanelActor(uuid) {
  const uuids = getPanelActorUuids();
  if ( uuids.includes(uuid) ) {
    ui.notifications.warn(game.i18n.localize("REDPOWDER.Panel.AlreadyAdded"));
    return;
  }
  await setPanelActorUuids([...uuids, uuid]);
  renderPanel();
}

/**
 * Убирает актёра из списка панели.
 * @param {string} uuid  UUID актёра.
 * @returns {Promise<void>}
 */
export async function removePanelActor(uuid) {
  const uuids = getPanelActorUuids();
  if ( !uuids.includes(uuid) ) return;
  await setPanelActorUuids(uuids.filter(u => u !== uuid));
  renderPanel();
}

/**
 * Меняет уровень истощения актёра на указанную величину.
 * @param {string} uuid  UUID актёра.
 * @param {number} delta  Изменение уровня (например, +1 или -1).
 * @returns {Promise<void>}
 */
async function changePanelActorExhaustion(uuid, delta) {
  const actor = await fromUuid(uuid);
  if ( !actor ) return;
  await applyExhaustion(actor, delta, { reason: EXHAUSTION_REASONS.MANUAL });
  renderPanel();
}

/**
 * Считает количество сигарет «Красный порох» у актёра.
 * TODO (этап 6): перенести в cigarettes.mjs.
 * @param {Actor} actor  Актёр.
 * @returns {number}
 */
function countCigarettes(actor) {
  const name = (game.settings.get(MODULE_ID, SETTINGS.CIGARETTE_NAME) ?? "").trim().toLowerCase();
  return actor.items.reduce((total, item) => {
    const isCigarette = (item.getFlag(MODULE_ID, FLAGS.CIGARETTE) === true)
      || (!!name && item.name.trim().toLowerCase() === name);
    return isCigarette ? total + (item.system.quantity ?? 0) : total;
  }, 0);
}

/**
 * Перерисовывает открытую панель, если она существует.
 * @returns {void}
 */
function renderPanel() {
  foundry.applications.instances.get(PANEL_ID)?.render();
}

/* -------------------------------------------- */
/*  Окно панели                                 */
/* -------------------------------------------- */

/**
 * Окно «Панель истощения» (ApplicationV2).
 * @extends {foundry.applications.api.ApplicationV2}
 */
export default class ExhaustionPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: PANEL_ID,
    classes: ["red-powder", "red-powder-panel"],
    window: {
      title: "REDPOWDER.Panel.Title",
      icon: "fa-solid fa-smoking",
      resizable: true
    },
    position: {
      width: 480,
      height: 560
    },
    actions: {
      decrease: ExhaustionPanel.#onDecrease,
      increase: ExhaustionPanel.#onIncrease,
      remove: ExhaustionPanel.#onRemove,
      timerStart: ExhaustionPanel.#onTimerStart,
      timerPause: ExhaustionPanel.#onTimerPause,
      timerReset: ExhaustionPanel.#onTimerReset,
      applyNow: ExhaustionPanel.#onApplyNow
    }
  };

  /** @override */
  static PARTS = {
    content: {
      template: TEMPLATES.EXHAUSTION_PANEL
    }
  };

  /* -------------------------------------------- */

  /**
   * Дебаунс-обёртка для сохранения позиции окна.
   * @type {function(foundry.applications.api.ApplicationPosition): void}
   */
  #savePositionDebounced = foundry.utils.debounce(pos => this.#savePosition(pos), 250);

  /* -------------------------------------------- */

  /**
   * Восстанавливает сохранённую позицию окна.
   * @param {object} [options]  Опции приложения.
   */
  constructor(options = {}) {
    const saved = game.user.getFlag(MODULE_ID, "panelPosition");
    if ( saved ) options.position = { ...options.position, ...saved };
    super(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const actors = getPanelActorUuids().map(uuid => {
      const actor = fromUuidSync(uuid);
      if ( !actor ) return { uuid, missing: true };
      return {
        uuid,
        name: actor.name,
        img: actor.img,
        exhaustion: actor.system.attributes?.exhaustion ?? 0,
        cigarettes: countCigarettes(actor)
      };
    });
    return { actors, timer: getTimerState(), timerDisplay: formatTime(getTimerRemaining()) };
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const zone = this.element.querySelector("[data-drop-zone]");
    if ( zone ) {
      zone.addEventListener("dragover", event => event.preventDefault());
      zone.addEventListener("drop", event => this.#onDrop(event));
    }
    for ( const name of ["interval", "unit", "mode", "repeat"] ) {
      this.element.querySelector(`[name="${name}"]`)?.addEventListener("change", event => this.#onTimerConfigChange(event));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onPosition(position) {
    super._onPosition(position);
    this.#savePositionDebounced(position);
  }

  /* -------------------------------------------- */

  /**
   * Сохраняет позицию и размер окна в флаге пользователя.
   * @param {foundry.applications.api.ApplicationPosition} position
   * @returns {void}
   */
  #savePosition(position) {
    const prefs = {};
    for ( const key of ["top", "left", "width", "height"] ) {
      if ( Number.isFinite(position[key]) ) prefs[key] = position[key];
    }
    if ( foundry.utils.isEmpty(prefs) ) return;
    game.user.setFlag(MODULE_ID, "panelPosition", prefs);
  }

  /* -------------------------------------------- */

  /**
   * Обрабатывает перетаскивание актёра в зону списка.
   * @param {DragEvent} event  Событие drop.
   * @returns {Promise<void>}
   */
  async #onDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !data?.type || data.type !== "Actor" ) return;
    const actor = await fromUuid(data.uuid);
    if ( !actor || actor.type !== "character" ) {
      ui.notifications.warn(game.i18n.localize("REDPOWDER.Panel.OnlyCharacters"));
      return;
    }
    await addPanelActor(actor.uuid);
  }

  /* -------------------------------------------- */

  /**
   * Обрабатывает изменение полей конфигурации таймера.
   * @param {Event} event  Событие change.
   * @returns {void}
   */
  #onTimerConfigChange(event) {
    const name = event.target.name;
    if ( name === "interval" ) updateTimerConfig({ interval: Math.max(1, Number(event.target.value) || 1) });
    else if ( name === "unit" ) updateTimerConfig({ unit: event.target.value });
    else if ( name === "mode" ) updateTimerConfig({ mode: event.target.value });
    else if ( name === "repeat" ) updateTimerConfig({ repeat: event.target.checked });
  }

  /* -------------------------------------------- */

  /**
   * Уменьшает истощение актёра на 1.
   * @this {ExhaustionPanel}
   * @param {PointerEvent} event  Событие клика.
   * @param {HTMLElement} target  Кнопка.
   * @returns {Promise<void>}
   */
  static async #onDecrease(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if ( uuid ) await changePanelActorExhaustion(uuid, -1);
  }

  /**
   * Увеличивает истощение актёра на 1.
   * @this {ExhaustionPanel}
   * @param {PointerEvent} event  Событие клика.
   * @param {HTMLElement} target  Кнопка.
   * @returns {Promise<void>}
   */
  static async #onIncrease(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if ( uuid ) await changePanelActorExhaustion(uuid, 1);
  }

  /**
   * Убирает актёра из списка.
   * @this {ExhaustionPanel}
   * @param {PointerEvent} event  Событие клика.
   * @param {HTMLElement} target  Кнопка.
   * @returns {Promise<void>}
   */
  static async #onRemove(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if ( uuid ) await removePanelActor(uuid);
  }

  /**
   * Запускает таймер.
   * @returns {void}
   */
  static #onTimerStart() {
    startTimer();
    renderPanel();
  }

  /**
   * Ставит таймер на паузу.
   * @returns {void}
   */
  static #onTimerPause() {
    pauseTimer();
    renderPanel();
  }

  /**
   * Сбрасывает таймер.
   * @returns {void}
   */
  static #onTimerReset() {
    resetTimer();
    renderPanel();
  }

  /**
   * Накладывает истощение всем персонажам из списка.
   * @returns {Promise<void>}
   */
  static async #onApplyNow() {
    const step = game.settings.get(MODULE_ID, SETTINGS.STEP);
    await applyExhaustionToAll(EXHAUSTION_REASONS.MANUAL, step);
    renderPanel();
  }
}

/* -------------------------------------------- */

/**
 * Открывает панель, если она закрыта, и закрывает, если открыта.
 * @returns {void}
 */
export function toggleExhaustionPanel() {
  const existing = foundry.applications.instances.get(PANEL_ID);
  if ( existing ) existing.close();
  else new ExhaustionPanel().render({ force: true });
}

/* -------------------------------------------- */

/**
 * Регистрирует хуки, поддерживающие панель в актуальном состоянии.
 * @returns {void}
 */
export function registerExhaustionPanelHooks() {
  const refresh = foundry.utils.debounce(() => renderPanel(), 100);
  const onChange = actor => {
    if ( getPanelActorUuids().includes(actor.uuid) ) refresh();
  };
  Hooks.on("updateActor", onChange);
  Hooks.on("deleteActor", onChange);
}
