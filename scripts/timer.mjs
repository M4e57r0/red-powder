/**
 * Таймер панели истощения: отсчёт, срабатывание, восстановление после перезагрузки.
 * @module red-powder/timer
 */

import { MODULE_ID, PANEL_ID, SETTINGS, TIMER_MODES, TIMER_UNITS } from "./constants.mjs";
import { applyExhaustion, EXHAUSTION_REASONS } from "./exhaustion.mjs";

/** Идентификатор интервала отсчёта (реальное время). */
let realIntervalId = null;

/** Защита от повторного срабатывания, пока предыдущее ещё выполняется. */
let triggering = false;

/**
 * Возвращает состояние таймера.
 * @returns {object}
 */
export function getTimerState() {
  return game.settings.get(MODULE_ID, SETTINGS.TIMER_STATE) ?? {};
}

/**
 * Сохраняет состояние таймера.
 * @param {object} state  Новое состояние.
 * @returns {Promise<void>}
 */
async function setTimerState(state) {
  await game.settings.set(MODULE_ID, SETTINGS.TIMER_STATE, state);
}

/**
 * Текущее время в единицах режима таймера (мс для реального, секунды для игрового).
 * @returns {number}
 */
function now() {
  return getTimerState().mode === TIMER_MODES.GAME ? game.time.worldTime : Date.now();
}

/**
 * Длительность интервала в единицах режима таймера.
 * @param {object} [state]  Состояние таймера (по умолчанию — текущее).
 * @returns {number}
 */
function durationInModeUnit(state = getTimerState()) {
  const minutes = state.unit === TIMER_UNITS.HOURS ? state.interval * 60 : state.interval;
  return state.mode === TIMER_MODES.GAME ? minutes * 60 : minutes * 60 * 1000;
}

/**
 * Оставшееся время в единицах режима таймера.
 * @returns {number}
 */
export function getTimerRemaining() {
  const state = getTimerState();
  if ( state.running ) return Math.max(0, state.endsAt - now());
  if ( state.pausedRemaining != null ) return state.pausedRemaining;
  return durationInModeUnit(state);
}

/**
 * Форматирует оставшееся время в ЧЧ:ММ:СС.
 * @param {number} remaining  Оставшееся время в единицах режима.
 * @returns {string}
 */
