# Architecture

The native MAUI shell uses platform CalendarView handlers and a local HybridWebView. Vite packages React/Milkdown assets with relative URLs. No runtime website is required. The exact MAUI transport source is vendored with its MIT notice. Windows uses single-instance activation forwarding, Mica Alt and an Acrylic calendar flyout. Android routes initial/new intents after the editor-ready handshake. Actual native qualification and package-specific limits are recorded in the acceptance report.

The portable Core groups domain identities, frontmatter, storage, index and protocol in one small independently testable assembly. SQLite is a projection; Markdown/Sidecar pairs are authoritative. The test-only ASP.NET host calls the same Bridge and VaultStore rather than replacing them with browser localStorage.

Web modules separate the Markdown AST/source mapper, editor state/identity, anchors, RPC transport, plugin host and React shell. The SDK has no imports from host internals. Official plugins consume it like other trusted modules. Only reviewed packaged modules may execute in this alpha; capability wrappers do not sandbox JavaScript sharing the same realm.

DocumentSession is a per-note single-writer queue. It snapshots edits, sends the previous acknowledged revision/hash, retains a newer buffer during delayed saves and reports errors without dropping content. Native requests are serialized at the WebView boundary. A timeout/cancellation cannot undo a committed native operation; reload before retrying uncertain writes.

Block tracking traverses nested block nodes and persists structural paths in the sidecar. Invertible identity steps participate in actual ProseMirror history so Undo/Redo restores identities without a content-keyed cache; ordinary copies allocate fresh UUIDv7 IDs. Each rendered editor session owns a distinct DOM instance. Two distinct notes can be edited in separate panes; the workspace stores the secondary note ID. Recovery explicitly archives all conflicting inputs and any open editor buffer before applying selected Markdown. Portable/browser and native evidence are recorded separately.

## Local trash restoration

Protocol version 1 adds two shell RPC methods, documents.trash and
documents.restore. The former returns NoteSummary entries from retained
tombstones. The latter accepts an id and returns the original Note after
restoring the exact source pair. Plugin capability grants are unchanged.

Restore rejects an occupied active identity before recording its intent. A
restoring.json record binds the retained Markdown and sidecar hashes. Restart
recovery completes that intent before applying old deletion tombstones. After
both original files validate, the complete tombstone folder moves atomically
under .gitpad/restored, and the disposable index is rebuilt. The archive
preserves the previous deletion transaction. Restoring a different source over
an occupied identity raises a conflict and retains the source copies.
