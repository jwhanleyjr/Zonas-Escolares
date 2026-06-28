export type ZoneStatus = 'No iniciada' | 'En progreso' | 'Pausada' | 'Terminada';

export type CompletionMode = 'timed' | 'task' | 'checkbox';

export type ZoneDefinition = {
  id: string;
  name: string;
  assignmentTitle: string;
  targetMinutes: number | null;
  completionMode: CompletionMode;
  linkUrl: string;
  icon: string;
  theme: string;
};

export type StudentZoneSetting = {
  zone: string;
  target_minutes: number | null;
  completion_mode: CompletionMode;
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
    completionMode: 'timed',
    linkUrl: 'https://example.com/lectura',
    icon: '📚',
    theme: 'coral',
  },
  {
    id: 'mecanografia',
    name: 'Mecanografía',
    assignmentTitle: 'Practica palabras nuevas',
    targetMinutes: 15,
    completionMode: 'timed',
    linkUrl: 'https://example.com/mecanografia',
    icon: '⌨️',
    theme: 'blue',
  },
  {
    id: 'matematicas',
    name: 'Matemáticas',
    assignmentTitle: 'Resuelve problemas cortos',
    targetMinutes: 25,
    completionMode: 'timed',
    linkUrl: 'https://example.com/matematicas',
    icon: '➕',
    theme: 'purple',
  },
  {
    id: 'clases_diversas',
    name: 'Clases Diversas',
    assignmentTitle: 'Termina tu actividad especial',
    targetMinutes: null,
    completionMode: 'task',
    linkUrl: 'https://example.com/clases-diversas',
    icon: '🎨',
    theme: 'pink',
  },
  {
    id: 'ingles',
    name: 'Inglés',
    assignmentTitle: 'Escucha y repite frases',
    targetMinutes: 15,
    completionMode: 'timed',
    linkUrl: 'https://example.com/ingles',
    icon: '🌍',
    theme: 'orange',
  },
  {
    id: 'ejercicio',
    name: 'Ejercicio',
    assignmentTitle: 'Muévete con cuidado',
    targetMinutes: null,
    completionMode: 'checkbox',
    linkUrl: 'https://example.com/ejercicio',
    icon: '🏃',
    theme: 'lime',
  },
];

const legacyZoneIds = new Map([['diverso-clases', 'clases_diversas']]);

function normalizeZoneId(zoneId: string): string {
  return legacyZoneIds.get(zoneId) ?? zoneId;
}

export function applyZoneSettings(definitions: ZoneDefinition[], settings: StudentZoneSetting[]): ZoneDefinition[] {
  const settingsByZone = new Map(settings.map((setting) => [setting.zone, setting]));
  return definitions.map((definition) => {
    const setting = settingsByZone.get(definition.id);
    if (!setting) return definition;
    return {
      ...definition,
      targetMinutes: setting.target_minutes,
      completionMode: setting.completion_mode,
    };
  });
}

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
  const savedById = new Map(savedState.zones.map((zone) => [normalizeZoneId(zone.id), { ...zone, id: normalizeZoneId(zone.id) }]));

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
