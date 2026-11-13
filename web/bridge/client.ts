// SPDX-License-Identifier: AGPL-3.0-only
import { v7 } from 'uuid';
import type { RpcRequest, RpcResponse, Transport } from './types';

export class RpcClient {
  private pending = new Map<string, {resolve: (x: unknown) => void; reject: (e: Error) => void; clean: () => void}>();
  private unsubscribe: () => void;
  constructor(private transport: Transport, private timeoutMs = 10_000) {
    this.unsubscribe = transport.subscribe((response) => {
      const entry = this.pending.get(response.requestId);
      if (!entry) return;
      entry.clean();
      if (response.protocolVersion !== 1) entry.reject(new Error('Protocol mismatch'));
      else if (response.error) entry.reject(Object.assign(new Error(response.error.message), {code: response.error.code}));
      else entry.resolve(response.result);
    });
  }
  call<T>(method: string, params: unknown = {}, signal?: AbortSignal, timeoutMs=this.timeoutMs): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
      const requestId = v7();
      const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(requestId); };
      const abort = () => { clean(); reject(new DOMException('Aborted (native operation may already have committed)', 'AbortError')); };
      const timer = setTimeout(() => { clean(); reject(new Error('Bridge timed out; reload before retrying a write')); }, timeoutMs);
      this.pending.set(requestId, {resolve: (x) => resolve(x as T), reject, clean});
      signal?.addEventListener('abort', abort, {once: true});
      try { this.transport.send({protocolVersion: 1, requestId, method, params}); }
      catch (e) { clean(); reject(e); }
    });
  }
  dispose() {
    this.unsubscribe();
    for (const entry of [...this.pending.values()]) { entry.clean(); entry.reject(new Error('Bridge disconnected')); }
  }
}

declare global { interface Window { HybridWebView?: { SendRawMessage(message: string): void } } }
export class NativeTransport implements Transport {
  send(request: RpcRequest) {
    if (!window.HybridWebView) throw new Error('Native bridge unavailable');
    window.HybridWebView.SendRawMessage(JSON.stringify(request));
  }
  subscribe(listener: (response: RpcResponse) => void) {
    const handler = (event: Event) => {
      try { const value: unknown = JSON.parse((event as CustomEvent<{message: string}>).detail.message); if (value && typeof value === 'object' && 'requestId' in value) listener(value as RpcResponse); }
      catch { /* Malformed unsolicited messages cannot complete a pending request. */ }
    };
    window.addEventListener('HybridWebViewMessageReceived', handler);
    return () => window.removeEventListener('HybridWebViewMessageReceived', handler);
  }
}
