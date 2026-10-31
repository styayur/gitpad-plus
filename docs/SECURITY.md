# Security model and limits

The native app owns a dedicated Vault directory under its application data directory. VaultStore refuses to adopt an existing nonempty unmanaged directory. Path traversal, symlinks/reparse points and active image formats are rejected. Clear shows note/attachment/index counts, blocks dirty edits, fingerprints the current managed data and requires a separate confirmation. Remote repositories and external vaults are not deletion targets.

These checks defend against accidental misconfiguration and malicious input. They do not constitute a race-free filesystem sandbox against a local attacker mutating directory entries between checks and use. Persistent marker handling and fully crash-atomic clear still need deeper native qualification. This remains release-blocking until the required safety acceptance is complete.

The WebView loads local resources with CSP: no remote scripts/frames/objects, no arbitrary HTML execution. Links are intercepted, native RPC is versioned/allowlisted and validated; exceptions do not disclose private paths. Imported HTML is preserved read-only. No arbitrary JS plugins are accepted. Official plugin capabilities are checked in TypeScript and the native packaged-plugin route.

RPC cancellation is local cancellation of waiting, not rollback. Optimistic revision/hash checks reject stale document writes. Long-document transport currently serializes full Markdown; native performance is unqualified. Background saves are best effort; reliable Android process-death behavior remains untested.

Security overrides are exact: KaTeX <0.18.2 -> 0.18.2 (GHSA-238p-pmpm-9mq7); minimatch <11.0.1 -> 11.0.1 (GHSA-g3hv-75wg-m249). They are recorded in pnpm-workspace.yaml, not hidden audit exceptions. Run npm/NuGet audits and regression tests after any update. Scans do not prove absence of every vulnerability.

No application credentials, signing keys or remote-sync token were created. E2EE and encrypted vaults are future work. See root SECURITY.md for reporting.
