# Testing

Run pnpm typecheck, pnpm lint, pnpm test, pnpm build and the SDK build. Restore the xUnit project with --locked-mode and execute dotnet test. Run pnpm test:ui for Chromium editor integration with the real Core/VaultStore via a temporary loopback host. Playwright owns and terminates both services. Configure PLAYWRIGHT_BROWSERS_PATH only when using the prepared cloud cache.

Machine-readable outputs: artifacts/vitest.xml, artifacts/dotnet/core.trx, artifacts/playwright.json, artifacts/npm-audit.json, artifacts/nuget-audit.json and generated license inventory/SBOM. Artifacts are ignored by Git; the reviewed acceptance summary is committed. Failure traces/screenshots remain test outputs and never stand in for native screenshots.

VSTest needs a loopback socket. Chromium requires browser-process permissions and Linux shared libraries. Use the platform-approved execution context when the restricted sandbox denies these capabilities. Do not skip assertions to work around it.

The suites exercise interrupted saves, revision/hash conflicts, source fidelity, duplicate anchors, UTF-16/emoji offsets, Y.Doc continuity, block edits/moves/splits/merges/copies, plugin cleanup/permission errors and clear-path protections. Browser tests do not cover Android IMEs, actual native lifecycle, native material rendering, signing or package installation. Those remain explicit release gates.

See docs/acceptance/v0.1.0-alpha.1.md for the final executed command counts and CI links, and docs/PRODUCT-SPEC.md for the complete acceptance checklist.
