import {
  completedZoneCount,
  createInitialState,
  finishZone,
  getDisplaySeconds,
  pauseZone,
  startZone,
  type ZoneProgress,
  type ZoneState,
} from './zones.js';

const second = 1000;
const minute = 60 * second;

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function findZone(state: ZoneState, zoneId: string): ZoneProgress {
  const zone = state.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) {
    throw new Error(`Expected zone ${zoneId}`);
  }

  return zone;
}

{
  const initialState = createInitialState();
  const runningState = startZone(initialState, 'lectura', 0);
  const lectura = findZone(runningState, 'lectura');

  assertEqual(lectura.status, 'En progreso');
  assertEqual(lectura.lastStartedAt, 0);
  assertEqual(getDisplaySeconds(lectura, 5 * minute), 300);
}

{
  const initialState = createInitialState();
  const lecturaStarted = startZone(initialState, 'lectura', 0);
  const matematicasStarted = startZone(lecturaStarted, 'matematicas', 2 * minute);
  const lectura = findZone(matematicasStarted, 'lectura');
  const matematicas = findZone(matematicasStarted, 'matematicas');

  assertEqual(lectura.status, 'Pausada');
  assertEqual(lectura.accumulatedSeconds, 120);
  assertEqual(lectura.lastStartedAt, null);
  assertEqual(matematicas.status, 'En progreso');
}

{
  const initialState = createInitialState();
  const started = startZone(initialState, 'lectura', 0);
  const paused = pauseZone(started, 'lectura', 90 * second);
  const resumed = startZone(paused, 'lectura', 3 * minute);
  const lectura = findZone(resumed, 'lectura');

  assertEqual(lectura.status, 'En progreso');
  assertEqual(lectura.accumulatedSeconds, 90);
  assertEqual(getDisplaySeconds(lectura, 4 * minute), 150);
}

{
  const initialState = createInitialState();
  const started = startZone(initialState, 'ejercicio', 0);
  const finished = finishZone(started, 'ejercicio', 10 * minute);
  const ejercicio = findZone(finished, 'ejercicio');

  assertEqual(ejercicio.status, 'Terminada');
  assertEqual(ejercicio.accumulatedSeconds, 600);
  assertEqual(ejercicio.lastStartedAt, null);
  assertEqual(completedZoneCount(finished), 1);
}

console.log('Zone timer and state-transition tests passed.');
