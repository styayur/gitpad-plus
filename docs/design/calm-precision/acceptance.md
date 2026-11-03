# UI acceptance evidence

This record distinguishes browser regression, actual Windows runtime and actual Android emulator instrumentation. A development probe is not a public release candidate or universal Android package.

## Automated regression

At implementation commit `ceb0ff94bec257ab373e21ed1e113745938256c4`, [CI run 41551099044](https://github.com/styayur/gitpad-plus/actions/runs/41551099044) passed portable and Windows build jobs. The portable job runs TypeScript, ESLint, 49 Vitest tests, 16 release-gate unit tests, the editor/SDK build, 43 Core tests, real-file Playwright integration and dependency/license inventory. This does not turn a release-gate unit test into a successful product licensing closure.

The completed MAUI title-bar implementation at `aca8305b8bc222ef005217b1d5bd7e6d71336cce` also passed both jobs in [run 41552439846](https://github.com/styayur/gitpad-plus/actions/runs/41552439846). Final PR checks must be assessed against the PR's current head, since this evidence/documentation commit follows that implementation.

CI completed all 39 browser tests (1.9 minutes). The expanded suite contains the original 31 functional regressions plus eight design/accessibility/native-appearance/viewport/pending-plugin checks. Assertions cover exact source fixtures, UUID links, selection repair, separate panes, recovery, images, source editing, autosave and restart; existing assertions were retained when selectors moved behind the note action menu.

The local complete run returned 38 passed and one context-teardown timeout. A focused rerun reproduced the teardown timeout. Trace shows the final sidecar-equality and updatedAt assertions completed before the After Hooks/context close; Close context then exceeded 45 seconds. The failure is retained, not counted as a local pass and not hidden by increasing timeouts. Initial developer-server startup and a concurrent Vite output-directory lock also failed locally; builds were subsequently run with capture servers stopped. Raw logs/traces remain in the ignored evidence directory. CI is the clean full-suite result.

## Windows native

- Real Windows 11 desktop, 2880×1800; original scale 200% (192 DPI), dark OS, contrast theme None (flags 126).
- Actual per-window DPI observations: 100%=96, 125%=120, 150%=144 and original 200%=192. Screenshots were inspected at each tested scale. A diagnostic sample returning zero is excluded as invalid.
- Aquatic system contrast theme was applied, with the app explicitly light. Actual editor and native calendar showed system colors; the native calendar opened with an opaque fallback. Theme was restored to None (flags 126); scale restored to 200%, resolution unchanged.
- Native settings opens, Escape closes it and focus returns to the trigger. Initial UWP HighContrastChanged subscription failed with COM 0x80070490; replaced by Win32-compatible ThemeSettings. A sealed FlyoutPresenter style mutation crashed the initial picker; replaced by mutation of its existing AcrylicBrush before opening.
- Startup bounds now fit the actual work area at high DPI, keeping the status bar visible. Caption text uses the MAUI TitleBar foreground API in addition to AppWindow caption-button colors.
- Three synthetic Markdown files plus their three sidecars were hashed before/after theme, DPI and contrast checks: all six unchanged. Full hashes are in source-pair-comparison.json. No personal vault was used.

The final Windows publish includes the completed plugin serialization UI and concrete MAUI TitleBar. It was launched with the synthetic vault; light and saved dark themes were inspected, including caption colors. Aquatic contrast was then reapplied to this final build, the native picker opened, and both actual editor and picker were captured. None was restored again (flags 126). The light and dark screenshots above are from this final publish.

## Android native

API 36 Android 16 Pixel 7 x86_64 emulator, 720×1600, density 320, actual signed Release-configuration development APK with QuickProbe/no AOT. The emulator runs its real WebView and software keyboard; it is not a browser viewport approximation. The permanent certificate is unchanged. Physical-device qualification and Chinese IME composition are not established by this test.

The real keyboard test initially failed: MAUI's application policy restored AdjustPan despite a window-level Resize request. Setting application WindowSoftInputModeAdjust.Resize plus Page/Grid SafeAreaEdges.All fixed the observed native behavior. Passing instrumentation measured full innerHeight 708 → keyboard innerHeight 433, 131.5px of scrollable editor, softInputMode 16, native IME bottom inset 598 physical pixels. Toolbar and Local/Git status remained above the keyboard; exact Markdown and block identities remained unchanged. The screenshot with visible software keyboard is required evidence; earlier captures taken before the IME animation completed are excluded.

The rich native feature phase also exposed a fast repeat plugin-toggle race. Controls now serialize preference writes and expose pending/disabled feedback; browser regression delays the real native operation response to test it. On the final APK, the first rich rerun found the previous failed run had retained the toolbar-disabled preference. After enabling it through the actual Android settings UI, the complete phase passed: nested folds, decoded local image, native-touch source peek and selection link, persisted nested identities, SQLite search, toolbar disable and completed reactivation. The test waits for the completed native preference operation before accepting another action; it does not merely wait for a command to appear.

The final APK keyboard phase also passed with the same 708→433 measurements. [Native build identities](native-build-identities.json) record the package SHA-256 and confirm the pulled installed base.apk is byte-identical. The final development APK was built from the working tree while Windows-only title-bar changes and evidence files were being finalized; it is deliberately labeled development, not a clean release. [Rich features](android-features-report.json) and [keyboard](android-keyboard-report.json) contain the actual machine reports.

The same installed APK passed smoke, smoke-restart, smoke-recreate and smoke-resume. Native activity recreation was explicitly observed; background/foreground was requested and completed. Unicode source, live block UUIDs, official calendar plugin object UUID and advancing activation count were checked across these phases. Each phase has its own `android-smoke*-report.json` here.

Capture review rejected several intermediate Android images whose filenames described the requested theme but whose composed frame still showed the prior state. The committed keyboard frame visibly contains the real IME; settings/theme captures were inspected individually rather than accepted by filename. The historical baseline is labeled separately.

The browser mobile editor capture was rechecked after two animation frames and a settled paint. Its hash matched the image already committed, so no replacement was needed; the initial concern came from reading the small preview. At 393×852 its status bar occupies y=824…852; both status strings occupy y=831.5…845.5 with readable dark-theme ink. [Measured geometry](mobile-footer-metrics.json) records the check; this required no product-code change.

## Boundaries

No storage schema, UUIDv7 generation, Markdown serializer, plugin protocol, recovery semantics, permanent signing identity, package lock or release workflow changed. Native file-drop container ownership is retained. Historical manual drag/drop acceptance from the previous release task is not claimed as a fresh manual acceptance of this UI branch. Existing browser image persistence regression and Android native image checks supply the automated coverage for this branch.

Win2D licensing/rebuild and public release closeout remain separate work. This UI PR creates no tag, publishes no release and merges no PR.

## Platform references

Implementation uses the existing framework APIs described by Microsoft's [MAUI TitleBar](https://learn.microsoft.com/en-us/dotnet/maui/user-interface/controls/titlebar?view=net-maui-10.0), [safe areas](https://learn.microsoft.com/en-us/dotnet/maui/user-interface/safe-area?view=net-maui-10.0), [Android input mode](https://learn.microsoft.com/en-us/dotnet/maui/android/platform-specifics/soft-keyboard-input-mode?view=net-maui-10.0), [Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica) and [Win32 ThemeSettings](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.ui.system.themesettings?view=windows-app-sdk-1.8) documentation. No dependency upgrade was needed.
