# Links and anchors

Accepted forms: gitpadplus://note/<UUIDv7>, optionally one ?block=<UUIDv7> or ?selection=<UUIDv7>. Unknown/repeated parameters, other schemes/hosts, userinfo and malformed UUIDs are rejected. C# and TypeScript implement and test the parser independently.

Resolve the document, then a live block (or explicit alias), then a persisted W3C-style TextQuoteSelector/TextPositionSelector. Quote/context must identify one candidate; multiple candidates are ambiguous, missing candidates require repair. An old numerical offset alone never chooses a duplicate quote. The editor selects/scolls only resolved targets. External file hash mismatches stop loading rather than using stale sidecar offsets.

Yjs RelativePositions are tagged with a continuous session identity and rejected by a fresh Y.Doc. The editor maintains a ProseMirror/Yjs projection and a minimal-update text session; persistent links do not serialize a temporary Y.Doc position as long-term truth. More complete live relative-position fallback integration remains a v0.1 gap.

Text Fragments export quote/context as a percent-encoded fragment; they are a browser-compatible expression, not permanent object identity or proof of native navigation support. Android manifest registration is present, but external OS activation dispatch and Windows URI registration still require implementation/validation. No installed-app URI handler is claimed as verified.
