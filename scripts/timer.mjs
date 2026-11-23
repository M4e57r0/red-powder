/**
 * Таймер панели истощения: отсчёт, срабатывание, восстановление после перезагрузки.
 * @module red-powder/timer
 */

import { MODULE_ID, PANEL_ID, SETTINGS, TIMER_MODES } from "./constants.mjs";
import { applyExhaustion, EXHAUSTION_REASONS } from "./exhaustion.mjs";

/** Идентификатор интервала отсчёта (реальное время). */
let realIntervalId = null;

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
 * Интервал в единицах режима таймера.
 * @returns {number}
 */
function durationInModeUnit() {
  const state = getTimerState();
  const minutes = state.unit === "hours" ? state.interval * 60 : state.interval;
  return state.mode === TIMER_MODES.GAME ? minutes * 60 : minutes * 60 * 1000;
}

/**
 * Оставшееся время в единицах режима таймера.
 * @returns {number}
 */
export function getTimerRemaining() {
  const state = getTimerState();
  if ( state.running ) return state.endsAt - now();
  if ( state.pausedRemaining != null ) return state.pausedRemaining;
  return durationInModeUnit();
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
  state.endsAt = now() + (state.pausedRemaining ?? durationInModeUnit());
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
  const restart = state.running && ("interval" in partial || "unit" in partial || "mode" in partial);
  if ( restart ) state.endsAt = now() + durationInModeUnit();
  await setTimerState(state);
  startCountdown();
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
 * @returns {Promise<void>}
 */
async function triggerTimer() {
  const state = getTimerState();
  await applyExhaustionToAll(EXHAUSTION_REASONS.TIMER, 1);
  if ( state.repeat ) {
    state.endsAt = now() + durationInModeUnit();
    state.running = true;
  } else {
    state.endsAt = null;
    state.running = false;
  }
  await setTimerState(state);
  startCountdown();
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
  const el = panel.element.querySelector("[data-timer-display]");
  if ( el ) el.textContent = formatTime(getTimerRemaining());
}

/* -------------------------------------------- */

/**
 * Проверяет пропущенное срабатывание при загрузке.
 * @returns {Promise<void>}
 */
async function checkMissedTrigger() {
  const state = getTimerState();
  if ( !state.running ) return;
  if ( state.endsAt - now() <= 0 ) {
    await triggerTimer();
    ui.notifications.info(game.i18n.localize("REDPOWDER.Timer.Missed"));
  }
}

/**
 * Регистрирует хуки таймера.
 * @returns {void}
 */
export function registerTimerHooks() {
  Hooks.on("updateWorldTime", () => {
    const state = getTimerState();
    if ( state.running && state.mode === TIMER_MODES.GAME ) tick();
  });
  Hooks.once("ready", () => {
    if ( !game.user.isGM ) return;
    checkMissedTrigger();
    startCountdown();
  });
}
