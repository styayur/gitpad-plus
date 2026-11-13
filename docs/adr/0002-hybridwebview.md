# ADR 2: hybridwebview

Status: accepted for the development implementation.

Ship local Vite resources inside HybridWebView; use versioned allowlisted JSON RPC, not arbitrary native method invocation.

Consequence: validate behavior with relevant automated tests and native acceptance before release.
