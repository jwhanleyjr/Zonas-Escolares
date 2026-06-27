export type ZoneStatus = 'No iniciada' | 'En progreso' | 'Pausada' | 'Terminada';

export type ZoneDefinition = {
  id: string;
  name: string;
  assignmentTitle: string;
  targetMinutes: number;
  linkUrl: string;
};

export type ZoneProgress = {
  id: string;
  accumulatedSeconds: number;
  status: ZoneStatus;
  lastStartedAt: number | null;
};

export type ZoneState = {
  zones: ZoneProgress[];
};

export const zoneDefinitions: ZoneDefinition[] = [
  {
    id: 'lectura',
    name: 'Lectura',
    assignmentTitle: 'Lee tu cuento de hoy',
    targetMinutes: 20,
    linkUrl: 'https://example.com/lectura',
  },
  {
    id: 'mecanografia',
    name: 'Mecanografía',
    assignmentTitle: 'Practica palabras nuevas',
    targetMinutes: 15,
    linkUrl: 'https://example.com/mecanografia',
  },
  {
    id: 'matematicas',
    name: 'Matemáticas',
    assignmentTitle: 'Resuelve problemas cortos',
    targetMinutes: 25,
    linkUrl: 'https://example.com/matematicas',
  },
  {
    id: 'diverso-clases',
    name: 'Clases Diversas',
    assignmentTitle: 'Termina tu actividad especial',
    targetMinutes: 20,
    linkUrl: 'https://example.com/diverso-clases',
  },
  {
    id: 'ingles',
    name: 'Inglés',
    assignmentTitle: 'Escucha y repite frases',
    targetMinutes: 15,
    linkUrl: 'https://example.com/ingles',
  },
  {
    id: 'ejercicio',
    name: 'Ejercicio',
    assignmentTitle: 'Muévete con cuidado',
    targetMinutes: 10,
    linkUrl: 'https://example.com/ejercicio',
  },
];

export function createInitialState(definitions: ZoneDefinition[] = zoneDefinitions): ZoneState {
  return {
    zones: definitions.map((zone) => ({
      id: zone.id,
      accumulatedSeconds: 0,
      status: 'No iniciada',
      lastStartedAt: null,
    })),
  };
}

export function getDisplaySeconds(zone: ZoneProgress, now: number): number {
  if (zone.status !== 'En progreso' || zone.lastStartedAt === null) {
    return zone.accumulatedSeconds;
  }

  return zone.accumulatedSeconds + Math.max(0, Math.floor((now - zone.lastStartedAt) / 1000));
}

function pauseRunningZone(zone: ZoneProgress, now: number): ZoneProgress {
  if (zone.status !== 'En progreso') return zone;

  return {
    ...zone,
    accumulatedSeconds: getDisplaySeconds(zone, now),
    status: 'Pausada',
    lastStartedAt: null,
  };
}

export function startZone(state: ZoneState, zoneId: string, now: number): ZoneState {
  return {
    zones: state.zones.map((zone) => {
      if (zone.id === zoneId) {
        return {
          ...zone,
          accumulatedSeconds: getDisplaySeconds(zone, now),
          status: 'En progreso',
          lastStartedAt: now,
        };
      }

      return pauseRunningZone(zone, now);
    }),
  };
}

export function pauseZone(state: ZoneState, zoneId: string, now: number): ZoneState {
  return {
    zones: state.zones.map((zone) => {
      if (zone.id !== zoneId || zone.status !== 'En progreso') return zone;

      return pauseRunningZone(zone, now);
    }),
  };
}

export function finishZone(state: ZoneState, zoneId: string, now: number): ZoneState {
  return {
    zones: state.zones.map((zone) => {
      if (zone.id !== zoneId) return zone;

      return {
        ...zone,
        accumulatedSeconds: getDisplaySeconds(zone, now),
        status: 'Terminada',
        lastStartedAt: null,
      };
    }),
  };
}

export function completedZoneCount(state: ZoneState): number {
  return state.zones.filter((zone) => zone.status === 'Terminada').length;
}

export function mergeSavedState(savedState: ZoneState, definitions: ZoneDefinition[] = zoneDefinitions): ZoneState {
  const savedById = new Map(savedState.zones.map((zone) => [zone.id, zone]));

  return {
    zones: definitions.map((definition) => {
      const savedZone = savedById.get(definition.id);
      if (!savedZone) {
        return {
          id: definition.id,
          accumulatedSeconds: 0,
          status: 'No iniciada',
          lastStartedAt: null,
        } satisfies ZoneProgress;
      }

      return savedZone;
    }),
  };
}
