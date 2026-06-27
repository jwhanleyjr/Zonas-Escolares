import { loadState, resetState, saveState } from './storage.js';
import {
  completedZoneCount,
  finishZone,
  getDisplaySeconds,
  pauseZone,
  startZone,
  type ZoneProgress,
  type ZoneState,
  zoneDefinitions,
} from './zones.js';

const appElement = document.querySelector<HTMLDivElement>('#app');

if (!appElement) {
  throw new Error('No se encontró la aplicación.');
}

const app = appElement;

let state = loadState();
let currentTime = Date.now();

function formatMinutes(seconds: number): string {
  return `${Math.floor(seconds / 60)} min`;
}

function getActionLabel(zone: ZoneProgress): string {
  if (zone.status === 'En progreso') return 'Pausar';
  if (zone.status === 'Terminada') return 'Revisar';
  return 'Empezar';
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

function renderZoneCard(zone: ZoneProgress): string {
  const definition = zoneDefinitions.find((candidate) => candidate.id === zone.id);
  if (!definition) return '';

  const displaySeconds = getDisplaySeconds(zone, currentTime);
  const isRunning = zone.status === 'En progreso';
  const isFinished = zone.status === 'Terminada';

  return `
    <article class="zone-card ${isRunning ? 'zone-card--active' : ''}" aria-label="Zona ${definition.name}">
      <div class="zone-card__top">
        <p class="zone-card__eyebrow">Zona</p>
        <h2>${definition.name}</h2>
      </div>
      <p class="assignment">${definition.assignmentTitle}</p>
      <dl class="zone-details">
        <div>
          <dt>Meta</dt>
          <dd>${definition.targetMinutes} min</dd>
        </div>
        <div>
          <dt>Tiempo registrado</dt>
          <dd>${formatMinutes(displaySeconds)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd><span class="status">${zone.status}</span></dd>
        </div>
      </dl>
      <div class="zone-actions">
        <button class="primary-action" type="button" data-action="primary" data-zone-id="${zone.id}">
          ${getActionLabel(zone)}
        </button>
        <button class="done-action" type="button" data-action="finish" data-zone-id="${zone.id}" ${isFinished ? 'disabled' : ''}>
          Terminé
        </button>
        <a class="assignment-link" href="${definition.linkUrl}" target="_blank" rel="noopener noreferrer">
          Abrir tarea
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
          <p class="hero__label">Elige tu orden</p>
          <h1 id="page-title">Mis zonas de hoy</h1>
          <p class="hero__text">Puedes empezar cualquier zona. Si empiezas otra, la zona activa se pausa sola.</p>
        </div>
        <div class="progress-summary" aria-live="polite">
          <strong>${completed} de ${zoneDefinitions.length}</strong>
          <span>zonas terminadas</span>
        </div>
      </section>

      <section class="zone-grid" aria-label="Zonas de trabajo">
        ${state.zones.map(renderZoneCard).join('')}
      </section>

      <section class="helper-panel" aria-label="Ayuda">
        <p>Tu tiempo es <strong>recorded work time</strong>. Tu maestra o maestro revisa si la tarea está completa.</p>
        <button class="reset-button" type="button" data-action="reset">Borrar datos de desarrollo</button>
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

  if (action === 'reset') {
    updateState(resetState());
    return;
  }

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

render();
