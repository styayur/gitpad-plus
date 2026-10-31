// SPDX-License-Identifier: AGPL-3.0-only
import type { Anchor, Block, LocalState, Note, SaveRequest } from '../bridge/types';
/** One writer queue per note. A late response never replaces the user's newer buffer. */
export class DocumentSession {
  body: string;
  title: string;
  blocks: Block[];
  selections: Anchor[];
  state: LocalState = 'Saved';
  error: string | null = null;
  private version = 0;
  private savedVersion = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;
  constructor(public note: Note, private persist: (request: SaveRequest) => Promise<Note>, private changed: () => void) {
    this.body = note.body; this.title = note.header.title; this.blocks = note.sidecar.blocks; this.selections = note.sidecar.selections;
  }
  edit(body: string, blocks: Block[]) {
    this.body = body; this.blocks = blocks; this.version++; this.state = 'Unsaved'; this.error = null; this.changed();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 600);
  }
  rename(title: string) { this.title = title; this.edit(this.body, this.blocks); }
  addSelection(anchor: Anchor) { this.selections = [...this.selections, anchor]; this.edit(this.body, this.blocks); }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inFlight) { await this.inFlight; if (this.version !== this.savedVersion) return this.flush(); return; }
    if (this.version === this.savedVersion) return;
    const version = this.version;
    this.state = 'Saving'; this.changed();
    const request: SaveRequest = {id:this.note.header.id, body:this.body, title:this.title, tags:this.note.header.tags, expectedRevision:this.note.sidecar.revision, expectedHash:this.note.sidecar.contentHash, blocks:structuredClone(this.blocks), selections:structuredClone(this.selections)};
    this.inFlight = (async () => {
      try { this.note = await this.persist(request); this.savedVersion = version; this.state = this.version === version ? 'Saved' : 'Unsaved'; this.error = null; }
      catch (e) { this.state = 'SaveError'; this.error = String(e); throw e; }
      finally { this.inFlight = undefined; this.changed(); }
    })();
    await this.inFlight;
    if (this.version !== this.savedVersion) await this.flush();
  }
  get dirty() { return this.version !== this.savedVersion; }
  dispose() { clearTimeout(this.timer); }
}
