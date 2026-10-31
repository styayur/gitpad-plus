// SPDX-License-Identifier: AGPL-3.0-only
export type Permission = 'commands' | 'calendar.read' | 'calendar.decorate' | 'documents.read' | 'documents.write' | 'editor' | 'storage' | 'views' | 'theme';
export interface Disposable { dispose(): void }
export interface Manifest { id: string; name: string; version: string; apiVersion: 1; level: 1 | 2 | 3; permissions: Permission[] }
export interface CalendarDecoration { date: string; label: string; color?: string }
export interface Command { id: string; title: string; run(): void | Promise<void>; toolbar?: boolean; shortcut?: string }
export interface PluginContext {
  readonly manifest: Readonly<Manifest>;
  registerCommand(command: Command): Disposable;
  decorateCalendar(decoration: CalendarDecoration): Disposable;
  registerView(id: string, render: (container: HTMLElement) => Disposable): Disposable;
  queryCalendar(date?: string): Promise<{id: string; date: string; title: string}[]>;
  readDocument(id: string): Promise<{body: string}>;
  editDocument(id: string, body: string): Promise<void>;
  editorCommand(name: string, payload?: string): void;
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void;
  on(event: string, listener: (value: unknown) => void): Disposable;
  theme(): 'system' | 'light' | 'dark';
}
export interface GitPadPlugin { manifest: Manifest; activate(context: PluginContext): void | Promise<void>; deactivate?(): void | Promise<void> }
export const definePlugin = (plugin: GitPadPlugin): GitPadPlugin => plugin;
