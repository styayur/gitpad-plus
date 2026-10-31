# Architecture

The native MAUI shell uses platform CalendarView handlers and a local HybridWebView. Vite packages React/Milkdown assets with relative URLs. No runtime website is required. The exact MAUI transport source is vendored with its MIT notice. The native shell's platform UI, activation, lifecycle and Mica behavior still require native verification.

The portable Core groups domain identities, frontmatter, storage, index and protocol in one small independently testable assembly. SQLite is a projection; Markdown/Sidecar pairs are authoritative. The test-only ASP.NET host calls the same Bridge and VaultStore rather than replacing them with browser localStorage.

Web modules separate the Markdown AST/source mapper, editor state/identity, anchors, RPC transport, plugin host and React shell. The SDK has no imports from host internals. Official plugins consume it like other trusted modules. Only reviewed packaged modules may execute in this alpha; capability wrappers do not sandbox JavaScript sharing the same realm.

DocumentSession is a per-note single-writer queue. It snapshots edits, sends the previous acknowledged revision/hash, retains a newer buffer during delayed saves and reports errors without dropping content. Native requests are serialized at the WebView boundary. A timeout/cancellation cannot undo a committed native operation; reload before retrying uncertain writes.

Current limitations: top-level block identity coverage is stronger than nested-node coverage; native multi-pane workspace and interactive external-file reconciliation are unfinished. These are v0.1 gaps, not v0.2 roadmap items.
