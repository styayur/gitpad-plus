// SPDX-License-Identifier: AGPL-3.0-only
import type { CalendarDecoration, Command, Disposable, GitPadPlugin, Manifest, Permission, PluginContext } from '../../packages/sdk/index';
export interface PluginPort {
  queryCalendar(date: string | undefined, pluginId: string): Promise<{id: string; date: string; title: string}[]>;
  readDocument(id: string, pluginId: string): Promise<{body: string}>;
  editDocument(id: string, body: string, pluginId: string): Promise<void>;
  editorCommand(name: string, payload?: string): void;
  theme(): 'system' | 'light' | 'dark';
}
interface Active { plugin: GitPadPlugin; resources: Set<Disposable>; enabled: boolean }
export class PluginHost {
  readonly commands = new Map<string, Command>();
  readonly decorations = new Map<string, CalendarDecoration>();
  readonly views = new Map<string, (container: HTMLElement) => Disposable>();
  readonly errors: {id: string; message: string}[] = [];
  private active = new Map<string, Active>();
  private listeners = new Map<string, Set<(value: unknown) => void>>();
  private storage = new Map<string, Map<string, unknown>>();
  constructor(private port: PluginPort, private changed: () => void = () => {}) {}
  async activate(plugin: GitPadPlugin, granted: Permission[]) {
    const manifest: Manifest = structuredClone(plugin.manifest);
    if (manifest.apiVersion !== 1 || !/^[a-z0-9][a-z0-9.-]+$/.test(manifest.id)) throw new Error('Incompatible plugin manifest');
    if (this.active.has(manifest.id)) return;
    if (manifest.permissions.some(p => !granted.includes(p))) throw new Error('Permission grant missing');
    // This host accepts bundled/trusted plugins only. A JS object is not a security sandbox.
    const item: Active = {plugin, resources: new Set(), enabled: true};
    this.active.set(manifest.id, item);
    const require = (permission: Permission) => { if (!item.enabled || !manifest.permissions.includes(permission) || !granted.includes(permission)) throw new Error('Plugin capability denied: ' + permission); };
    const keep = (dispose: () => void): Disposable => { const value = {dispose: () => { dispose(); item.resources.delete(value); }}; item.resources.add(value); return value; };
    const owned = (key: string) => manifest.id + ':' + key;
    const settings = this.storage.get(manifest.id) ?? new Map<string, unknown>(); this.storage.set(manifest.id, settings);
    const context: PluginContext = Object.freeze({
      manifest: Object.freeze(manifest),
      registerCommand: (command: Command) => {
        require('commands'); const id = owned(command.id); if (this.commands.has(id)) throw new Error('Duplicate command');
        this.commands.set(id, {...command, id, run: async () => { if (!item.enabled) throw new Error('Plugin disabled'); try { await command.run(); } catch(e) { this.fail(manifest.id, e); } }});
        this.changed(); return keep(() => { this.commands.delete(id); this.changed(); });
      },
      decorateCalendar: (value: CalendarDecoration) => { require('calendar.decorate'); const key = owned(value.date); this.decorations.set(key, value); this.changed(); return keep(() => { this.decorations.delete(key); this.changed(); }); },
      registerView: (id: string, render: (container: HTMLElement) => Disposable) => { require('views'); const key = owned(id); this.views.set(key, container => { require('views'); const result = render(container); return keep(() => result.dispose()); }); return keep(() => this.views.delete(key)); },
      queryCalendar: (date?: string) => { require('calendar.read'); return this.port.queryCalendar(date, manifest.id); },
      readDocument: (id: string) => { require('documents.read'); return this.port.readDocument(id, manifest.id); },
      editDocument: (id: string, body: string) => { require('documents.write'); return this.port.editDocument(id, body, manifest.id); },
      editorCommand: (name: string, payload?: string) => { require('editor'); this.port.editorCommand(name, payload); },
      getSetting: (key: string) => { require('storage'); return settings.get(key); },
      setSetting: (key: string, value: unknown) => { require('storage'); settings.set(key, structuredClone(value)); },
      on: (event: string, listener: (value: unknown) => void) => {
        if (!item.enabled) throw new Error('Plugin disabled');
        const set = this.listeners.get(event) ?? new Set(); this.listeners.set(event, set);
        const safe = (value: unknown) => { try { listener(value); } catch (e) { this.fail(manifest.id, e); } };
        set.add(safe); return keep(() => { set.delete(safe); });
      },
      theme: () => { require('theme'); return this.port.theme(); },
    });
    try { await plugin.activate(context); }
    catch (e) { this.fail(manifest.id, e); await this.deactivate(manifest.id); throw e; }
  }
  private fail(id: string, e: unknown) { this.errors.push({id, message: String(e)}); this.changed(); }
  emit(event: string, value: unknown) { for (const listener of [...this.listeners.get(event) ?? []]) listener(value); }
  async deactivate(id: string) {
    const item = this.active.get(id); if (!item) return;
    item.enabled = false;
    try { await item.plugin.deactivate?.(); } catch (e) { this.fail(id, e); }
    finally { for (const resource of [...item.resources].reverse()) { try { resource.dispose(); } catch (e) { this.fail(id, e); } } this.active.delete(id); this.changed(); }
  }
  async dispose() { for (const id of [...this.active.keys()]) await this.deactivate(id); }
}
