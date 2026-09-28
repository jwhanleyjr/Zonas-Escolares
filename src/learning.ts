export const zoneLabels: Record<string, string> = { typing: 'Typing', reading: 'Reading', exercise: 'Exercise', english: 'English', lengua_espanola: 'Lengua Española', naturales: 'Naturales', matematica: 'Matemática', ixl_extra_practice: 'IXL Extra Practice' };
export const zoneIcons: Record<string, string> = { typing: '⌨', reading: '▤', exercise: '↗', english: 'Aa', lengua_espanola: 'Ñ', naturales: '✳', matematica: 'π', ixl_extra_practice: '+' };
export type Assignment = { student_id: string; zone: string; enabled: boolean; title: string; instructions: string; description: string; platform: string; url: string; completion_method: 'timed' | 'student' | 'teacher' | 'external' | 'checkbox'; target_minutes: number | null; assignment_date: string | null };
export type Progress = { zone: string; status: string; recorded_seconds: number; active_started_at: string | null; teacher_confirmed: boolean };
export type LearningData = { student: { display_name: string }; plan: { daily_goal: number; published: boolean } | null; assignments: Assignment[]; progress: Progress[]; date: string; summary: { enabled: number; completed: number; goal: number; impossible: boolean } };
export function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export function isComplete(progress: Progress | undefined, assignment: Assignment): boolean {
  if (progress?.status !== 'finished') return false;
  if (['teacher', 'external'].includes(assignment.completion_method)) return progress.teacher_confirmed;
  if (assignment.completion_method === 'timed') return progress.recorded_seconds >= (assignment.target_minutes ?? Infinity) * 60;
  return true;
}
