# Win2D source rebuild for GitPad+ Windows x64

This is a downstream rebuild of **Win2D 1.4.0**, not Microsoft's prebuilt NuGet package. Upstream source is pinned to [`2cd2e846b0b410286a88fa5cddc3bc765de8be0b`](https://github.com/microsoft/Win2D/tree/2cd2e846b0b410286a88fa5cddc3bc765de8be0b). The retained MIT license is byte-identical to that commit (`LICENSE.txt` Git blob `11d5533d2e27c0e730f6568c98c9c49c154df8aa`). No upstream product source was modified. No Microsoft prebuilt Canvas DLL or Interop assembly was used.

The package version **1.4.1-gitpadplus.1** identifies this downstream packaging revision. Its upstream API/source version remains **1.4.0**. A `1.4.0-gitpadplus` prerelease would sort below MAUI's `>=1.4.0` constraint. The application instead pins this exact downstream version. `NuGet.Config` maps the exact package ID to the reviewed local feed; every Windows build also verifies restored payload hashes because NuGet source mapping does not revalidate an existing global cache.

Only **win-x64** is distributed or supported by this package. The rebuilt Win32 and ARM64 binaries are recorded as build checks, not shipped or claimed as runtime-qualified. The .NET projection is AnyCPU. Packaging retains the upstream .NET build targets and adds an explicit x64 RID guard. General C++/UWP package targets are deliberately not advertised.

## Build inputs and evidence

`win2d-source-binding.json` binds the exact nupkg SHA-256, every distributed input, upstream tree/commit, generated source stamp, managed dependency content hashes, and actual toolchain versions/hashes. It also hashes the successful native and projection logs, retained byte-for-byte as `build-evidence/*.log.txt`. An additional link-input hash inventory and actual native device probe are retained there. The complete local attempts/binlogs are preserved under `artifacts/final-closeout-20261103/`; these are build evidence, not a final application acceptance. The source/commands are reproducible; byte-identical native rebuilds are not claimed.

To reproduce the build, obtain a fresh clean checkout of the pinned upstream commit, SDK 10.0.19041.0, VS 2022 v143 x86/x64/ARM64 tools, NuGet CLI 5.8.0, and a separate portable .NET SDK 6.0.428. Then run from the GitPad+ repository:

```powershell
./scripts/build-win2d-source.ps1 -SourceRoot <pinned-checkout> -Dotnet6Root <portable-sdk-root> -NuGetExe <nuget.exe> -OutputDirectory <new-empty-evidence-directory>
```

The .NET 6 archive was obtained from Microsoft's [release metadata](https://builds.dotnet.microsoft.com/dotnet/release-metadata/6.0/releases.json), verified against its published SHA-512 `c027cb47b264a13e529f8c7f3ba33ac91152b56749c8681fede1d6cd48723ae1e5f04a43bac1302ee81e35a5383f3e169654e5bb7c1d331dc11cce5a95052e32`, and extracted into a task-specific tool directory. GitPad+ itself remains on .NET 10. No machine-wide SDK change is required.

The unmodified master build's native Release matrix succeeded, but its AnyCPU projection step looked for an unrestored assets directory. The reproducible wrapper builds each native platform explicitly, then builds the projection using its x64 restore path with `PlatformTarget=AnyCPU`. The upstream AzureRepos-only SourceLink provider rejects the public GitHub remote; source-link generation/queries are disabled for this projection build, with the explicit upstream revision retained in its version stamp and package provenance. These are build parameter adaptations, not API or dependency replacements. Upstream unit tests/tools/docs are not claimed as run.

## Independent licensing scopes

- **Win2D source and generated Win2D code:** upstream MIT; full original copyright/license retained.
- **MSVC STL contributions:** Apache-2.0 WITH LLVM-exception, as identified by the actual installed `yvals_core.h`. Full text is retained from Microsoft STL tag `vs-2022-17.14`, commit `1f6e5b16ec02216665624c1e762f3732605cf2b4`.
- **Compiler/runtime portions:** upstream `HybridCRT.props` links static vcruntime/STL with the Windows UCRT dynamically. The complete installed VS third-party notices, official [Build Tools terms](https://visualstudio.microsoft.com/license-terms/vs2022-ga-diagnosticbuildtools/) and [Visual C++ runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) are retained independently under `notices/`. They are not relicensed MIT or AGPL. Microsoft's [licensing guidance](https://www.microsoft.com/licensing/guidance/Visual-Studio) describes the open-source dependency build permission and redistribution of linked distributable library output; its [C++ deployment guidance](https://learn.microsoft.com/en-us/cpp/windows/deployment-in-visual-cpp) includes static linking. No compiler executable, SDK library archive or standalone runtime installer is distributed by this package.
- **Windows system libraries:** actual x64 imports are Direct2D, Direct3D11, DirectWrite, COM/WinRT, Kernel32, Advapi32 and Windows UCRT API sets, with D3DCompiler_47 delay-loaded. These remain Windows OS prerequisites and retain their own terms. The separate Windows App SDK, WebView2, Windows SDK and .NET runtime inventories remain required.

The SPDX inventory records the source package with its actual artifact checksum and composite concluded license, including a distinct runtime LicenseRef. It does not point this private rebuild at nuget.org. The original upstream **prebuilt 1.4.0** path remains unresolved in the inventory implementation; this replacement does not retroactively relicense that binary.

`scripts/win2d-source.mjs` verifies package identity, pinned source/license, embedded and external provenance, every payload hash, x64 PE architecture/source version and restored cache bytes. Tampering regressions run with the release-gate unit tests. Runtime compatibility additionally requires native device calls and the actual MAUI application; a hash check is not runtime acceptance.
