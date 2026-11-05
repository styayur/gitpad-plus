# GitPad+ — Temporal Writing Workspace / Calm Precision

## Intent and product world

A person returns to their own record of ordinary days, finds a date, and writes without managing a dashboard. Time is the index; Markdown is the durable page. The workspace should feel quiet, legible and exact, with visible save/recovery state.

Domain: days, month grids, journal pages, remembered moments, persistent anchors, parallel notes, local ownership. Color world: graphite pencil, the cool white of a writing sheet, pale graphite dividers, notebook index ink, a blue date bookmark, muted amber for attention. Signature: the **date track** — a circular selected day, small note-count markers, a selected-day heading and a compact date on each open tab. The calendar carries visual weight while browsing; the quiet page and its title take over while writing.

Rejected defaults: identical date/note cards → unboxed calendar cells and plain selectable note rows; a dashboard full of bordered action buttons → grouped commands and a note action menu; decorative dark green wash → neutral graphite surfaces with one meaningful blue accent. No invented notebook hierarchy: this alpha owns one managed local vault. Navigation says Journal and Notes, never implies multi-vault support.

## Typography

UI: `Segoe UI Variable Text`, `Segoe UI`, platform sans-serif. This is a deliberate Windows legibility choice; Android uses its platform sans-serif. No remote fonts. Page: the same family, 17px / 1.8, in an 840px column including 40px side insets (760px maximum text measure), giving mixed Chinese/Latin text a stable rhythm. Headings 28/23/19px, 600, slightly tighter tracking; page title 28px/600. Chrome 13px, control labels 13px/500, metadata 12px/400. Month 19px/600; selected day heading 16px/600. Date/count values use tabular numerals. Display-size headings never crowd the mobile page (24px title, 26px H1).

## Semantic vocabulary and tokens

Web primitives are defined once in `web/app/style.css`, consumed through semantic `--journal-*`, `--page-*`, `--ink-*`, `--date-*`, `--control-*`, `--line-*`, `--notice-*` tokens. Native window styling owns materials/title bar only; it communicates Windows accent/high contrast to the WebView without changing stored note/settings schemas.

| Role | Light | Dark |
|---|---|---|
| Journal canvas | #f5f6f8 | #202124 |
| Writing page | #ffffff | #27282c |
| Transient surface | #ffffff | #303136 |
| Primary ink | #24272e | #eceef3 |
| Secondary ink | #565e6b | #bac0cc |
| Metadata ink | #677180 | #a5adbb |
| Date accent fallback | #285fc4 | #a3c2ff |
| Input well | #edeff3 | #222327 |

Windows native accent is an optional input. Its actual RGB is used for a small selection marker/focus ring; accent-filled controls choose black or white text by luminance. Page text uses ink colors rather than accent. Other platforms keep the blue fallback. Color never stands alone for selected/error/save states. System light/dark follows media and native theme; explicit app light/dark overrides it. High contrast uses system Canvas, CanvasText, ButtonFace, ButtonText, Highlight, HighlightText and GrayText, no material/shadow. It applies even with explicit app dark/light selected.

## Space, surfaces and controls

4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48. Dense commands, open writing page. Sidebar 288px (resizable 264–400px); desktop header 56px, tabs 44px, commands 48px, status 28px. Primary commands are at least 40px high; coarse pointer/mobile 44px. Desktop dates use compact seven-column targets, roughly 36px wide by 44px high; mobile calendar targets are at least 44px in each dimension. Radius: controls 6px, active note row 8px, transient/dialog 12px, selected date circular. A calendar cell is not a decorative card.

Depth strategy: opaque surface steps for functional content. Only transient menus/dialogs use a restrained shadow/ring. Use one separator at structural boundaries, no repeated outlined cards. Mica Alt stays at the supported Windows window backdrop/title area; readable Web content is opaque. Native calendar flyout uses Acrylic with an opaque fallback; high contrast substitutes system surfaces. No blur on the editor, no gradient, no background animation. Respect reduced motion; commands never animate layout.

## Components and hierarchy

