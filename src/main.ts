import { loadState, saveState } from './storage.js';
import {
  completedZoneCount,
  finishZone,
  getDisplaySeconds,
  pauseZone,
  reopenZone,
  startZone,
  type ZoneProgress,
  mergeSavedState,
  progressFromServer,
  type ServerZoneProgress,
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
let currentStudentId: string | null = null;
let currentTime = Date.now();
let studentName = 'estudiante';
const dailyGoal = 6;
type WeeklyProgressRow = { status?: string | null; teacher_confirmed?: boolean | null };
type WeeklyProgressSummary = { weekStart?: string; weekEnd?: string; progress: WeeklyProgressRow[] };
let weeklyProgress: WeeklyProgressSummary = { progress: [] };

const prizeMilestones = [
  { points: 5, label: 'Caja especial' },
  { points: 10, label: 'Merienda especial' },
  { points: 15, label: 'Manualidades' },
  { points: 20, label: 'Videojuegos' },
  { points: 25, label: 'Actividad especial' },
];
const weeklyPrizeMaxPoints = 30;

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
  if (zone.status === 'Terminada') return '⏱️ Trabajar más';
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
  saveState(state, currentStudentId);
  render();
}

async function syncProgress(action: string, zoneId: string): Promise<void> {
  try {
    const response = await fetch('/api/student-progress', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, zone: zoneId }),
    });
    if (!response.ok) throw new Error(`Progress save failed: ${response.status}`);
    const data = (await response.json()) as { progress?: unknown; weeklyProgress?: unknown };
    if (Array.isArray(data.progress)) {
      state = progressFromServer(data.progress as ServerZoneProgress[], activeZoneDefinitions);
      saveState(state, currentStudentId);
    }
    weeklyProgress = parseWeeklyProgress(data.weeklyProgress);
    render();
  } catch (error) {
    console.error(error);
  }
}

