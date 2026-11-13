# Testing

Run pnpm typecheck, pnpm lint, pnpm test, pnpm build and the SDK build. Restore the xUnit project with --locked-mode and execute dotnet test. Run pnpm test:ui for Chromium editor integration with the real Core/VaultStore via a temporary loopback host. Playwright owns and terminates both services. Configure PLAYWRIGHT_BROWSERS_PATH only when using the prepared cloud cache.

Machine-readable outputs: artifacts/vitest.xml, artifacts/dotnet/core.trx, artifacts/playwright.json, artifacts/npm-audit.json, artifacts/nuget-audit.json and generated license inventory/SBOM. Artifacts are ignored by Git; the reviewed acceptance summary is committed. Failure traces/screenshots remain test outputs and never stand in for native screenshots.

VSTest needs a loopback socket. Chromium requires browser-process permissions and Linux shared libraries. Use the platform-approved execution context when the restricted sandbox denies these capabilities. Do not skip assertions to work around it.

The suites exercise interrupted saves, revision/hash conflicts, source fidelity, duplicate anchors, UTF-16/emoji offsets, Y.Doc continuity, block edits/moves/splits/merges/copies, plugin cleanup/permission errors and clear-path protections. Browser tests do not cover Android IMEs, actual native lifecycle, native material rendering, signing or package installation. Those remain explicit release gates.

See docs/acceptance/v0.1.0-alpha.1.md for actual executed results and docs/PRODUCT-SPEC.md for the complete checklist. Preserve failed probes; do not relabel them as final acceptance.

## Native tests

Use disposable app-managed vaults for clear, conflict and fault tests. Windows accepts `GITPAD_ACCEPTANCE_VAULT` before process startup. Single-instance routing requires closing the previous process before changing that path. Retain genuine screenshots, package hashes, OS/runtime versions and test scope.

Android tests operate on the signed Release APK. `scripts/build-android-instrumentation.ps1` builds a separate test-only APK with the same protected signing identity. It does not enable product debugging. The runner locates the real HybridWebView, runs `tests/android/scenario.js`, injects native clipboard/key/touch events and captures unmodified screenshots. Never distribute the test APK as a product asset.

```powershell
./scripts/build-android-instrumentation.ps1 -KeystorePath <release-keystore> -AndroidSdkDirectory $env:ANDROID_HOME -JavaSdkDirectory $env:JAVA_HOME -OutputDirectory <new-test-directory>
adb install -r <new-test-directory>/GitPadPlus-Acceptance-Tests.apk
adb shell am instrument -w -r -e phase initial io.github.styayur.gitpadplus.acceptance/io.github.styayur.gitpadplus.acceptance.AcceptanceInstrumentation
adb shell am force-stop io.github.styayur.gitpadplus
adb shell am instrument -w -r -e phase restart io.github.styayur.gitpadplus.acceptance/io.github.styayur.gitpadplus.acceptance.AcceptanceInstrumentation
```

Read the report's `passed` field: adb can exit successfully when instrumentation assertions fail. Clipboard-pasted Chinese text verifies Unicode persistence, not Chinese IME composition. Test long-press selection, keyboard positioning, background/foreground, activity recreation and interrupted saves separately. Emulator acceptance does not establish physical-device or manufacturer-specific behavior.

Generate an independent plugin with `packages/create-gitpad-plugin/cli.mjs`, run its own tests/build, and supply a reviewed registry using `GITPAD_PLUGIN_REGISTRY` plus the native builder's `PackagedRegistryPath`. Verify UI and persistence in the packaged app, then remove the module from the reviewed bundle to test uninstall retention. Default builds contain official plugins only. Packaged plugins are trusted code, not a sandbox.

The benchmark supports `--index-fixture --keep-fixture` to retain a disposable 1000-note source-pair fixture. Report setup separately from real create throughput. Core timings do not establish native UI responsiveness: test that fixture and the long document in the packaged applications.

Android helper phases include `features`, `recreate`, `resume`, `inspect`, `uninstall` and `clear`. The clear phase requires `-e disposable true` and an emulator; it checks preview/cancel, clicks the separate confirmation, waits for the reloaded empty workspace and checks the actual managed files plus an external sentinel. `uninstall` verifies that a removed generated module has no command/RPC authority while its storage digest remains unchanged. Performance seeding also requires the disposable-emulator flag and `-FixtureDirectory` when building the helper. `performance-warm` reuses existing generated data rather than reseeding it. Android PSS measurements describe the app process and exclude the separate WebView renderer.

For the default two-plugin candidate, use `smoke`, `smoke-restart`, `smoke-recreate`, `smoke-resume` and `features-default`; generated-plugin phases remain separate. Touch injection identifies a touchscreen finger explicitly. A helper can dismiss only the specifically identified Gboard stylus tutorial; it does not blindly send Back or bypass an authentication/permission dialog. Retain failed input probes and screenshots so environment/harness failures remain distinguishable from product defects.

`tools/GitPadPlus.FaultProbe` terminates real child writer processes at staged, Markdown-replaced and sidecar-replaced checkpoints, then opens a new VaultStore and verifies the complete recovered pair. This tests Core process termination; it is separate from native lifecycle acceptance.

Every passed release gate needs nonempty hashed evidence for the exact commit/version. The gate independently checks ZIP structure, self-contained runtime/source stamp, signed non-debug APK identity/stamp and asset hashes. Synthetic release-gate unit fixtures do not count as native acceptance.
