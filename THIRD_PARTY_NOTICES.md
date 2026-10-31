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