function handlePrimaryAction(zone: ZoneProgress): void {
  const now = Date.now();
  if (zone.status === 'En progreso') {
    updateState(pauseZone(state, zone.id, now));
    void syncProgress('pause', zone.id);
    return;
  }

  updateState(startZone(state, zone.id, now));
  void syncProgress('start', zone.id);
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

function renderCompletionControl(definition: ZoneDefinition, zone: ZoneProgress, progressPercent: number): string {
  const isFinished = zone.status === 'Terminada';

  if (definition.locked) {
    return `
      <div class="locked-panel" aria-label="Zona bloqueada">
        <span aria-hidden="true">🔒</span>
        <strong>Bloqueada</strong>
        <small>Gana puntos para abrir esta zona.</small>
      </div>
    `;
  }

  if (isFinished) {
    return `
      <div class="done-stamp" aria-label="Zona completada por hoy">
        <span aria-hidden="true">✅</span>
        <strong>¡Lista por hoy!</strong>
      </div>
    `;
  }
  if (definition.completionMode === 'checkbox') {
    return `
      <label class="checkbox-finish ${isFinished ? 'checkbox-finish--checked' : ''}" data-action="finish" data-zone-id="${zone.id}">
        <input type="checkbox" ${isFinished ? 'checked disabled' : ''}>
        <span>✅ Ya lo hice</span>
      </label>
    `;
  }

  return `
    <div class="progress-ring" style="--progress: ${progressPercent}%" aria-label="${progressPercent}% de la meta registrada">
      <span>${progressPercent}%</span>
    </div>
  `;
}

function renderZoneActions(definition: ZoneDefinition, zone: ZoneProgress): string {
  const isFinished = zone.status === 'Terminada';

  if (definition.locked) {
    return `
      <div class="zone-actions">
        <button class="locked-action" type="button" disabled>🔒 Necesita puntos</button>
      </div>
    `;
  }

  if (isFinished) {
    const returnAction = definition.completionMode === 'checkbox' ? 'reopen' : 'primary';
    const returnLabel = definition.completionMode === 'checkbox' ? '↩️ Volver a abrir' : '↩️ Volver y trabajar más';

    return `
      <div class="zone-actions zone-actions--finished">
        <button class="primary-action primary-action--more-time" type="button" data-action="${returnAction}" data-zone-id="${zone.id}">
          ${returnLabel}
        </button>
        <a class="assignment-link" href="${escapeHtml(definition.linkUrl)}" target="_blank" rel="noopener noreferrer">
          📂 Abrir tarea
        </a>
      </div>
    `;
  }

  if (definition.completionMode === 'checkbox') {
    return `
      <div class="zone-actions zone-actions--checkbox">
        <a class="assignment-link" href="${escapeHtml(definition.linkUrl)}" target="_blank" rel="noopener noreferrer">
          📂 Abrir tarea
        </a>
      </div>
    `;
  }

  return `
    <div class="zone-actions">
      <button class="primary-action" type="button" data-action="primary" data-zone-id="${zone.id}">
        ${getActionLabel(zone)}
      </button>
      <button class="done-action" type="button" data-action="finish" data-zone-id="${zone.id}" ${isFinished ? 'disabled' : ''}>
        ✅ Terminé
      </button>
      <a class="assignment-link" href="${escapeHtml(definition.linkUrl)}" target="_blank" rel="noopener noreferrer">
        📂 Abrir tarea
      </a>
    </div>
  `;
}

function renderProgressStars(completed: number): string {
  return Array.from({ length: dailyGoal }, (_, index) => `<span class="star ${index < completed ? 'star--filled' : ''}" aria-hidden="true">★</span>`).join('');
}

function parseWeeklyProgress(value: unknown): WeeklyProgressSummary {
  if (!value || typeof value !== 'object') return { progress: [] };
  const candidate = value as { weekStart?: unknown; weekEnd?: unknown; progress?: unknown };
  const summary: WeeklyProgressSummary = { progress: Array.isArray(candidate.progress) ? candidate.progress as WeeklyProgressRow[] : [] };
  if (typeof candidate.weekStart === 'string') summary.weekStart = candidate.weekStart;
  if (typeof candidate.weekEnd === 'string') summary.weekEnd = candidate.weekEnd;
  return summary;
}

function confirmedZoneCount(): number {
  return weeklyProgress.progress.filter((zone) => zone.status === 'finished' && zone.teacher_confirmed === true).length;
}

function weeklyFinishedZoneCount(): number {
  return weeklyProgress.progress.filter((zone) => zone.status === 'finished').length;
}

function renderPrizeMilestones(): string {
  return prizeMilestones
    .map((milestone) => {
      const position = (milestone.points / weeklyPrizeMaxPoints) * 100;
      return `
        <span class="weekly-bar__marker" style="left: ${position}%">
          <span class="weekly-bar__marker-line" aria-hidden="true"></span>
          <span class="weekly-bar__marker-label">${milestone.points}</span>
        </span>
      `;
    })
    .join('');
}

function renderPrizeKey(): string {
  return prizeMilestones
    .map((milestone) => `<span><strong>${milestone.points}</strong> ${milestone.label}</span>`)
    .join('');
}

function renderWeeklyPoints(): string {
  const confirmedPoints = Math.min(confirmedZoneCount(), weeklyPrizeMaxPoints);
  const pendingPoints = Math.min(weeklyFinishedZoneCount(), weeklyPrizeMaxPoints);
  const confirmedPercent = (confirmedPoints / weeklyPrizeMaxPoints) * 100;
  const pendingPercent = (pendingPoints / weeklyPrizeMaxPoints) * 100;

  return `
    <section class="weekly-panel" aria-label="Puntos de la semana">
      <div class="weekly-panel__header">
        <div>
          <p class="weekly-panel__eyebrow">⭐ Puntos de la semana</p>
          <h2>${pendingPoints} de 25 puntos</h2>
          <p>Meta: 25 puntos. Máximo: 30 puntos.</p>
        </div>
        <div class="reward-box" aria-label="Recompensas">
          <strong>🎁 Premios</strong>
          <span>5 Caja</span>
          <span>10 Merienda</span>
          <span>15 Manualidades</span>
          <span>20 Videojuegos</span>
          <span>25 Actividad</span>
        </div>
      </div>
      <div class="weekly-bar" aria-hidden="true">
        <span class="weekly-bar__confirmed" style="width: ${confirmedPercent}%"></span>
        <span class="weekly-bar__pending" style="width: ${pendingPercent}%"></span>
        ${renderPrizeMilestones()}
      </div>
      <div class="prize-key" aria-label="Premios por puntos">
        ${renderPrizeKey()}
      </div>
      <div class="weekly-legend">
        <span><i class="legend-dot legend-dot--confirmed"></i> Confirmados</span>
        <span><i class="legend-dot legend-dot--pending"></i> Terminados, esperando revisión</span>
      </div>
    </section>
  `;
}

function renderZoneCard(zone: ZoneProgress): string {
  const definition = activeZoneDefinitions.find((candidate) => candidate.id === zone.id);
  if (!definition) return '';

  const displaySeconds = getDisplaySeconds(zone, currentTime);
  const isRunning = zone.status === 'En progreso';
  const isFinished = zone.status === 'Terminada';
  const progressPercent = getProgressPercent(displaySeconds, definition.targetMinutes);

  return `
    <details class="zone-card zone-card--${definition.theme} ${isRunning ? 'zone-card--active' : ''} ${isFinished ? 'zone-card--finished' : ''} ${definition.locked ? 'zone-card--locked' : ''}" aria-label="Zona ${definition.name}" ${isRunning || isFinished ? 'open' : ''}>
      <summary class="zone-card__summary">
        <span class="zone-card__stripe" aria-hidden="true"></span>
        <span class="zone-card__top">
          <span class="zone-icon" aria-hidden="true">${definition.icon}</span>
          <span>
            <span class="zone-title">${definition.name}</span>
            <span class="assignment">${definition.assignmentTitle}</span>
          </span>
        </span>
        <span class="compact-status">
          ${definition.locked ? '🔒 Bloqueada' : getStatusLabel(zone)}
        </span>
        ${isFinished ? '<span class="compact-done" aria-label="Tarea terminada">✅ Completada</span>' : ''}
        <span class="expand-hint">Toca para abrir</span>
      </summary>
      ${isRunning ? '<p class="active-badge">🔥 Estoy aquí</p>' : ''}
      ${isFinished ? `<p class="confetti-badge" aria-label="Zona terminada">${zone.teacherConfirmed ? '⭐ Punto confirmado.' : '✅ Tarea completada. Esperando revisión para confirmar el punto.'}</p>` : ''}
      ${renderCompletionControl(definition, zone, progressPercent)}
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
      ${renderZoneActions(definition, zone)}
    </details>
  `;
}

function render(): void {
  currentTime = Date.now();
  const completed = Math.min(completedZoneCount(state, activeZoneDefinitions), dailyGoal);

  app.innerHTML = `
    <main class="page-shell">
      <section class="hero" aria-labelledby="page-title">
        <div>
          <p class="hero__label">👋 ¡Hola, ${escapeHtml(studentName)}!</p>
          <h1 id="page-title">☀️ Mis zonas de hoy</h1>
          <p class="hero__date">Hoy es ${formatStudentDate(new Date(currentTime))}</p>
          <p class="hero__text">Puedes empezar cualquier zona. Si empiezas otra, la zona activa se pausa sola.</p>
        </div>
        <div class="progress-summary" aria-live="polite" aria-label="${completed} de ${dailyGoal} zonas terminadas">
          <span class="trophy" aria-hidden="true">🏆</span>
          <strong>${completed} de ${dailyGoal}</strong>
          <span>zonas terminadas</span>
          <div class="star-road">${renderProgressStars(completed)}</div>
        </div>
      </section>

      ${renderWeeklyPoints()}

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

  const definition = activeZoneDefinitions.find((candidate) => candidate.id === zoneId);
  if (definition?.locked) return;

  if (action === 'primary') {
    handlePrimaryAction(zone);
  }

  if (action === 'finish') {
    updateState(finishZone(state, zoneId, Date.now()));
    void syncProgress('finish', zoneId);
  }

  if (action === 'reopen') {
    updateState(reopenZone(state, zoneId));
    void syncProgress('reopen', zoneId);
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

    const data = (await response.json()) as { displayName?: unknown; studentId?: unknown; zoneSettings?: unknown };
    if (typeof data.displayName !== 'string') return;

    const displayName = data.displayName.trim();
    if (!displayName) return;

    studentName = displayName;
    currentStudentId = typeof data.studentId === 'string' ? data.studentId : null;
    state = loadState(currentStudentId);

    if (Array.isArray(data.zoneSettings)) {
      activeZoneDefinitions = applyZoneSettings(zoneDefinitions, data.zoneSettings as StudentZoneSetting[]);
      state = mergeSavedState(state, activeZoneDefinitions);
      saveState(state, currentStudentId);
    }

    await loadServerProgress();

    render();
  } catch (error) {
    console.error(error);
  }
}

async function loadServerProgress(): Promise<void> {
  try {
    const response = await fetch('/api/student-progress', { credentials: 'same-origin' });
    if (!response.ok) return;

    const data = (await response.json()) as { progress?: unknown; weeklyProgress?: unknown };
    if (!Array.isArray(data.progress)) return;

    state = progressFromServer(data.progress as ServerZoneProgress[], activeZoneDefinitions);
    weeklyProgress = parseWeeklyProgress(data.weeklyProgress);
    saveState(state, currentStudentId);
  } catch (error) {
    console.error(error);
  }
}

render();
void loadStudentName();
