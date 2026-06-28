import { createInitialState, mergeSavedState, type ZoneState } from './zones.js';

export const storageKey = 'zonas-escolares-progress-v1';

function getStorageKey(studentId: string | null = null): string {
  return studentId ? `${storageKey}:${studentId}` : storageKey;
}

export function loadState(studentId: string | null = null): ZoneState {
  const savedValue = localStorage.getItem(getStorageKey(studentId));
  if (!savedValue) return createInitialState();

  try {
    const parsedValue = JSON.parse(savedValue) as ZoneState;
    return mergeSavedState(parsedValue);
  } catch {
    return createInitialState();
  }
}

export function saveState(state: ZoneState, studentId: string | null = null): void {
  localStorage.setItem(getStorageKey(studentId), JSON.stringify(state));
}

export function resetState(studentId: string | null = null): ZoneState {
  localStorage.removeItem(getStorageKey(studentId));
  return createInitialState();
}
