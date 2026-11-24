/**
 * Сигареты «Красный порох»: идентификация предмета, подсчёт, «выкуривание».
 * Модель данных (ТЗ 3.1): предмет = пачка. `system.quantity` — число пачек,
 * `system.uses` — заряды: max — размер пачки, spent — выкуренные сигареты
 * в текущей пачке, value (вычисляется dnd5e) — оставшиеся в пачке.
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
 * Суммарное число сигарет в одном предмете (ТЗ 3.1):
 * если quantity ≥ 1, то (quantity − 1) × max + текущие заряды; иначе 0.
 * @param {Item} item  Предмет.
 * @returns {number}
 */
function itemCigarettes(item) {
  const quantity = item.system.quantity ?? 0;
  if ( quantity < 1 ) return 0;
  const uses = item.system.uses;
  return (quantity - 1) * (uses?.max ?? 0) + (uses?.value ?? 0);
}

/**
 * Считает суммарное количество сигарет у актёра.
 * @param {Actor} actor  Актёр.
 * @returns {number}
 */
export function countCigarettes(actor) {
  return getCigaretteItems(actor).reduce((total, item) => total + itemCigarettes(item), 0);
}

/**
 * «Выкуривает» одну сигарету: −1 заряд (или открытие новой пачки) и −1 к истощению.
 * Выполняется клиентом владельца актёра, без сокетов.
 * Заряды меняются через `system.uses.spent` — поле, которое использует dnd5e;
 * вычисляемое `value` не записывается. Штатная обработка autoDestroy dnd5e
 * срабатывает только в потоке расходования активностей, не при прямом update,
 * поэтому ротацию пачек выполняет модуль (ТЗ 3.2).
 * @param {Actor} actor  Актёр-владелец.
 * @returns {Promise<boolean>}  `true`, если операция выполнена.
 */
export async function smokeCigarette(actor) {
  if ( !actor.isOwner ) return false;
  if ( (actor.system.attributes?.exhaustion ?? 0) <= 0 ) return false;

  const item = getCigaretteItems(actor).find(i => itemCigarettes(i) > 0);
  if ( !item ) return false;

  try {
    const uses = item.system.uses;
    const quantity = item.system.quantity ?? 0;
    let updates;
    if ( (uses?.value ?? 0) > 0 ) {
      // Текущая пачка не пуста: расход ещё одного заряда.
      updates = { "system.uses.spent": uses.spent + 1 };
    } else if ( quantity > 1 ) {
      // Открываем новую пачку: quantity −1, заряды = max, затем расход одного.
      updates = { "system.quantity": quantity - 1, "system.uses.spent": 1 };
    } else {
      return false;
    }
    await item.update(updates);
    // Если сигареты закончились полностью и включена настройка — удаляем предмет.
    if ( itemCigarettes(item) === 0 && game.settings.get(MODULE_ID, SETTINGS.DELETE_EMPTY_STACK) ) {
      await item.delete();
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
