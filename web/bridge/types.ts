// SPDX-License-Identifier: AGPL-3.0-only
export interface Header { schemaVersion: 1; id: string; date: string; title: string; tags: string[]; createdAt: string; updatedAt: string }
export interface Block { id: string; kind: string; start: number; end: number; deleted: boolean; aliases?: string[] | null; path?: number[] | null }
export interface Anchor { id: string; blockId: string; exact: string; prefix: string; suffix: string; start: number; end: number; normalizationVersion: 1 }
export interface Sidecar { schemaVersion: 1; documentId: string; revision: number; contentHash: string; blocks: Block[]; selections: Anchor[] }
export interface Note { header: Header; body: string; sidecar: Sidecar }
export interface Summary { id: string; date: string; title: string; tags: string[] }
export interface Settings { markdownPeek: boolean; nativeWordSelection: boolean; theme: 'system' | 'light' | 'dark'; disabledPlugins?: string[] | null }
export type LocalState = 'Unsaved' | 'Saving' | 'Saved' | 'SaveError';
export interface SaveRequest { id: string; body: string; title: string; tags: string[]; expectedRevision: number; expectedHash: string; blocks: Block[]; selections: Anchor[] }
export interface RpcRequest { protocolVersion: 1; requestId: string; method: string; params: unknown }
export interface RpcResponse { protocolVersion: number; requestId: string; result: unknown; error: {code: string; message: string} | null }
export interface Transport { send(request: RpcRequest): void; subscribe(listener: (response: RpcResponse) => void): () => void }
