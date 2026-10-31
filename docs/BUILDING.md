# Building

Use the pinned global.json, .node-version and packageManager. Linux supports portable Core and frontend/test builds; it cannot execute WinUI or qualify MAUI Android without a device. Keep the cloud image free of native workloads. README lists the commands verified in this image.

Windows CI installs only the maui-windows workload on windows-latest and builds the Windows target with the app-only GitPadTargetFramework selector to avoid restoring Android. The stable MAUI reference is 10.0.120. This repository's native build commands are candidates until their actual CI outcome is recorded; native runtime remains a separate gate.

```powershell
pnpm install --frozen-lockfile
pnpm build
dotnet workload install maui-windows --version 10.0.400
dotnet build apps/GitPadPlus.App/GitPadPlus.App.csproj -c Release -f net10.0-windows10.0.19041.0 -p:GitPadTargetFramework=net10.0-windows10.0.19041.0 -p:RuntimeIdentifier=win-x64 -p:WindowsPackageType=None
```

Android builds use a dedicated runner labelled self-hosted, linux, android, enabled only after GITPAD_ANDROID_RUNNER_READY=true is configured. The runner must provide matching .NET/MAUI Android workloads, JDK 21 and supported Android build tools/SDK. No NDK/emulator is requested for this Linux cloud image. The manual workflow only produces explicitly labelled Debug build evidence; that is not a Release APK.

Signed Release APK generation needs a durable externally managed keystore and secure credentials. They are unavailable. Do not generate a throwaway identity, commit a keystore, or call a debug-signed APK a release. No signing prerequisites are requested until the user provisions a dedicated runner.

release.yml accepts a successful candidate run for an exact commit. A candidate must supply hashed native runtime logs, version/architecture/signing evidence, installable Windows ZIP and signed Android Release APK, SHA256SUMS, notices, SBOM and release notes. The gate fails closed when any evidence is absent. No candidate exists yet. It never overwrites an existing tag or release and re-downloads published assets for checksum validation.
