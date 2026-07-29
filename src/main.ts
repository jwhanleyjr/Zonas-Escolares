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
  type WeeklyProgressRow,
  summarizeWeeklyProgress,
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
let currentProfileId: string | null = null;
let currentTime = Date.now();
let studentName = 'estudiante';
const dailyGoal = 6;
type WeeklyPrizeAward = { week_start?: string | null; points?: number | null; label?: string | null; redeemed?: boolean | null };
type WeeklyProgressSummary = { weekStart?: string; weekEnd?: string; progress: WeeklyProgressRow[]; prizeAwards: WeeklyPrizeAward[] };
let weeklyProgress: WeeklyProgressSummary = { progress: [], prizeAwards: [] };
type StudentMessage = { id: string; student_id: string; sender_profile_id: string; body: string; created_at: string; read_at: string | null };
let messages: StudentMessage[] = [];
let messageDraft = '';
let messageStatus = '';
let messagesLoading = false;
let messagesOpen = false;
let openZoneId: string | null = null;

const prizeMilestones = [
  { points: 5, label: 'Caja especial', unlocksZone: false },
  { points: 10, label: 'Merienda especial', unlocksZone: false },
  { points: 15, label: 'Manualidades', unlocksZone: true },
  { points: 20, label: 'Videojuegos', unlocksZone: true },
  { points: 25, label: 'Actividad especial', unlocksZone: false },
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
    const nextWeeklyProgress = parseWeeklyProgress(data.weeklyProgress);
    if (nextWeeklyProgress) weeklyProgress = nextWeeklyProgress;
    render();
  } catch (error) {
    console.error(error);
  }
}

