// SPDX-License-Identifier: AGPL-3.0-only
export class MarkdownPeek {
  private timer?: ReturnType<typeof setTimeout>;
  source: string | null = null;
  editing = false;
  constructor(private changed: () => void, private duration = 3000) {}
  show(source: string) {
    this.dispose(); this.source = source; this.editing = false; this.changed();
    this.timer = setTimeout(() => { this.source = null; this.changed(); }, this.duration);
  }
  edit() { if (this.timer) clearTimeout(this.timer); this.editing = true; }
  close() { this.dispose(); this.source = null; this.editing = false; this.changed(); }
  dispose() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
