import { createInitialState, mergeSavedState, type ZoneState } from './zones.js';

export const storageKey = 'zonas-escolares-progress-v1';

export function loadState(): ZoneState {
  const savedValue = localStorage.getItem(storageKey);
  if (!savedValue) return createInitialState();

  try {
    const parsedValue = JSON.parse(savedValue) as ZoneState;
    return mergeSavedState(parsedValue);
  } catch {
    return createInitialState();
  }
}

export function saveState(state: ZoneState): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resetState(): ZoneState {
  localStorage.removeItem(storageKey);
  return createInitialState();
}
