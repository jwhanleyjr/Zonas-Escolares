import { loadState, saveState } from './storage.js';
import {
  completedZoneCount,
  finishZone,
  getDisplaySeconds,
  pauseZone,
  startZone,
  type ZoneProgress,
  mergeSavedState,
  type StudentZoneSetting,
  type ZoneDefinition,
  type ZoneState,
  applyZoneSettings,
  zoneDefinitions,
} from './zones.js';

const appElement = document.querySelector<HTMLDivElement>('#app');

if (!appElement) {
  throw new Error('No se encontró la aplicación.');
}

const app = appElement;

let activeZoneDefinitions: ZoneDefinition[] = zoneDefinitions;
let state = loadState();
let currentTime = Date.now();
let studentName = 'estudiante';

const monthNames = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMinutes(seconds: number): string {
  return `${Math.floor(seconds / 60)} min`;
}

function formatStudentDate(date: Date): string {
  return `${date.getDate()} ${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
}

function getActionLabel(zone: ZoneProgress): string {
  if (zone.status === 'En progreso') return '⏸️ Pausar';
  if (zone.status === 'Terminada') return '🔁 Revisar';
  return '▶️ Empezar';
}

function getStatusLabel(zone: ZoneProgress): string {
  if (zone.status === 'En progreso') return '🟢 En progreso';
  if (zone.status === 'Pausada') return '⏸️ Pausada';
  if (zone.status === 'Terminada') return '⭐ Terminada';
  return '✨ No iniciada';
}

function updateState(nextState: ZoneState): void {
  state = nextState;
  saveState(state);
  render();
}

function handlePrimaryAction(zone: ZoneProgress): void {
  const now = Date.now();
  if (zone.status === 'En progreso') {
    updateState(pauseZone(state, zone.id, now));
    return;
  }

  updateState(startZone(state, zone.id, now));
}

function getProgressPercent(displaySeconds: number, targetMinutes: number | null): number {
  if (targetMinutes === null) return 0;
  const targetSeconds = targetMinutes * 60;
  if (targetSeconds <= 0) return 0;
  return Math.min(100, Math.round((displaySeconds / targetSeconds) * 100));
}

function getTargetLabel(definition: ZoneDefinition): string {
  if (definition.completionMode === 'task') return 'Tarea';
  if (definition.completionMode === 'checkbox') return 'Marca';
  if (definition.targetMinutes === null) return 'Sin meta';
  return `${definition.targetMinutes} min`;
}

function getModeLabel(definition: ZoneDefinition): string {
  if (definition.completionMode === 'task') return 'Tarea';
  if (definition.completionMode === 'checkbox') return 'Marca';
  return 'Tiempo';
}

function renderProgressStars(completed: number): string {
  return activeZoneDefinitions
    .map((_, index) => `<span class="star ${index < completed ? 'star--filled' : ''}" aria-hidden="true">★</span>`)
    .join('');
}

function renderZoneCard(zone: ZoneProgress): string {
  const definition = activeZoneDefinitions.find((candidate) => candidate.id === zone.id);
  if (!definition) return '';

  const displaySeconds = getDisplaySeconds(zone, currentTime);
  const isRunning = zone.status === 'En progreso';
  const isFinished = zone.status === 'Terminada';
  const progressPercent = getProgressPercent(displaySeconds, definition.targetMinutes);

  return `
    <article class="zone-card zone-card--${definition.theme} ${isRunning ? 'zone-card--active' : ''} ${isFinished ? 'zone-card--finished' : ''}" aria-label="Zona ${definition.name}">
      <div class="zone-card__stripe" aria-hidden="true"></div>
      <div class="zone-card__top">
        <span class="zone-icon" aria-hidden="true">${definition.icon}</span>
        <div>
          <h2>${definition.name}</h2>
          <p class="assignment">${definition.assignmentTitle}</p>
        </div>
      </div>
      ${isRunning ? '<p class="active-badge">🔥 Estoy aquí</p>' : ''}
      ${isFinished ? '<p class="confetti-badge" aria-label="Zona terminada">✨ ¡Buen trabajo! ✨</p>' : ''}
      <div class="progress-ring" style="--progress: ${progressPercent}%" aria-label="${progressPercent}% de la meta registrada">
        <span>${progressPercent}%</span>
      </div>
      <dl class="zone-details">
        <div>
          <dt>🎯 Meta</dt>
          <dd>${getTargetLabel(definition)}</dd>
        </div>
        <div>
          <dt>⏱️ Tiempo</dt>
          <dd>${formatMinutes(displaySeconds)}</dd>
        </div>
        <div>
          <dt>Modo</dt>
          <dd>${getModeLabel(definition)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd><span class="status status--${zone.status.toLowerCase().replaceAll(' ', '-')}">${getStatusLabel(zone)}</span></dd>
        </div>
      </dl>
      <div class="zone-actions">
        <button class="primary-action" type="button" data-action="primary" data-zone-id="${zone.id}">
          ${getActionLabel(zone)}
        </button>
        <button class="done-action" type="button" data-action="finish" data-zone-id="${zone.id}" ${isFinished ? 'disabled' : ''}>
          ✅ Terminé
        </button>
        <a class="assignment-link" href="${definition.linkUrl}" target="_blank" rel="noopener noreferrer">
          📂 Abrir tarea
        </a>
      </div>
    </article>
  `;
}

function render(): void {
  currentTime = Date.now();
  const completed = completedZoneCount(state);

  app.innerHTML = `
    <main class="page-shell">
      <section class="hero" aria-labelledby="page-title">
        <div>
          <p class="hero__label">👋 ¡Hola, ${escapeHtml(studentName)}!</p>
          <h1 id="page-title">☀️ Mis zonas de hoy</h1>
          <p class="hero__date">Hoy es ${formatStudentDate(new Date(currentTime))}</p>
          <p class="hero__text">Puedes empezar cualquier zona. Si empiezas otra, la zona activa se pausa sola.</p>
        </div>
        <div class="progress-summary" aria-live="polite" aria-label="${completed} de ${activeZoneDefinitions.length} zonas terminadas">
          <span class="trophy" aria-hidden="true">🏆</span>
          <strong>${completed} de ${activeZoneDefinitions.length}</strong>
          <span>zonas terminadas</span>
          <div class="star-road">${renderProgressStars(completed)}</div>
        </div>
      </section>

      <section class="zone-grid" aria-label="Zonas de trabajo">
        ${state.zones.map(renderZoneCard).join('')}
      </section>

      <section class="helper-panel" aria-label="Ayuda">
        <p>Tu tiempo es <strong>recorded work time</strong>. Tu maestra o maestro revisa si la tarea está completa.</p>
        <form method="post" action="/api/auth/logout">
          <button class="logout-button" type="submit">🚪 Salir</button>
        </form>
      </section>
    </main>
  `;
}

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const actionElement = target.closest<HTMLElement>('[data-action]');
  if (!actionElement) return;

  const action = actionElement.dataset.action;
  const zoneId = actionElement.dataset.zoneId;

  if (!zoneId) return;

  const zone = state.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) return;

  if (action === 'primary') {
    handlePrimaryAction(zone);
  }

  if (action === 'finish') {
    updateState(finishZone(state, zoneId, Date.now()));
  }
});

setInterval(() => {
  if (state.zones.some((zone) => zone.status === 'En progreso')) {
    render();
  }
}, 1000);

async function loadStudentName(): Promise<void> {
  try {
    const response = await fetch('/api/auth/student', { credentials: 'same-origin' });
    if (!response.ok) return;

    const data = (await response.json()) as { displayName?: unknown; zoneSettings?: unknown };
    if (typeof data.displayName !== 'string') return;

    const displayName = data.displayName.trim();
    if (!displayName) return;

    studentName = displayName;

    if (Array.isArray(data.zoneSettings)) {
      activeZoneDefinitions = applyZoneSettings(zoneDefinitions, data.zoneSettings as StudentZoneSetting[]);
      state = mergeSavedState(state, activeZoneDefinitions);
      saveState(state);
    }

    render();
  } catch (error) {
    console.error(error);
  }
}

render();
void loadStudentName();
