# TypeScript Plugin SDK 0.1 alpha

Contract: packages/sdk/index.ts. Lifecycle: definePlugin({manifest,activate,deactivate}). Manifests declare id, version, apiVersion:1, level and permissions. Host activation checks the declared grant set; every capability use rechecks enabled state and permissions. Commands, calendar decorations, views and event subscriptions return tracked Disposables. Errors are isolated and cleanup executes even if deactivate throws. SDK versioning is preliminary, not stable API.

Levels: commands/calendar/toolbars (1), views/panels (2), trusted deep editor extensions (3). This alpha executes bundled/trusted code only. There is no arbitrary remote JavaScript loader, filesystem capability or Git credential API. Permissions do not create a JS sandbox. The native plugins.invoke route separately rejects inactive plugins and methods outside each reviewed bundle's allowlist. Other first-party RPC methods are not exposed through PluginContext.

Official toolbar registers eleven editor commands through the SDK. Official calendar stats queries counts and registers disposable date decorations. Plugin activation loads plugin-owned values/object IDs from the native managed Vault. `getSetting` returns a clone; await `setSetting(key, value)` and `objectId(key)` before assuming durability. `objectId` returns a stable UUIDv7 scoped to the plugin and object key. Writes are serialized and atomically replace a durable JSON file. A `storageSchemaVersion` mismatch fails closed and retains data for explicit migration. Plugin versions are recorded. Disable releases resources and retains data; the preference survives restart. Bundled plugins cannot be independently removed from an installed binary; arbitrary third-party distribution/uninstallation is not exposed. Clear Local Data removes plugin state after confirmation. Permissions remain capabilities, not a JS sandbox.

Template commands (from the repository):

```bash
pnpm --filter @gitpad-plus/sdk build
node packages/create-gitpad-plugin/cli.mjs /tmp/gitpad-example-plugin
cd /tmp/gitpad-example-plugin
pnpm install
pnpm test
pnpm build
```

The generator refuses an existing directory, links the local compiled SDK, adds a manifest, sample command, test, TS configuration and license. Review built modules before passing them to PluginHost.activate; Core source need not change. Commit a generated project's own lockfile. Publication of npm packages and a plugin marketplace are not part of this delivery.

The generated standalone plugin has additionally been compiled and activated through the actual PluginHost, its registered command executed, and its resources unloaded successfully, without changes to Core source. This demonstrates the reviewed host installation API; it is not a claim that a remote plugin loader exists.
