/**
 * Окно «Панель истощения» мастера.
 * @module red-powder/apps/exhaustion-panel
 */

import { FLAGS, MODULE_ID, SETTINGS, TEMPLATES } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Идентификатор окна панели. */
export const PANEL_ID = "red-powder-exhaustion-panel";

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
 * TODO (этап 4): заменить на applyExhaustion из exhaustion.mjs (ограничения, чат).
 * @param {string} uuid  UUID актёра.
 * @param {number} delta  Изменение уровня (например, +1 или -1).
 * @returns {Promise<void>}
 */
async function changePanelActorExhaustion(uuid, delta) {
  const actor = await fromUuid(uuid);
  if ( !actor ) return;
  const current = actor.system.attributes?.exhaustion ?? 0;
  const next = Math.max(0, current + delta);
  await actor.update({ "system.attributes.exhaustion": next });
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
      remove: ExhaustionPanel.#onRemove
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
    return { actors };
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const zone = this.element.querySelector("[data-drop-zone]");
    if ( !zone ) return;
    zone.addEventListener("dragover", event => event.preventDefault());
    zone.addEventListener("drop", event => this.#onDrop(event));
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
