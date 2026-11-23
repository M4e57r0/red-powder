/**
 * Точка входа модуля «Красный порох».
 * @module red-powder/main
 */

import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";

Hooks.once("init", () => {
  registerSettings();
  console.log(`[${MODULE_ID}] Модуль «Красный порох» инициализирован`);
});