function handlePrimaryAction(zone: ZoneProgress): void {
  const now = Date.now();
  openZoneId = zone.id;
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

function parseWeeklyProgress(value: unknown): WeeklyProgressSummary | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { weekStart?: unknown; weekEnd?: unknown; progress?: unknown; prizeAwards?: unknown };
  if (!Array.isArray(candidate.progress)) return null;
  const summary: WeeklyProgressSummary = {
    progress: candidate.progress as WeeklyProgressRow[],
    prizeAwards: Array.isArray(candidate.prizeAwards) ? candidate.prizeAwards as WeeklyPrizeAward[] : [],
  };
  if (typeof candidate.weekStart === 'string') summary.weekStart = candidate.weekStart;
  if (typeof candidate.weekEnd === 'string') summary.weekEnd = candidate.weekEnd;
  return summary;
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

function renderPrizeKey(confirmedPoints: number): string {
  const currentWeekAwards = weeklyProgress.prizeAwards.filter((award) => award.week_start === weeklyProgress.weekStart);
  const redeemedPoints = new Set(currentWeekAwards.filter((award) => award.redeemed === true).map((award) => Number(award.points)));
  return prizeMilestones
    .map((milestone) => {
      const earned = confirmedPoints >= milestone.points;
      const redeemed = earned && !milestone.unlocksZone && redeemedPoints.has(milestone.points);
      const kind = milestone.unlocksZone ? 'abre zona' : 'premio';
      const status = redeemed ? 'canjeado' : earned ? 'ganado' : kind;
      return `<span class="${earned ? 'prize-key__earned' : ''} ${redeemed ? 'prize-key__redeemed' : ''}"><strong>${milestone.points}</strong> ${milestone.label} <em>${status}</em></span>`;
    })
    .join('');
}

function renderPrizeAlert(confirmedPoints: number): string {
  const earnedPrizes = prizeMilestones.filter((milestone) => !milestone.unlocksZone && confirmedPoints >= milestone.points);
  const pendingAwards = weeklyProgress.prizeAwards.filter((award) => award.redeemed !== true);
  if (!earnedPrizes.length && !pendingAwards.length) return '';
  const latestPrize = earnedPrizes.at(-1);
  const pendingText = pendingAwards.length ? `${pendingAwards.length} premio${pendingAwards.length === 1 ? '' : 's'} por canjear.` : 'Todo canjeado.';
  return `
    <div class="weekly-prize-alert" role="status" aria-live="polite">
      <span aria-hidden="true">🎁</span>
      <strong>${latestPrize ? `¡Ganaste ${latestPrize.label} esta semana!` : 'Tienes premios pendientes.'}</strong>
      <span>${pendingText} Tu maestro marca cuando lo canjeas.</span>
    </div>
  `;
}

function renderPrizeCarryoverList(): string {
  const awards = weeklyProgress.prizeAwards.filter((award) => award.label && award.week_start);
  if (!awards.length) return '';
  const items = awards.map((award) => {
    const status = award.redeemed ? 'canjeado' : 'por canjear';
    return `<li><strong>${escapeHtml(String(award.label))}</strong> <span>${status}</span> <small>semana ${escapeHtml(String(award.week_start))}</small></li>`;
  }).join('');
  return `<ul class="weekly-prize-list" aria-label="Premios ganados">${items}</ul>`;
}

function getWeeklyProgressRowsForDisplay(): WeeklyProgressRow[] {
  if (weeklyProgress.progress.length) return weeklyProgress.progress;

  return state.zones
    .filter((zone) => zone.status === 'Terminada')
    .map((zone) => ({ status: 'Terminada', teacher_confirmed: zone.teacherConfirmed === true }));
}

function renderWeeklyPoints(): string {
  const { confirmedPoints, pendingReviewPoints, finishedPoints } = summarizeWeeklyProgress(getWeeklyProgressRowsForDisplay(), weeklyPrizeMaxPoints);
  const confirmedPercent = (confirmedPoints / weeklyPrizeMaxPoints) * 100;
  const pendingReviewPercent = (pendingReviewPoints / weeklyPrizeMaxPoints) * 100;

  return `
    <section class="weekly-panel" aria-label="Puntos de la semana">
      <div class="weekly-panel__header">
        <div>
          <p class="weekly-panel__eyebrow">⭐ Puntos de la semana</p>
          <h2>${finishedPoints} de ${weeklyPrizeMaxPoints} zonas terminadas</h2>
          <p>Meta: 25 puntos. Máximo: 30 puntos.</p>
        </div>
      </div>
      <div class="weekly-totals" aria-live="polite">
        <span class="weekly-total weekly-total--confirmed"><strong>${confirmedPoints}</strong> confirmadas</span>
        <span class="weekly-total weekly-total--pending"><strong>${pendingReviewPoints}</strong> terminadas, esperando revisión</span>
      </div>
      <div class="weekly-bar" role="img" aria-label="${confirmedPoints} zonas confirmadas y ${pendingReviewPoints} zonas terminadas esperando revisión">
        <span class="weekly-bar__fill" aria-hidden="true">
          <span class="weekly-bar__confirmed" style="--segment-width: ${confirmedPercent}%"></span>
          <span class="weekly-bar__pending" style="--segment-width: ${pendingReviewPercent}%"></span>
        </span>
        ${renderPrizeMilestones()}
      </div>
      ${renderPrizeAlert(confirmedPoints)}
      ${renderPrizeCarryoverList()}
      <div class="prize-key" aria-label="Premios por puntos">
        ${renderPrizeKey(confirmedPoints)}
      </div>
      <div class="weekly-legend">
        <span><i class="legend-dot legend-dot--confirmed"></i> Confirmados</span>
        <span><i class="legend-dot legend-dot--pending"></i> Terminados, esperando revisión</span>
      </div>
    </section>
  `;
}


function isMyMessage(message: StudentMessage): boolean {
  return message.sender_profile_id === currentProfileId;
}

function renderStudentMessages(): string {
  const unreadCount = messages.filter((message) => message.sender_profile_id !== currentProfileId && !message.read_at).length;
  const messageRows = messages.length ? messages.map((message) => {
    const mine = isMyMessage(message);
    return `
      <article class="student-message ${mine ? 'student-message--mine' : 'student-message--teacher'}">
        <strong>${mine ? 'Yo' : 'Maestro'}</strong>
        <p>${escapeHtml(message.body)}</p>
      </article>
    `;
  }).join('') : '<p class="message-empty">No hay mensajes todavía.</p>';

  return `
    <button class="message-fab" type="button" data-action="toggle-messages" aria-label="Mensaje para mi maestro" aria-expanded="${messagesOpen}">
      ✉️
      ${unreadCount ? '<span class="message-alert" aria-label="Hay mensajes nuevos">!</span>' : ''}
    </button>
    <section class="message-popover ${messagesOpen ? 'message-popover--open' : ''}" aria-label="Mensaje para mi maestro">
      <div class="message-popover__header">
        <h2>Mensaje para mi maestro</h2>
        <button class="message-close" type="button" data-action="toggle-messages" aria-label="Cerrar mensajes">×</button>
      </div>
      <div class="message-list" aria-live="polite">
        ${messagesLoading ? '<p class="message-empty">Cargando mensajes...</p>' : messageRows}
      </div>
      <label class="message-compose">
        <span>Escribe tu mensaje</span>
        <textarea data-action="message-draft" maxlength="1000" rows="3">${escapeHtml(messageDraft)}</textarea>
      </label>
      <button class="message-send" type="button" data-action="send-message">Enviar mensaje</button>
      <p class="message-status" aria-live="polite">${escapeHtml(messageStatus)}</p>
    </section>
  `;
}

function renderZoneCard(zone: ZoneProgress): string {
  const definition = activeZoneDefinitions.find((candidate) => candidate.id === zone.id);
  if (!definition) return '';

  const displaySeconds = getDisplaySeconds(zone, currentTime);
  const isRunning = zone.status === 'En progreso';
  const isFinished = zone.status === 'Terminada';
  const isOpen = openZoneId === zone.id || (openZoneId === null && isRunning);
  const progressPercent = getProgressPercent(displaySeconds, definition.targetMinutes);

  return `
    <details class="zone-card zone-card--${definition.theme} ${isRunning ? 'zone-card--active' : ''} ${isFinished ? 'zone-card--finished' : ''} ${definition.locked ? 'zone-card--locked' : ''}" aria-label="Zona ${definition.name}" data-zone-card-id="${zone.id}" ${isOpen ? 'open' : ''}>
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
        <span class="expand-hint">${isOpen ? 'Toca para cerrar' : 'Toca para abrir'}</span>
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
      ${renderStudentMessages()}
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

app.addEventListener('toggle', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLDetailsElement)) return;
  if (!target.classList.contains('zone-card')) return;

  const zoneId = target.dataset.zoneCardId;
  if (!zoneId) return;

  const nextOpenZoneId = target.open ? zoneId : openZoneId === zoneId ? null : openZoneId;
  if (nextOpenZoneId === openZoneId) return;

  openZoneId = nextOpenZoneId;
  render();
}, true);

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const actionElement = target.closest<HTMLElement>('[data-action]');
  if (!actionElement) return;

  const action = actionElement.dataset.action;

  if (action === 'toggle-messages') {
    messagesOpen = !messagesOpen;
    messageStatus = '';
    if (messagesOpen) void loadMessages();
    render();
    return;
  }

  if (action === 'send-message') {
    void sendMessage();
    return;
  }

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

app.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.dataset.action !== 'message-draft') return;
  messageDraft = target.value;
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

    const data = (await response.json()) as { displayName?: unknown; studentId?: unknown; profileId?: unknown; zoneSettings?: unknown };
    if (typeof data.displayName !== 'string') return;

    const displayName = data.displayName.trim();
    if (!displayName) return;

    studentName = displayName;
    currentStudentId = typeof data.studentId === 'string' ? data.studentId : null;
    currentProfileId = typeof data.profileId === 'string' ? data.profileId : null;
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
    openZoneId = state.zones.find((zone) => zone.status === 'En progreso')?.id ?? openZoneId;
    const nextWeeklyProgress = parseWeeklyProgress(data.weeklyProgress);
    if (nextWeeklyProgress) weeklyProgress = nextWeeklyProgress;
    saveState(state, currentStudentId);
  } catch (error) {
    console.error(error);
  }
}

async function loadMessages(): Promise<void> {
  messagesLoading = true;
  try {
    const response = await fetch('/api/student-messages', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Messages load failed: ${response.status}`);
    const data = (await response.json()) as { messages?: unknown };
    messages = Array.isArray(data.messages) ? data.messages as StudentMessage[] : [];
  } catch (error) {
    console.error(error);
    messageStatus = 'No se pudo cargar';
  } finally {
    messagesLoading = false;
    render();
  }
}

async function sendMessage(): Promise<void> {
  const body = messageDraft.trim();
  if (!body) {
    messageStatus = 'Escribe tu mensaje';
    render();
    return;
  }
  try {
    const response = await fetch('/api/student-messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error(`Message send failed: ${response.status}`);
    messageDraft = '';
    messageStatus = 'Enviado';
    await loadMessages();
  } catch (error) {
    console.error(error);
    messageStatus = 'No se pudo enviar';
    render();
  }
}

render();
void loadStudentName();
void loadMessages();
