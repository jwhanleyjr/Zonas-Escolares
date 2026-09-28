// Version 1 prompts are immutable so past entries retain their original questions.
export const themes: Record<string, { title: string; icon: string; prompts: string[] }> = {
  goal: { title: 'Una meta que tengo', icon: '↗', prompts: ['Algo que quiero lograr es…', '¿Por qué es importante para mí?', 'Primero voy a…', 'Después puedo…', 'Finalmente quiero…', 'Algo que podría dificultarlo es…', 'Mi primer paso será…'] },
  feelings: { title: 'Así me siento', icon: '♡', prompts: ['El sentimiento sobre el que quiero escribir es…', '¿Qué estaba pasando cuando empecé a sentirme así?', 'Cuando siento esto, mis pensamientos suelen ser…', 'Lo que necesito en este momento es…', 'Una cosa que podría ayudarme hoy…'] },
  story: { title: 'Algo que pasó', icon: '▤', prompts: ['Ponle un título a tu historia.', 'Principio: ¿Dónde estaba y qué estaba pasando?', 'Desarrollo: ¿Qué sucedió después?', 'Final: ¿Cómo terminó o cómo está la situación ahora?', 'Cuando pienso en lo que pasó, ahora me doy cuenta de que…'] },
  thoughts: { title: 'Tengo algo en mente', icon: '✎', prompts: ['Mis pensamientos…', 'Lo que sé.', 'Lo que me pregunto.', 'Lo que puedo hacer.', 'Lo que necesito.', 'Después de organizar mis pensamientos, lo que más quiero decir es…'] },
  good: { title: 'Algo bueno de mi vida', icon: '☀', prompts: ['Lo que quiero contar es…', '¿Por qué es importante para mí?', 'Lo que quiero recordar de esto es…'] },
};
export const subjects = ['Una persona importante para mí.', 'Algo que hice bien.', 'Un buen recuerdo.', 'Algo que agradezco.', 'Algo que espero con ilusión.'];
export const emotions: Record<string, string> = { 'Alegre': '😊', 'Tranquilo/a': '😌', 'Preocupado/a': '😟', 'Triste': '😔', 'Enojado/a': '😠', 'Cansado/a': '😴', 'Nervioso/a': '😬', 'Emocionado/a': '🤩', 'Confundido/a': '😕' };
export type Entry = { id: string; theme: string; template_version: number; title: string; emotions: string[]; other_emotion: string; subject: string; responses: Record<string, string>; free_writing: string; status: 'draft' | 'finished'; revision: number; created_at: string; entry_date: string; updated_at: string };
export type Filters = { search: string; month: string; date: string; theme: string; emotion: string; status: string };
export function entryText(e: Entry): string { return [e.title, ...Object.values(e.responses), e.free_writing].join(' '); }
export function filterEntries(entries: Entry[], f: Filters): Entry[] {
  return entries.filter(e => (!f.search || entryText(e).toLocaleLowerCase().includes(f.search.toLocaleLowerCase())) && (!f.month || e.entry_date.startsWith(f.month)) && (!f.date || e.entry_date === f.date) && (!f.theme || e.theme === f.theme) && (!f.emotion || e.emotions.includes(f.emotion)) && (!f.status || e.status === f.status));
}
