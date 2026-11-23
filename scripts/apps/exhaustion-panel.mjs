/**
 * Окно «Панель истощения» мастера.
 * @module red-powder/apps/exhaustion-panel
 */

import { MODULE_ID, TEMPLATES } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Идентификатор окна панели. */
export const PANEL_ID = "red-powder-exhaustion-panel";

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
