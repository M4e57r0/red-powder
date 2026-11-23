/**
 * Логика истощения: применение, ограничения, сообщения в чат.
 * @module red-powder/exhaustion
 */

import { CHAT_MODES, MODULE_ID, SETTINGS } from "./constants.mjs";

/** Причины изменения истощения. */
export const EXHAUSTION_REASONS = {
  TIMER: "timer",
  MANUAL: "manual",
  CIGARETTE: "cigarette"
};

/**
 * Возвращает эффективный максимум уровня истощения.
 * @returns {number}
 */
export function getMaxExhaustion() {
  const max = game.settings.get(MODULE_ID, SETTINGS.MAX_EXHAUSTION);
  const allowSixth = game.settings.get(MODULE_ID, SETTINGS.ALLOW_SIXTH_LEVEL);
  return allowSixth ? max : Math.min(max, 5);
}

/**
 * Применяет изменение уровня истощения к актёру.
 * Использует штатный механизм dnd5e: запись в `system.attributes.exhaustion`,
 * система сама синхронизирует ActiveEffect (статус-эффект).
 * @param {Actor} actor  Актёр.
 * @param {number} delta  Изменение уровня (например, +1 или -1).
 * @param {object} [options]
 * @param {string} [options.reason=EXHAUSTION_REASONS.MANUAL]  Причина изменения.
 * @returns {Promise<number|null>}  Новый уровень, или null, если изменение не применено.
 */
export async function applyExhaustion(actor, delta, { reason = EXHAUSTION_REASONS.MANUAL } = {}) {
  const current = actor.system.attributes?.exhaustion ?? 0;
  const next = current + delta;
  if ( next === current ) return null;

  const max = getMaxExhaustion();
  if ( next > max ) {
    if ( delta > 0 && game.user.isGM ) {
      ui.notifications.warn(game.i18n.format("REDPOWDER.Exhaustion.MaxReached", { name: actor.name, max }));
    }
    return null;
  }
  if ( next < 0 ) return null;

  await actor.update({ "system.attributes.exhaustion": next });
  await postExhaustionMessage(actor, current, next, reason);
  return next;
}

/**
 * Публикует сообщение об изменении истощения в чат.
 * @param {Actor} actor  Актёр.
 * @param {number} from  Предыдущий уровень.
 * @param {number} to  Новый уровень.
 * @param {string} reason  Причина изменения.
 * @returns {Promise<void>}
 */
async function postExhaustionMessage(actor, from, to, reason) {
  const mode = game.settings.get(MODULE_ID, SETTINGS.CHAT_MODE);
  if ( mode === CHAT_MODES.OFF ) return;

  const reasonLabel = game.i18n.localize(`REDPOWDER.Exhaustion.Reason.${reason.titleCase()}`);
  const content = game.i18n.format("REDPOWDER.Exhaustion.Message", {
    name: actor.name,
    from,
    to,
    reason: reasonLabel
  });

  await ChatMessage.create({
    content,
    user: game.user.id,
    rollMode: mode === CHAT_MODES.GM ? CONST.DICE_ROLL_MODES.GM : CONST.DICE_ROLL_MODES.PUBLIC
  });
}
