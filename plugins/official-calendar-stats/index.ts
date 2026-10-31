// SPDX-License-Identifier: AGPL-3.0-only
import { definePlugin } from '../../packages/sdk/index';
import type { Disposable } from '../../packages/sdk/index';
export function createCalendarStatsPlugin() {
let stop=()=>{};
return definePlugin({
  manifest: {id: 'official-calendar-stats', name: 'Calendar note counts', version: '0.1.0-alpha.1', apiVersion: 1, level: 1, permissions: ['calendar.read', 'calendar.decorate']},
  async activate(api) {
    let alive = true; let generation = 0; let decorations: Disposable[] = [];
    stop=()=>{alive=false;generation++;};
    const refresh = async () => {
      const current = ++generation; const notes = await api.queryCalendar();
      if (!alive || generation !== current) return;
      for (const decoration of decorations) decoration.dispose(); decorations = [];
      const counts = new Map<string, number>();
      for (const note of notes) counts.set(note.date, (counts.get(note.date) ?? 0) + 1);
      for (const [date, count] of counts) decorations.push(api.decorateCalendar({date, label: `${count} ${count === 1 ? 'note' : 'notes'}`}));
    };
    api.on('documents.changed', () => { void refresh().catch(() => {}); });
    await refresh();
  },
  deactivate(){stop();},
});
}
export default createCalendarStatsPlugin();
