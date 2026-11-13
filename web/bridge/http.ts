// SPDX-License-Identifier: AGPL-3.0-only
// Development/test adapter only. Production native bundles never use an HTTP server.
import type { RpcRequest, RpcResponse, Transport } from './types';
export class HttpTransport implements Transport {
  private listeners = new Set<(response: RpcResponse) => void>();
  send(request: RpcRequest) {
    void fetch('/rpc', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})
      .then(async response => { if(!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json() as RpcResponse; })
      .then(response => { for(const listener of this.listeners) listener(response); })
      .catch(e => { for(const listener of this.listeners) listener({protocolVersion:1,requestId:request.requestId,result:null,error:{code:'Disconnected',message:String(e)}}); });
  }
  subscribe(listener: (response: RpcResponse) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
}
