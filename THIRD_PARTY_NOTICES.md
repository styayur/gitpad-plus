# Third-party notices

GitPad+ original source is AGPL-3.0-only. Dependencies are not relicensed. The full source license is in LICENSE. Dependency metadata is not a substitute for retaining upstream license text in binary distributions.

`node scripts/licenses.mjs` reads restored npm/NuGet packages, rejects unreviewed license expressions, copies upstream notices to `artifacts/third-party`, and emits `artifacts/license-inventory.json` and `artifacts/SBOM.spdx.json`. The inventory covers the installed portable dependency graph; native Windows/Android binary dependencies and transitive assets need separate release review. No complete native binary compliance claim is made.

Milkdown/Crepe, React, ProseMirror, Yjs, uuid, unified/remark and Vite retain their MIT notices. Microsoft.Data.Sqlite and YamlDotNet use MIT. SQLitePCLRaw packages declare Apache-2.0; SQLite itself retains its upstream public-domain declaration. Playwright and xUnit use Apache-2.0. MPL-2.0 dependency files retain MPL and their source locations; the distribution must preserve their required notices and make those files' corresponding source available under MPL. KaTeX fonts and any other assets require the upstream asset notices in addition to package metadata; no final native distribution has been authorized by this inventory alone.

## Vendored MAUI transport

`public/HybridWebView.js` is copied without modifications from dotnet/maui tag `10.0.120`, `src/Core/src/Handlers/HybridWebView/HybridWebView.js`.

- Tag object: `6aca5366139ed0e1cd05cca3e32b6a887d5a8dd0`.
- File SHA-256: `759c0ebaac292e4d75dee625665c032e63dab3bf979881b52a8b2005a67c5673`.
- MIT license: [retained upstream text](docs/licenses/dotnet-maui-10.0.120.txt), also shipped in `public/MAUI-LICENSE.txt`.
- Copyright (c) .NET Foundation and Contributors. All rights reserved.

## Legacy xUnit metadata

`xunit.abstractions` 2.0.3 declares a `licenseUrl`, not an SPDX expression. Its exact source tag is `xunit/abstractions.xunit:2.0.3` (object `aafc368765b30c3c9ed2e953a61fe084c078302f`). The nuspec points to `xunit/xunit/master/license.txt`. The last revision of that license before its August 2018 package publication is `8d0cdc1cf585f5cf285d221e0c8ff793e6aeea30`, declaring Apache-2.0. That [contemporaneous license](docs/licenses/xunit-abstractions-2.0.3.txt) is retained as the specific reviewed exception to missing-expression detection. Unknown packages remain blocked.

No proprietary Diarium/Typora code, third-party product screenshots, or external image/font designs were copied. The simple app icon and splash SVGs are original project artwork.

## Native inventory and release review

`scripts/native-license-inventory.mjs` augments the portable SPDX inventory using snapshots of the actual Windows and Android restores, plus the distributed .NET/Mono and Android runtime packs. It retains upstream NuGet license/notice files, separate Microsoft license texts and exact package versions. `scripts/bundle-notices.mjs` collects distinct retained texts into an offline `public/THIRD_PARTY_LICENSES.txt` for inclusion in the embedded app assets. Candidate packaging must also retain the notices at the ZIP root. Inventory generation alone does not pass the license gate.

The WebView2 **SDK package** 1.0.4258.31 ships a BSD-3-Clause license; the separately installed Evergreen browser runtime is a Windows prerequisite. Windows App SDK self-contained components retain their Microsoft distribution terms, including the package's express provision for files binplaced into self-contained applications. Windows SDK tooling/projections retain their SDK terms. These components are not relicensed under AGPL.

**Original prebuilt binary remains blocked:** Microsoft.Graphics.Win2D 1.4.0 declares the legacy `eula_win2d_10012014.htm` binary-license URL, which now redirects away from its terms. An archived copy of that vendor page and its provenance are retained in `docs/licenses/win2d-legacy-eula.txt`; the current upstream source MIT license is retained separately in `docs/licenses/win2d-LICENSE.txt`. Source MIT metadata does not establish the applicable terms for that prebuilt binary. The inventory retains its unresolved path if that original binary is restored.

The Windows x64 application instead pins the independently [source-built downstream package](third-party/win2d/README.md), revision `1.4.1-gitpadplus.1`, from Win2D upstream source **1.4.0** at `2cd2e846b0b410286a88fa5cddc3bc765de8be0b`. Its binary/payload hashes, upstream MIT license, build inputs and retained MSVC STL/runtime notices are bound to the checked-in artifact. Only this exact artifact and its verified restored payload take the source-build inventory path. MSVC STL/runtime and Windows system-library terms remain independent; the compiled package is not relabeled wholly MIT. Other native dependencies retain their separate inventory and terms. Successful inventory generation does not substitute for final native acceptance or the complete release gate.

## Fonts and media

Bundled KaTeX font files carry **OFL-1.1**, independently of the npm package's MIT license. Their actual font metadata notices and the OFL text are retained in `docs/licenses/katex-fonts-OFL-1.1.txt`. The generated font/media inventory records paths and SHA-256 values. Application SVG icon/splash artwork is original AGPL project source. System fonts selected by CSS are not redistributed. Acceptance images are generated disposable test fixtures, not product artwork or third-party screenshots.
