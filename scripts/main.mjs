/**
 * Точка входа модуля «Красный порох».
 * @module red-powder/main
 */

import { registerExhaustionPanelHooks, toggleExhaustionPanel } from "./apps/exhaustion-panel.mjs";
import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSheetIntegration } from "./sheet-integration.mjs";
import { registerSkillSort } from "./skill-sort.mjs";
import { registerTimerHooks } from "./timer.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerExhaustionPanelHooks();
  registerTimerHooks();
  registerSheetIntegration();
  registerSkillSort();
  console.log(`[${MODULE_ID}] Модуль «Красный порох» инициализирован`);
});

Hooks.on("getSceneControlButtons", (controls) => {
  if ( !game.user.isGM ) return;
  const tokens = controls.tokens;
  if ( !tokens?.tools ) return;
  tokens.tools.redPowderPanel = {
    name: "redPowderPanel",
    order: Math.max(0, ...Object.values(tokens.tools).map(t => t.order ?? 0)) + 1,
    title: "REDPOWDER.Controls.OpenPanel",
    icon: "fa-solid fa-smoking",
    button: true,
    visible: game.user.isGM,
    onChange: () => toggleExhaustionPanel()
  };
});
