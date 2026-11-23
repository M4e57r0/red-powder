/**
 * Константы модуля «Красный порох».
 * @module red-powder/constants
 */

/** Идентификатор модуля. */
export const MODULE_ID = "red-powder";

/** Ключи настроек модуля (`game.settings`). */
export const SETTINGS = {
  /** Список UUID актёров на панели мастера (world). */
  PANEL_ACTORS: "panelActors",
  /** Состояние таймера панели (world). */
  TIMER_STATE: "timerState",
  /** Максимальный уровень истощения (world). */
  MAX_EXHAUSTION: "maxExhaustion",
  /** Разрешить смертельный (6-й) уровень истощения (world). */
  ALLOW_SIXTH_LEVEL: "allowSixthLevel",
  /** Шаг ручного наложения истощения (world). */
  STEP: "step",
  /** Режим сообщений в чат (world). */
  CHAT_MODE: "chatMode",
  /** Название предмета-сигареты (world). */
  CIGARETTE_NAME: "cigaretteName",
  /** Удалять пустой стак сигарет (world). */
  DELETE_EMPTY_STACK: "deleteEmptyStack",
  /** Режим сортировки навыков (client). */
  SKILL_SORT_MODE: "skillSortMode"
};

/** Ключи флагов документов (`flags["red-powder"]`). */
export const FLAGS = {
  /** Помечает предмет как сигарету «Красный порох». */
  CIGARETTE: "cigarette"
};

/** Режимы сообщений в чат. */
export const CHAT_MODES = {
  PUBLIC: "public",
  GM: "gm",
  OFF: "off"
};

/** Режимы сортировки навыков. */
export const SKILL_SORT_MODES = {
  STANDARD: "standard",
  ABILITY: "ability"
};

/** Единицы интервала таймера. */
export const TIMER_UNITS = {
  MINUTES: "minutes",
  HOURS: "hours"
};

/** Режимы отсчёта таймера. */
export const TIMER_MODES = {
  REAL: "real",
  GAME: "game"
};

/** Пути к шаблонам модуля. */
export const TEMPLATES = {
  EXHAUSTION_PANEL: `modules/${MODULE_ID}/templates/exhaustion-panel.hbs`,
  CIGARETTE_FIELD: `modules/${MODULE_ID}/templates/cigarette-field.hbs`
};
