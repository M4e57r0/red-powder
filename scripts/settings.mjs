/**
 * Регистрация настроек модуля «Красный порох».
 * @module red-powder/settings
 */

import { CHAT_MODES, MODULE_ID, SETTINGS, SKILL_SORT_MODES, TIMER_MODES, TIMER_UNITS } from "./constants.mjs";

/**
 * Регистрирует все настройки модуля.
 * Вызывается один раз при инициализации (хук `init`).
 * @returns {void}
 */
export function registerSettings() {
  // --- World: состояние панели (не отображается в конфиге) ---

  game.settings.register(MODULE_ID, SETTINGS.PANEL_ACTORS, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.TIMER_STATE, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      interval: 60,
      unit: TIMER_UNITS.MINUTES,
      mode: TIMER_MODES.REAL,
      repeat: true,
      endsAt: null,
      running: false,
      pausedRemaining: null
    }
  });

  // --- World: правила истощения ---

  game.settings.register(MODULE_ID, SETTINGS.MAX_EXHAUSTION, {
    name: "REDPOWDER.Settings.MaxExhaustion.Name",
    hint: "REDPOWDER.Settings.MaxExhaustion.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    range: { min: 1, max: 6, step: 1 }
  });

  game.settings.register(MODULE_ID, SETTINGS.ALLOW_SIXTH_LEVEL, {
    name: "REDPOWDER.Settings.AllowSixthLevel.Name",
    hint: "REDPOWDER.Settings.AllowSixthLevel.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.STEP, {
    name: "REDPOWDER.Settings.Step.Name",
    hint: "REDPOWDER.Settings.Step.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    range: { min: 1, max: 6, step: 1 }
  });

  game.settings.register(MODULE_ID, SETTINGS.CHAT_MODE, {
    name: "REDPOWDER.Settings.ChatMode.Name",
    hint: "REDPOWDER.Settings.ChatMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CHAT_MODES.PUBLIC]: "REDPOWDER.Settings.ChatMode.Public",
      [CHAT_MODES.GM]: "REDPOWDER.Settings.ChatMode.GM",
      [CHAT_MODES.OFF]: "REDPOWDER.Settings.ChatMode.Off"
    },
    default: CHAT_MODES.PUBLIC
  });

  game.settings.register(MODULE_ID, SETTINGS.CIGARETTE_NAME, {
    name: "REDPOWDER.Settings.CigaretteName.Name",
    hint: "REDPOWDER.Settings.CigaretteName.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "Красный порох"
  });

  game.settings.register(MODULE_ID, SETTINGS.DELETE_EMPTY_STACK, {
    name: "REDPOWDER.Settings.DeleteEmptyStack.Name",
    hint: "REDPOWDER.Settings.DeleteEmptyStack.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // --- Client: сортировка навыков ---

  game.settings.register(MODULE_ID, SETTINGS.SKILL_SORT_MODE, {
    name: "REDPOWDER.Settings.SkillSortMode.Name",
    hint: "REDPOWDER.Settings.SkillSortMode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [SKILL_SORT_MODES.STANDARD]: "REDPOWDER.Settings.SkillSortMode.Standard",
      [SKILL_SORT_MODES.ALPHABETICAL]: "REDPOWDER.Settings.SkillSortMode.Alphabetical",
      [SKILL_SORT_MODES.ABILITY]: "REDPOWDER.Settings.SkillSortMode.Ability"
    },
    default: SKILL_SORT_MODES.STANDARD
  });
}
