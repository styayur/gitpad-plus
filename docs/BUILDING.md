# Building

Use .NET SDK **10.0.403**, Node **24.19.0**, Corepack **0.34.6**, pnpm **12.16.1** and committed lockfiles. MAUI Controls is pinned to **10.0.120**. Linux supports portable Core/frontend tests; WinUI requires Windows. Native builds and runtime acceptance are separate checks.

Windows requires the `maui-windows` workload and Windows SDK 10.0.26100. Use the app-only framework selector to avoid restoring Android. The project enables .NET self-contained deployment, `WindowsAppSDKSelfContained=true` and `WindowsPackageType=None` for Windows.

Windows x64 restores the reviewed [Win2D source rebuild](../third-party/win2d/README.md) from the repository-local feed. `NuGet.Config` maps that exact package ID; the app pins `1.4.1-gitpadplus.1` (upstream source **1.4.0**) and verifies both package provenance and actual restored files during every Windows build. The original prebuilt 1.4.0 remains blocked. This downstream artifact supports only `win-x64`; it does not claim x86 or ARM64 support. Building GitPad+ does not require rebuilding Win2D or installing .NET 6. The separate reproducible source-build instructions explain the isolated upstream toolchain.

`dotnet restore tests/windows/Win2D.ManagedProbe --locked-mode` followed by `dotnet run --project tests/windows/Win2D.ManagedProbe -c Release --no-restore -- third-party/win2d/win2d-source-binding.json <report.json>` exercises the actual source-built projection and native DLL with a WARP render target and pixel readback. Its renderer/App SDK and WebView SDK match the application's runtime dependencies. This component probe is distinct from final packaged MAUI acceptance.

```powershell
pnpm install --frozen-lockfile
pnpm build
dotnet workload install maui-windows --version 10.0.400
$commit=(git rev-parse HEAD).Trim()
dotnet publish apps/GitPadPlus.App/GitPadPlus.App.csproj -c Release -f net10.0-windows10.0.19041.0 -p:GitPadTargetFramework=net10.0-windows10.0.19041.0 -r win-x64 -p:GitPadSourceCommit=$commit -o artifacts/windows-publish
```

For candidate packaging, run `scripts/build-windows-release.ps1 -OutputDirectory <new-directory>` after generating the portable/native inventories and offline notices. It requires clean committed source and creates the ZIP before runtime-generated WebView2 profiles exist. Package the **whole** publish directory, including native/runtime libraries and third-party notices. Extract the ZIP into a new directory and test that executable. The package still requires Windows x64 10.0.19041 or newer and working Evergreen WebView2. Testing Windows 11 does not qualify every supported OS version. State the publisher signature status explicitly; a self-issued certificate is not a trusted Authenticode publisher certificate.

Android requires `maui-android` (local workload installation used `--version 10.0.400`), JDK 21, SDK platform 36 and build-tools 36.0.0. Set `JAVA_HOME`, `ANDROID_HOME` and `ANDROID_SDK_ROOT`. Emulator acceptance also needs platform-tools, the emulator and one compatible x86_64 system image. Local probes use Android 16/API 36 Google APIs. The manual Android CI Debug output is not a release asset.

```powershell
./scripts/build-android-release.ps1 -KeystorePath <outside-repository-keystore> -AndroidSdkDirectory $env:ANDROID_HOME -JavaSdkDirectory $env:JAVA_HOME -OutputDirectory <new-output-directory>
```

The builder requires clean committed source, builds the editor, produces one arm64-v8a/x86_64 APK, stamps the source commit and verifies manifest/version/signature. It reads the keystore's `.password.dpapi` companion into temporary environment variables. Never supply literal passwords as arguments. DPAPI recovery depends on the original Windows account; keep an independent protected offline copy of the key and credentials. `new-android-release-key.ps1` requires explicit authorization and must never regenerate an existing identity.

`-QuickProbe -AllowDirtyDevelopmentBuild` produces a development-stamped probe that cannot pass the release gate. Install and test the exact candidate APK; retain `apksigner verify --verbose --print-certs`, `aapt2 dump badging`, ABI, source stamp and SHA-256 evidence. Repeat acceptance after candidate changes.

Native locked restores use `apps/GitPadPlus.App/packages.windows.lock.json` for the Windows selector and `packages.android.lock.json` for the universal Android selector. Single-ABI development probes use an ignored separate lockfile. Runtime and self-contained properties are removed from the Core project reference so native restores do not rewrite its portable lockfile. Both candidate builders enable locked restore.

The [candidate transport procedure](acceptance/candidate-transport.md) tests the hosted upload path before final native builds, then sends only the locally gated immutable candidate to Actions. Run the existing `release.yml` verifier against that successful upload run. Uploading evidence does not authorize tag creation, a draft Release or publication.

`release.yml` verifies a supplied candidate and does not publish it. `publish-local-release.ps1 -CandidateDirectory <path>` checks clean HEAD, exact GitHub main, successful corresponding CI, the fail-closed gate and checksums without creating a tag. A candidate contains the ZIP/APK, SBOM, notices, release notes, acceptance metadata, hashed evidence and SHA256SUMS.

After the user reviews the complete readiness report, `-StageDraft -ApproveTag` may create/push the annotated tag and draft prerelease. Uploaded assets are independently downloaded and hashed. Separate final user approval is required for `-Publish -ApprovePublication`, which rechecks the draft and all public assets. Existing unrelated tags/releases are refused. Never bypass a mandatory failed gate.
