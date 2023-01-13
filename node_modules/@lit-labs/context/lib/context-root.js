import{ContextRequestEvent as t}from"./context-request-event.js";
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class e{constructor(){this.pendingContextRequests=new Map,this.onContextProvider=e=>{const s=this.pendingContextRequests.get(e.context);s&&(this.pendingContextRequests.delete(e.context),s.forEach((s=>{const c=s.element,i=s.callback;c&&c.dispatchEvent(new t(e.context,i,!0))})))},this.onContextRequest=t=>{if(!t.subscribe)return;const e={element:t.target,callback:t.callback};let s=this.pendingContextRequests.get(t.context);s||(s=new Set,this.pendingContextRequests.set(t.context,s)),s.add(e)}}attach(t){t.addEventListener("context-request",this.onContextRequest),t.addEventListener("context-provider",this.onContextProvider)}detach(t){t.removeEventListener("context-request",this.onContextRequest),t.removeEventListener("context-provider",this.onContextProvider)}}export{e as ContextRoot};
//# sourceMappingURL=context-root.js.map
