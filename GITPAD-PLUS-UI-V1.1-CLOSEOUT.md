# GitPad+ UI v1.1 closeout, in progress

## Implemented

Work branch `ui/mobile-workflow-v1.1` starts from actual main `63070c81c99f90cd4e46a7ce4d700ace2d08b5fa`. On 5 November 2026 the remote main matched local main, and the existing `v0.1.0-alpha.1` was already a public prerelease. The supplied mission's unpublished baseline is historical.

Mobile writing uses the existing editable title and one action row. Calendar, Settings, Save, Image and More share that row. Settings and Image overflow below 361px. Browsing offers Back to writing. The original plugin-owned command strip docks to the resized viewport, with Local/Git status above it. Native Resize and SafeArea continue to own keyboard compensation. The last focused pane receives plugin formatting commands.

Note rows reveal an explicit trash action after a leftward touch threshold. Vertical intent and cancellation reset tracking. The outer 24px edge is left to system navigation. Keyboard focus exposes the same action. Successful recycle closes matching panes/tabs and offers ten-second Undo. Settings provides a persistent Trash dialog with per-note Restore. SaveError, Saving and dirty documents are blocked, and deletion also checks native dirty state. Navigation requests predating a recycle operation cannot reopen its removed document.

Core adds shell RPCs `documents.trash` and `documents.restore` within protocol v1. Existing plugin capabilities retain their allowlist. Restoration keeps the original source bytes, identity and anchors. A durable restore marker records raw file hashes. Startup completes interrupted restores before considering deletion tombstones. Both files are validated before the complete transaction folder moves into a retained restored archive. Active identity conflicts retain copies and raise an error.

Windows has opt-in phase diagnostics controlled by `GITPAD_EXIT_TRACE`, buffered until process exit, and a manual-close measurement script. These observe the existing close behavior. No latency fix has been selected before baseline measurements.

## Automated Tested

- TypeScript and ESLint passed after the initial mobile and trash changes. Final-head reruns remain required.
- Vitest 52 passed and release/provenance/transport tests 23 passed.
- Core 49 passed, including normal repeated trash/restore round trips, restart, exact source bytes, three simulated interrupted restore stages, and active target conflict. Raw-byte hash checks and startup isolation after a restore target conflict passed in the subsequent 49-test run.
- Four focused browser additions passed for 320px chrome and viewport docking, settings/calendar navigation, Undo identity, and swipe thresholds/vertical intent.
- The full 45-test browser run returned 44 passed and one context-teardown timeout in the image drop/paste case. The same case passed individually under unchanged timeout settings. The full run remains failed.
- A separate safety run passed SaveError protection and failed its second-pane recycle test because the test attempted recycling before its initial sidecar reconstruction was saved. The test now explicitly saves the second pane before recycling; both safety cases passed on rerun.
- Initial browser attempts with the old top-toolbar and single-button-per-note assumptions were stopped after those assertions failed. Assertions now identify note-open controls separately from trash actions and check the requested bottom toolbar on mobile.
- Windows Release development build with initial exit diagnostics compiled with zero warnings and zero errors. This preceded later trash changes.
- Android x86_64 development probe and test-only instrumentation APKs built successfully. The product is signed with the existing identity and marked development. The probe is explicitly development-stamped and outside release assets.

Logs and retained failed traces are under `artifacts/ui-v11-*`. A real 320px browser screenshot is `artifacts/ui-v11-mobile-320.png`.

## Native Verified

The development probe passed Android startup/Unicode/save and single-pane real IME checks. Viewport height changed from 708 to 433 CSS px, with a 598px native IME bottom inset. The writing pane retained 261 CSS px and the toolbar bottom matched the resized viewport. This probe predates subsequent source refinements and is not final package qualification. Its raw report and package identity are retained alongside the actual screenshot. [Native keyboard](docs/design/calm-precision/ui-v11/android-keyboard-probe.png) · [Measurements](docs/design/calm-precision/ui-v11/android-keyboard-probe.json) · [Package identity](docs/design/calm-precision/ui-v11/android-probe-identity.json)

A first two-pane instrumentation attempt failed because its New note command was hidden while writing. The instrumentation now opens Calendar before creating a note, and uses the visible More-menu command for a second pane. The corrected instrumentation passed the two-pane IME test and process restart, Activity recreation and resume checks. Split writing bodies measured 160 and 170 CSS px with the keyboard visible. The captured development frame also exposed a retained More menu and the old multi-row second-pane controls. Source refinements now close that menu after selection and use compact Save/Close controls with second-pane status in the mobile footer; those refinements await a fresh native probe. [Observed split frame](docs/design/calm-precision/ui-v11/android-two-pane-keyboard-probe.png) No final UI v1.1 native acceptance is claimed.

## Not Verified

Remaining Android coverage includes long-document last-line visibility, selection after native touch, updated split-pane chrome, 320px/393px native widths, rotation, navigation modes, native trash/restore and Chinese IME composition.

Windows user-close distributions, UI-thread stalls, pending-save shutdown, repeated close/reentry behavior, process residue and before/after comparisons remain pending. Structured diagnostics alone establish no performance improvement.

Additional required safety coverage includes active/background tabs, revision conflicts through RPC, duplicate operations, interrupted restore in a real subprocess, restoration failure display and restart workspace reconciliation. Final complete CI, source/license review, independent rendered design review and final native screenshots remain pending.

## Blocked

The mission explicitly preserves the earlier Computer Use stop and prohibits reinitializing input automation to bypass it. Native Windows close measurements require an operator using the X button while the read-only sampler runs. The sampler never sends close input or terminates the app. It distinguishes the native close event from physical click dispatch latency and reports a missing visibility sample rather than estimating it.

A measurement command, after the current Windows development build is refreshed, is

~~~powershell
.\scripts\measure-windows-exit.ps1 -Executable '<instrumented exe>' -VaultPath '<dedicated synthetic vault>' -OutputDirectory '<fresh evidence directory>' -Scenario empty -Runs 5
~~~

Repeat with ordinary, long, image-heavy and two-pane documents, enabled plugins and pending saves. Record machine load and inspect the source pair after each run. The script computes nearest-rank P95, median and maximum from actual process observations. PowerShell parsing passed. The empty-scenario sampler is armed on a synthetic vault and awaits five operator closes. Each window must be closed using X; subsequent rounds reopen automatically. Other scenarios and its distribution output remain unverified.

## Release Impact

Both platform packages and their native evidence must be rebuilt after the final merge. This branch is unqualified for release. Existing public alpha assets and the annotated tag identify the accepted previous source.

The 17 release gates must bind to a fresh accepted source and packages. Build, signature, native runtime/features, source fidelity, anchors, recovery, plugins, Safe Clear, security, licenses and asset verification all require final qualification. This task authorizes no automatic new tag or public Release. Publication/version handling must account for the alpha tag that already exists.

