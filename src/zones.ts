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
  locked?: boolean;
};

export type StudentZoneSetting = {
  zone: string;
  target_minutes: number | null;
  completion_mode: CompletionMode;
  link_url?: string | null;
};

export type ZoneProgress = {
  id: string;
  accumulatedSeconds: number;
  status: ZoneStatus;
  lastStartedAt: number | null;
  teacherConfirmed?: boolean;
};

export type ZoneState = {
  zones: ZoneProgress[];
};

export type ServerZoneProgress = {
  zone: string;
  recorded_seconds: number | null;
  status: 'not_started' | 'in_progress' | 'paused' | 'finished';
  active_started_at: string | null;
  teacher_confirmed?: boolean | null;
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
  {
    id: 'videojuegos',
    name: 'Video Game Zone',
    assignmentTitle: 'Gana puntos para desbloquear juegos',
    targetMinutes: null,
    completionMode: 'checkbox',
    linkUrl: 'https://example.com/video-game-zone',
    icon: '🎮',
    theme: 'teal',
    locked: true,
  },
  {
    id: 'manualidades',
    name: 'Craft Zone',
    assignmentTitle: 'Gana puntos para desbloquear manualidades',
    targetMinutes: null,
    completionMode: 'checkbox',
    linkUrl: 'https://example.com/craft-zone',
    icon: '✂️',
    theme: 'mint',
    locked: true,
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
      linkUrl: setting.link_url ?? definition.linkUrl,
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
        teacherConfirmed: false,
      };
    }),
  };
}

export function reopenZone(state: ZoneState, zoneId: string): ZoneState {
  return {
    zones: state.zones.map((zone) => {
      if (zone.id !== zoneId || zone.status !== 'Terminada') return zone;

      return {
        ...zone,
        status: zone.accumulatedSeconds > 0 ? 'Pausada' : 'No iniciada',
        lastStartedAt: null,
        teacherConfirmed: false,
      };
    }),
  };
}

export function completedZoneCount(state: ZoneState, definitions: ZoneDefinition[] = zoneDefinitions): number {
  const countableZoneIds = new Set(definitions.filter((definition) => !definition.locked).map((definition) => definition.id));
  return state.zones.filter((zone) => zone.status === 'Terminada' && countableZoneIds.has(zone.id)).length;
}

function toZoneStatus(status: ServerZoneProgress['status']): ZoneStatus {
  if (status === 'in_progress') return 'En progreso';
  if (status === 'paused') return 'Pausada';
  if (status === 'finished') return 'Terminada';
  return 'No iniciada';
}

export function progressFromServer(rows: ServerZoneProgress[], definitions: ZoneDefinition[] = zoneDefinitions): ZoneState {
  const rowsById = new Map(rows.map((row) => [normalizeZoneId(row.zone), row]));

  return {
    zones: definitions.map((definition) => {
      const row = rowsById.get(definition.id);
      if (!row) {
        return {
          id: definition.id,
          accumulatedSeconds: 0,
          status: 'No iniciada',
          lastStartedAt: null,
        } satisfies ZoneProgress;
      }

      const lastStartedAt = row.active_started_at ? Date.parse(row.active_started_at) : NaN;
      return {
        id: definition.id,
        accumulatedSeconds: Number(row.recorded_seconds ?? 0),
        status: toZoneStatus(row.status),
        lastStartedAt: Number.isFinite(lastStartedAt) ? lastStartedAt : null,
        teacherConfirmed: row.teacher_confirmed === true,
      };
    }),
  };
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