export function formatTime(remaining) {
  const totalSeconds = Math.max(0, Math.floor(getTimerState().mode === TIMER_MODES.GAME ? remaining : remaining / 1000));
  const pad = n => String(n).padStart(2, "0");
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Запускает (или возобновляет) таймер.
 * @returns {Promise<void>}
 */
export async function startTimer() {
  const state = getTimerState();
  if ( state.running ) return;
  state.endsAt = now() + (state.pausedRemaining ?? durationInModeUnit(state));
  state.pausedRemaining = null;
  state.running = true;
  await setTimerState(state);
  startCountdown();
}

/**
 * Ставит таймер на паузу.
 * @returns {Promise<void>}
 */
export async function pauseTimer() {
  const state = getTimerState();
  if ( !state.running ) return;
  state.pausedRemaining = Math.max(0, state.endsAt - now());
  state.endsAt = null;
  state.running = false;
  await setTimerState(state);
  stopCountdown();
}

/**
 * Сбрасывает таймер.
 * @returns {Promise<void>}
 */
export async function resetTimer() {
  const state = getTimerState();
  state.running = false;
  state.endsAt = null;
  state.pausedRemaining = null;
  await setTimerState(state);
  stopCountdown();
}

/**
 * Обновляет конфигурацию таймера (интервал, единица, режим, повтор).
 * @param {object} partial  Поля для обновления.
 * @returns {Promise<void>}
 */
export async function updateTimerConfig(partial) {
  const state = getTimerState();
  Object.assign(state, partial);
  const timingChanged = ("interval" in partial) || ("unit" in partial) || ("mode" in partial);
  if ( timingChanged ) {
    // Пересчитываем отсчёт под новую длительность, сохраняя статус (идёт/пауза).
    if ( state.running ) state.endsAt = now() + durationInModeUnit(state);
    else if ( state.pausedRemaining != null ) state.pausedRemaining = durationInModeUnit(state);
  }
  await setTimerState(state);
  startCountdown();
  updateTimerDisplay();
}

/**
 * Применяет истощение всем актёрам панели.
 * @param {string} reason  Причина изменения.
 * @param {number} delta  Изменение уровня.
 * @returns {Promise<void>}
 */
export async function applyExhaustionToAll(reason, delta) {
  const uuids = game.settings.get(MODULE_ID, SETTINGS.PANEL_ACTORS) ?? [];
  for ( const uuid of uuids ) {
    const actor = await fromUuid(uuid);
    if ( !actor ) continue;
    await applyExhaustion(actor, delta, { reason });
  }
}

/**
 * Срабатывание таймера: применяет истощение и перезапускает (или останавливает).
 * Защищено от повторного входа, пока предыдущее срабатывание не завершилось.
 * @returns {Promise<void>}
 */
async function triggerTimer() {
  if ( triggering ) return;
  triggering = true;
  try {
    const state = getTimerState();
    await applyExhaustionToAll(EXHAUSTION_REASONS.TIMER, 1);
    if ( state.repeat ) {
      state.endsAt = now() + durationInModeUnit(state);
      state.pausedRemaining = null;
      state.running = true;
    } else {
      state.endsAt = null;
      state.pausedRemaining = null;
      state.running = false;
    }
    await setTimerState(state);
    startCountdown();
  } finally {
    triggering = false;
  }
}

/* -------------------------------------------- */
/*  Цикл отсчёта                                */
/* -------------------------------------------- */

/**
 * Запускает цикл отсчёта (только для реального времени; игровое — через хук).
 * @returns {void}
 */
function startCountdown() {
  stopCountdown();
  const state = getTimerState();
  if ( state.running && state.mode === TIMER_MODES.REAL ) {
    realIntervalId = setInterval(tick, 1000);
    tick();
  }
}

/**
 * Останавливает цикл отсчёта.
 * @returns {void}
 */
function stopCountdown() {
  if ( realIntervalId != null ) {
    clearInterval(realIntervalId);
    realIntervalId = null;
  }
}

/**
 * Шаг отсчёта: обновляет отображение и проверяет срабатывание.
 * @returns {void}
 */
function tick() {
  const state = getTimerState();
  if ( !state.running ) return;
  updateTimerDisplay();
  if ( state.endsAt - now() <= 0 ) triggerTimer();
}

/**
 * Обновляет отображение оставшегося времени в открытой панели.
 * @returns {void}
 */
function updateTimerDisplay() {
  const panel = foundry.applications.instances.get(PANEL_ID);
  if ( !panel ) return;
  const el = panel.element?.querySelector("[data-timer-display]");
  if ( el ) el.textContent = formatTime(getTimerRemaining());
}

/* -------------------------------------------- */

/**
 * Проверяет пропущенное срабатывание при загрузке.
 * Если срок уже истёк, применяет ровно одно срабатывание и перезапускает таймер.
 * @returns {Promise<void>}
 */
async function checkMissedTrigger() {
  const state = getTimerState();
  if ( !state.running ) return;
  if ( state.endsAt - now() <= 0 ) {
    // Гарантируем ровно одно срабатывание независимо от настройки «Повторять».
    const repeat = state.repeat;
    state.repeat = true;
    await setTimerState(state);
    await triggerTimer();
    const after = getTimerState();
    after.repeat = repeat;
    await setTimerState(after);
    ui.notifications.info(game.i18n.localize("REDPOWDER.Timer.Missed"));
  }
}

/**
 * Регистрирует хуки таймера.
 * @returns {void}
 */
export function registerTimerHooks() {
  Hooks.on("updateWorldTime", () => {
    if ( !game.user.isGM ) return;
    const state = getTimerState();
    if ( state.running && state.mode === TIMER_MODES.GAME ) tick();
  });
  Hooks.once("ready", async () => {
    if ( !game.user.isGM ) return;
    await checkMissedTrigger();
    startCountdown();
  });
}