- Header: quiet brand/Journal identity, calendar toggle, Open beside, recovery and settings. Icons have accessible names and native title hints; avoid tooltips as the only label.
- Calendar: month heading leads, Previous/Next and Today are secondary. Seven weekday columns, uncluttered date cells; ring for today, filled circle for selection, a small count/decoration below. Long plugin decoration labels clip visually with complete title text.
- Note list: selected date and New note, inset search, plain note rows with one selected surface/marker. Empty day/search state has plain actionable copy. Date/UUID metadata is subordinate.
- Tabs: compact date + title/tag, independent close target, selected page-toned surface and an accent marker. Tab titles retain full document ID for existing link/identity workflows. Arrow/Home/End keyboard navigation; close via explicit button.
- Page heading: date/context above an editable title. Save and Image are direct; links/source/paste/delete are grouped in an accessible native details menu. Never change serialization/title logic for styling.
- Formatting: plugin-owned commands remain plugin-owned. Visually grouped icon/short-label buttons, preserving original accessible names. Single horizontal scroll row on narrow displays, no multi-row wall of buttons.
- Second pane: own title/status and commands, visibly distinct boundary, independently scrollable page; no shared document state.
- At <=760px width or <=600px height, a two-page writing workspace scrolls vertically instead of shrinking either editor to zero. Primary body reserves 160px; the secondary pane reserves 320px with at least 120px for its body. The workspace accepts keyboard focus for PageUp/PageDown scrolling; the shell status stays outside it.
- Status: one Web status bar, with native shell no duplicate. Saved/Saving/Unsaved/SaveError remain accurate; error text wraps. Git remains NotConfigured, never suggests active sync.
- Settings/recovery/clear: native HTML dialog manages modality and Escape, with explicit focus cycling at its keyboard boundaries; focus returns to trigger. Dialog scrolls within the viewport, settings are grouped by purpose, and destructive data actions are separated. Only the topmost dialog accepts focus. Confirmation and recovery semantics remain unchanged.

## Responsive behavior and accessibility

At <=760px, one-column workspace with calendar navigation toggled by Calendar. Opening a note focuses the writing view; returning to dates is explicit. Header uses two compact rows. Tabs/formatting scroll horizontally, title/actions stay compact, body padding 20px. Layout uses dynamic viewport height and `interactive-widget=resizes-content` with Android AdjustResize. Keyboard-visible viewport retains scrollable editor and reachable toolbar, never hides commands permanently. Do not imitate software keyboard using an image or claim browser emulation as native Android evidence.

All controls: hover, pressed, focus-visible, disabled. Focus 2px with offset, visible in high contrast. Dialog semantics, form labels, real buttons/select/details. Calendar arrow keys move by day/week, Home/End within week, PageUp/PageDown month, Enter/Space select. Note selection uses aria-current. Overflow regions remain keyboard scrollable. Loading and errors remain textual/live; no fake status. Honor zoom and 320px widths; preserve usable editor line width at 1366/1920 screens and 100/125/150/200% browser scaling. Native DPI and software keyboard require actual native checks, separately documented from browser coverage.

Plugin preference writes serialize at the settings UI boundary. While a native plugin operation is pending, disable all editable preferences, Save settings and Clear data; show a textual status. This includes Theme, Markdown Peek and Native word selection: editing them during the awaited native write would otherwise be overwritten by its earlier settings snapshot. A later action must read the completed settings state. Keep errors visible and permit closing the dialog.

The empty-page display date (`.welcome-date > span`) is an intentional date-accent exception: on an empty day, time itself is the focal point. It does not color document prose. Fixed brand assets (application icon and splash) use the approved #285FC4 blue; native system accent remains an input for interactive date/focus states. The earlier #306C52 asset values were stale tokens, not a second brand palette.

Native Windows title text uses MAUI TitleBar.ForegroundColor, with caption buttons owned by AppWindow. Both follow effective app theme or high-contrast system colors. Startup window bounds are clamped once to the actual display work area using physical AppWindow coordinates. Do not change global DPI to compensate for application layout.

Android requires the application-level MAUI WindowSoftInputModeAdjust.Resize policy as well as Page and owning Grid SafeAreaEdges.All. MAUI's default application policy otherwise restores AdjustPan even if a window-level value requests Resize. Acceptance must observe the real viewport shrinking after WindowInsets reports IME visibility, then check toolbar/editor/status geometry and unchanged Markdown/anchors.

## Review discipline

Methodology: Dammyjay93/interface-design at 2f9be3206855bcb2d1d0af262c8bae25cba6658d; read SKILL.md plus design-review and design-deslop commands. It supplies the review lenses, not a dashboard template. Screenshots must be actual application output. Review focal point, typography/color, surface/depth, composition, states, and reuse independently; record findings and fixes, with untested/native limits explicit. No stock moodboard, decorative artwork or fabricated runtime screenshot is needed for this writing tool.

## Mobile workflow v1.1, in progress

On writing widths up to 760 CSS px, use the existing editable title as the single
document heading, with Calendar, Settings, Save, Image and More in its action row.
At 360px and below, Settings and Image move into More. Calendar and Save retain
44px targets. Browsing provides Back to writing when a document is open.

The existing plugin-owned formatting strip docks to the bottom of the resized
viewport. A 48px reserved strip keeps the shell status immediately above it.
Native SafeArea and AdjustResize own keyboard compensation. CSS adds no keyboard
height or second native inset. Commands target the editor that most recently
received focus, preserving its instance and selection.

A note row reveals an 88px trash action after a leftward touch of at least 48px.
The first 24px at the screen edge is reserved for system navigation. Vertical
intent cancels the gesture. Recycling requires the explicit trash action.
Keyboard focus reveals the same action. Undo remains available for ten seconds,
and Settings exposes persistent Trash and Restore. Native validation is pending.
