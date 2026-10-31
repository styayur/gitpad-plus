# Data format v1

Vault/Journal/<UUIDv7>.md contains YAML frontmatter: schemaVersion, id, date (YYYY-MM-DD), title, tags, createdAt and updatedAt. Rating and richer migrations remain pending. Unknown frontmatter fields survive edits. Unmodified saves return without rewriting bytes.

Vault/.gitpad/anchors/<UUIDv7>.json contains schemaVersion, documentId, revision, contentHash (lowercase SHA-256 of the entire UTF-8 Markdown file), blocks and selections. Block IDs are UUIDv7, source offsets use UTF-16 code units in the Markdown body, and deleted IDs become tombstones. Selection offsets refer to rendered block text, not raw Markdown, and use normalizationVersion 1 (no Unicode normalization). Prefix/suffix and exact quote are persistent authority. Offsets are interoperable between JS strings and C# strings; byte offsets are never substituted.

A save writes new.md/new.json durably under .gitpad/transactions/<id>, retains previous copies and flushes a transaction descriptor. Same-volume renames replace Markdown then Sidecar. Startup rolls a valid pending transaction forward, verifies the resulting pair, and removes its staging directory. External-content conflicts retain both previous and staged copies and raise RecoveryRequired. Process-interruption tests cover all three checkpoints. Directory metadata fsync, full power-loss guarantees and adversarial concurrent filesystem mutations are not yet qualified across native platforms.

Deleted documents move to .gitpad/trash with a durable tombstone; startup completes interrupted trash moves. Clear-local-data also removes trash after confirmation. Assets use content-hash filenames; PNG/JPEG/GIF up to 16 MB are accepted by signature, SVG/HTML rejected. The format does not yet implement a complete hostile-image decoder policy.

The index.sqlite database contains metadata/date tables and an FTS5 title/body index. Deleted/corrupt indexes are rebuilt from validated source pairs. Settings are a replaceable JSON file. Workspace tabs/active note are saved to session.json with a monotonic sequence; startup filters deleted documents and restores the active note. Late workspace writes are rejected. E2EE is not implemented.
