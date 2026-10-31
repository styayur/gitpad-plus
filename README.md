# GitPad+

A local-first Markdown journal with calendar navigation, WYSIWYG editing and persistent links. GitPad+ aims to combine native Fluent/Material shells, portable Markdown files and a capability-based TypeScript Plugin SDK. Git history/sync, graphs, canvas, bases and timelines are product goals, not available features.

[简体中文](README.zh-CN.md) · [Specification](docs/PRODUCT-SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Acceptance](docs/acceptance/v0.1.0-alpha.1.md)

## Status: development toward v0.1.0-alpha.1

**Unreleased. There is no verified Windows installer, Android Release APK or pre-release download.** The Linux browser integration harness is a developer test tool, not the native product. Native runtime acceptance and Android signing remain blocked. Do not use this development version as the only copy of important notes.

Implemented and tested in the portable core/browser workflow:

- Calendar, multiple notes per date, switchable/closable tabs with restart restoration, title editing and local FTS5 search.
- Real Milkdown Crepe editing, GFM, formatting toolbar, directive marks, fold containers, callouts and opaque unknown-directive preservation.
- A three-second peek into actual Markdown source slices, with a separate apply action for source edits.
- RFC 9562 UUIDv7 identities, ProseMirror block tracking, W3C quote/context anchors, strict note/block/selection URIs, session-scoped Yjs positions and Text Fragment export.
- Markdown + hash/revision sidecars, serialized autosave, stale-write rejection, interrupted-save recovery, recoverable deletion and rebuildable SQLite indexes.
- Image import/deduplication, managed-vault path checks, dirty-state protection and a separate clear-data confirmation.
- Two official SDK plugins, lifecycle disposal, host capabilities and native-core checks on the packaged plugin RPC route.

MAUI 10/WinUI 3/Android shell source and CI builds are provided. A build is not evidence of native operation. See the [acceptance report](docs/acceptance/v0.1.0-alpha.1.md) for the current evidence and remaining v0.1 gaps. Windows/Android screenshots will be added only after real runtime acceptance.

## Development

Pinned versions: .NET SDK 10.0.403, Node.js 24.19.0 LTS, Corepack 0.34.6, pnpm 12.16.1. Run from the existing checkout; each cloud task is already isolated and needs no additional worktree.

```bash
# In the prepared Codex cloud image:
source /workspace/.gitpad-env/activate.sh
cd /workspace/gitpad-plus
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
dotnet restore tests/dotnet/GitPadPlus.Core.Tests.csproj --locked-mode
dotnet test tests/dotnet/GitPadPlus.Core.Tests.csproj --no-restore
pnpm --filter @gitpad-plus/sdk build
pnpm exec playwright install chromium --only-shell
pnpm test:ui
```

The browser suite starts an isolated temporary .NET host and Vite, edits real files, then stops both processes. No persistent server is needed for either native application. A constrained execution sandbox may require the platform-approved context for VSTest sockets, browser processes and network access. The cloud image does not install native platform SDKs.

To try the test workflow, use `pnpm test:ui --headed` on a machine with a display. It creates disposable test notes. Native build prerequisites and candidate commands are in [BUILDING](docs/BUILDING.md); commands not executed on a native runner are explicitly labelled. There are no verified end-user installation commands yet.

## Architecture and data

`apps/GitPadPlus.App` is the native shell; `web` contains the embedded React/Milkdown UI. `src/GitPadPlus.Core` holds independently tested storage/domain/protocol code. `packages/sdk` is the public extension contract; `plugins` contains official consumers. The small `GitPadPlus.DevHost` adapts the same core to browser integration tests only.

Markdown in `Vault/Journal` and JSON in `Vault/.gitpad/anchors` are authoritative. SQLite is disposable. External Markdown modifications cause a recovery-required error instead of silently overwriting content; interactive reconciliation remains unfinished. Back up the whole vault before experimenting.

Plugins are reviewed/bundled code in this alpha. The permission adapter is not a sandbox for arbitrary JavaScript; no remote plugin execution or marketplace exists. See [PLUGIN-SDK](docs/PLUGIN-SDK.md) and [SECURITY](docs/SECURITY.md).

## Roadmap

- v0.1: complete remaining native acceptance and reliability gates before publishing the first alpha.
- v0.2: GitHub/GitLab sync, diff/history and conflict handling.
- v0.3: timelines, backlinks and export.
- v0.4: graph, canvas, bases and advanced statistics.
- v0.5: stable SDK, plugin distribution and integrations.
- v1.0: mature cross-platform stability acceptance.

These are goals without release-date promises. Git currently reports `NotConfigured`; no remote synchronization is implemented.

## License and contributing

GitPad+ source is **AGPL-3.0-only**; see the unmodified [LICENSE](LICENSE). Third-party components retain their own licenses and copyright statements. Your diary content does not become AGPL source merely because you create it with GitPad+. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md), [CONTRIBUTING](CONTRIBUTING.md) and [security reporting](SECURITY.md).
