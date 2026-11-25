# Supported dependency lane and refresh procedure

This branch qualifies .NET 11 / MAUI 11. The current alpha release lane uses .NET 10 / MAUI 10. `global.json` is the authority for
the exact SDK and `eng/toolchain.json` pins the native workload set;
`Directory.Packages.props` is the authority for direct NuGet versions across
the app, Core, tests and native probes. Do not put versions back into project
files or enable unrestricted transitive overrides. The reviewed source-built
Win2D remains an exact local-feed dependency, with its independent provenance
and runtime-license checks.

On Windows, with the pinned SDK on PATH:

```powershell
./scripts/refresh-dotnet.ps1 -Scope all -Refresh -InstallWorkloads
```

This explicitly regenerates then verifies all six portable graphs, the Windows
app and managed Win2D probe, and the universal arm64/x64 Android graph. Review
all lockfile diffs together with SDK/workload/central package changes. The
single-ABI development-probe lock is intentionally separate and ignored.
Normal builds and both candidate builders retain locked restore; only the
explicit refresh path opts out while regenerating. Linux can verify the
portable or Android scope, but cannot qualify Windows.

The existing `android.yml` manual workflow has a `refresh_locks` mode that runs
this entire procedure on Windows and uploads `refreshed-dotnet-locks`. Download
and commit the reviewed files to the originating branch, then rerun normal CI.
It does not push code, merge a PR or publish packages on the caller's behalf.
The normal mode builds and runs actual signed Release Android instrumentation
on a disposable API36 x64 emulator, using the existing release certificate.
Those artifacts still require the independent complete release gate.

Dependabot updates the central NuGet manifest at the root, groups compatible
updates, excludes automatic major upgrades, and keeps the existing twice-monthly
maintenance window and maximum of three ordinary PRs per ecosystem. Do not
merge a higher major simply to close an update PR. Refresh native locks after
central updates; test the native targets and source-built Win2D drawing probe.

Microsoft's [MAUI support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/maui)
currently lists MAUI10 servicing 10.0.130 and end of support 2027-05-11. MAUI's
lifecycle differs from .NET10 LTS. Review the official policy during each
maintenance cycle and stay on the latest servicing patch after compatibility
checks. Begin the independent .NET11/MAUI11 compatibility work early enough to
complete native, data recovery, license and packaging acceptance before MAUI10
support ends. The migration is tracked in [issue #22](https://github.com/styayur/gitpad-plus/issues/22).
Microsoft lists .NET 11 support through 2028-11-14 and MAUI 11 support through
2028-05-09. The pinned 11.0.100.1 workload set supplies Android 37.2.31, and
the central NuGet manifest selects MAUI 11.0.10. The Android branch build uses
CoreCLR and preserves the app's API 26 installation floor, existing app ID and
release certificate. Its build code is 3 for the upgrade test against Alpha.2
(build code 2). The regression keeps reports and hashes in Actions and leaves
the signed test packages on the ephemeral runner.

For Windows back-compat, extract the published Alpha.2 ZIP and the migration
qualification ZIP into separate directories. Verify both ZIP hashes, then run
the existing native harness with the Alpha.2 executable as its fourth argument:

```powershell
node tests/windows/qualify-package.mjs <migration-exe> <new-evidence-dir> <migration-sha> <alpha2-exe>
```

The harness seeds a disposable vault with the Alpha.2 application, saves both
editor panes and plugin state, then opens a copy with the migration executable.
It compares the Markdown and sidecar bytes and exercises search before and
after moving the copy's SQLite index aside. Keep the original vault and the
reports for inspection.
