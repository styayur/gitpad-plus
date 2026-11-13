# Architecture

The native MAUI shell uses platform CalendarView handlers and a local HybridWebView. Vite packages React/Milkdown assets with relative URLs. No runtime website is required. The exact MAUI transport source is vendored with its MIT notice. Windows uses single-instance activation forwarding, Mica Alt and an Acrylic calendar flyout. Android routes initial/new intents after the editor-ready handshake. Actual native qualification and package-specific limits are recorded in the acceptance report.

The portable Core groups domain identities, frontmatter, storage, index and protocol in one small independently testable assembly. SQLite is a projection; Markdown/Sidecar pairs are authoritative. The test-only ASP.NET host calls the same Bridge and VaultStore rather than replacing them with browser localStorage.

Web modules separate the Markdown AST/source mapper, editor state/identity, anchors, RPC transport, plugin host and React shell. The SDK has no imports from host internals. Official plugins consume it like other trusted modules. Only reviewed packaged modules may execute in this alpha; capability wrappers do not sandbox JavaScript sharing the same realm.

DocumentSession is a per-note single-writer queue. It snapshots edits, sends the previous acknowledged revision/hash, retains a newer buffer during delayed saves and reports errors without dropping content. Native requests are serialized at the WebView boundary. A timeout/cancellation cannot undo a committed native operation; reload before retrying uncertain writes.

Block tracking traverses nested block nodes and persists structural paths in the sidecar. Invertible identity steps participate in actual ProseMirror history so Undo/Redo restores identities without a content-keyed cache; ordinary copies allocate fresh UUIDv7 IDs. Each rendered editor session owns a distinct DOM instance. Two distinct notes can be edited in separate panes; the workspace stores the secondary note ID. Recovery explicitly archives all conflicting inputs and any open editor buffer before applying selected Markdown. Portable/browser and native evidence are recorded separately.
