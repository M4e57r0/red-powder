/**
 * Сигареты «Красный порох»: идентификация предмета, подсчёт, «выкуривание».
 * @module red-powder/cigarettes
 */

import { FLAGS, MODULE_ID, SETTINGS } from "./constants.mjs";
import { applyExhaustion, EXHAUSTION_REASONS } from "./exhaustion.mjs";

/**
 * Проверяет, считается ли предмет сигаретой «Красный порох».
 * Предмет подходит, если у него есть флаг `flags["red-powder"].cigarette === true`
 * ИЛИ его имя точно совпадает (без учёта регистра) с настройкой «Название предмета».
 * @param {Item} item  Предмет.
 * @returns {boolean}
 */
export function isCigarette(item) {
  if ( item.getFlag(MODULE_ID, FLAGS.CIGARETTE) === true ) return true;
  const name = (game.settings.get(MODULE_ID, SETTINGS.CIGARETTE_NAME) ?? "").trim().toLowerCase();
  return !!name && item.name.trim().toLowerCase() === name;
}

/**
 * Возвращает все предметы-сигареты актёра.
 * @param {Actor} actor  Актёр.
 * @returns {Item[]}
 */
export function getCigaretteItems(actor) {
  return actor.items.filter(isCigarette);
}

/**
 * Считает суммарное количество сигарет у актёра.
 * @param {Actor} actor  Актёр.
 * @returns {number}
 */
export function countCigarettes(actor) {
  return getCigaretteItems(actor).reduce((total, item) => total + (item.system.quantity ?? 0), 0);
}

/**
 * «Выкуривает» одну сигарету: −1 к количеству предмета и −1 к истощению.
 * Выполняется клиентом владельца актёра, без сокетов.
 * @param {Actor} actor  Актёр-владелец.
 * @returns {Promise<boolean>}  `true`, если операция выполнена.
 */
export async function smokeCigarette(actor) {
  if ( !actor.isOwner ) return false;
  if ( (actor.system.attributes?.exhaustion ?? 0) <= 0 ) return false;

  const item = getCigaretteItems(actor).find(i => (i.system.quantity ?? 0) >= 1);
  if ( !item ) return false;

  try {
    const quantity = item.system.quantity - 1;
    if ( (quantity <= 0) && game.settings.get(MODULE_ID, SETTINGS.DELETE_EMPTY_STACK) ) {
      await item.delete();
    } else {
      await item.update({ "system.quantity": quantity });
    }
    await applyExhaustion(actor, -1, { reason: EXHAUSTION_REASONS.CIGARETTE });
    await ChatMessage.create({
      content: game.i18n.format("REDPOWDER.Cigarette.Smoked", { name: actor.name }),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return true;
  } catch ( error ) {
    console.error(`[${MODULE_ID}] Не удалось выкурить сигарету`, error);
    ui.notifications.error(game.i18n.localize("REDPOWDER.Cigarette.Error"));
    return false;
  }
}
