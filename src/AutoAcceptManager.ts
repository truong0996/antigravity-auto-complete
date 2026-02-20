import * as vscode from 'vscode';
import * as http from 'http';
import * as WebSocket from 'ws';

// ─────────────────────────────────────────────────────────────────
// CDP-based Auto-Accept for Antigravity IDE
//
// How it works:
//   1. Connects to Antigravity's built-in remote debugging port (9000)
//      via Chrome DevTools Protocol (CDP).
//   2. Traverses ALL browser frames, including cross-origin iframes
//      (where the agent UI lives — unreachable via VS Code command IDs).
//   3. Finds "Run" / "Accept" / "Accept All" buttons by their visible
//      text and clicks them programmatically via DOM events.
//
// Security: The scan script reads ONLY button text to find click targets.
// No editor content, chat messages, tokens, or credentials are read.
// The CDP connection is strictly localhost (127.0.0.1) only.
//
// Performance:
//   • 2-second startup warmup — lets the IDE finish loading first.
//   • Adaptive polling — 500ms when recently active, 2000ms when idle.
//   • WebSocket connections are cached and reused across polls.
// ─────────────────────────────────────────────────────────────────

const CDP_PORT = 9000;
const STARTUP_DELAY_MS = 2000;
const FAST_INTERVAL_MS = 500;   // when agent is active
const IDLE_INTERVAL_MS = 2000;  // when nothing to click
const IDLE_AFTER_MS = 10000;    // go idle after 10s of no clicks

// Minimal script that runs inside each frame via CDP.
// Scans only for visible, clickable "run"/"accept" buttons.
const SCAN_SCRIPT = `(function(){
    var now = Date.now();
    if (!window.__aac_cd) window.__aac_cd = {};
    var cd = window.__aac_cd;
    var CD = { 'accept-all':5000, 'accept':5000, 'run':5000, 'confirm':5000 };
    for (var k in cd) { if (now - cd[k] > (CD[k]||15000)) delete cd[k]; }

    var SKIP = {STRONG:1,EM:1,P:1,LI:1,UL:1,OL:1,H1:1,H2:1,H3:1,H4:1,H5:1,
                H6:1,TABLE:1,TR:1,TD:1,TH:1,TBODY:1,THEAD:1,SECTION:1,ARTICLE:1,
                MAIN:1,HEADER:1,FOOTER:1,NAV:1,PRE:1,CODE:1,BLOCKQUOTE:1,LABEL:1,
                SCRIPT:1,STYLE:1,LINK:1,META:1,HTML:1,HEAD:1,BODY:1,IMG:1,SVG:1,
                PATH:1,INPUT:1,TEXTAREA:1,SELECT:1,OPTION:1,FORM:1,IFRAME:1};

    function scanDoc(root) {
        var els; try { els = root.querySelectorAll('*'); } catch(_) { return []; }
        var hits = [];
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            try { if (el.shadowRoot) hits = hits.concat(scanDoc(el.shadowRoot)); } catch(_) {}
            if (!el.tagName || SKIP[el.tagName]) continue;
            var txt = '', aria = '';
            try {
                txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                if (el.getAttribute) aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
            } catch(_) {}
            var m = aria || txt;
            if (!m || m.length > 60) continue;
            var reason = null;
            if (m.includes('accept all')) reason = 'accept-all';
            else if (m === 'accept' || m.startsWith('accept ') || m.endsWith(' accept')) reason = 'accept';
            else if (m.includes('confirm')) reason = 'confirm';
            else if (m === 'run' || m === '\\u2713 run') reason = 'run';
            if (!reason) continue;
            var rect; try { rect = el.getBoundingClientRect(); } catch(_) { continue; }
            if (rect.width === 0 && rect.height === 0) continue;
            if (rect.height > 50) continue;
            if (rect.top < 35 && reason === 'run') continue;
            var disabled = false;
            try {
                if (el.disabled || (el.getAttribute && el.getAttribute('aria-disabled')==='true')) disabled = true;
                if (typeof el.className === 'string' && el.className.includes('disabled')) disabled = true;
            } catch(_) {}
            if (disabled) continue;
            var isBtn = false;
            try {
                if (el.tagName==='BUTTON') isBtn = true;
                else if (window.getComputedStyle(el).cursor==='pointer') isBtn = true;
                if (!isBtn && el.getAttribute && (el.getAttribute('role')||'').includes('button')) isBtn = true;
                if (!isBtn && el.closest && (el.closest('button')||el.closest('[role="button"]')||el.closest('.monaco-button'))) isBtn = true;
            } catch(_) {}
            if (!isBtn) continue;
            if (el.closest && (el.closest('pre')||el.closest('code')||el.closest('.monaco-menu'))) continue;
            if (el.closest && (el.closest('.xterm-rows')||el.closest('.view-lines'))) continue;
            if (el.__aac_clicked && (now - el.__aac_clicked < 30000)) continue;
            if (cd[reason] && (now - cd[reason]) < (CD[reason]||5000)) continue;
            hits.push({ reason:reason, el:el, ck:reason,
                x:Math.round(rect.left+rect.width/2), y:Math.round(rect.top+rect.height/2) });
        }
        return hits;
    }

    var targets = scanDoc(document);
    var clicked = [];
    var hasAccept = targets.some(function(t){return t.reason==='accept-all'||t.reason==='accept';});
    for (var j = 0; j < targets.length; j++) {
        var t = targets[j];
        if (t.reason==='review' && hasAccept) continue;
        try {
            var o = {view:window,bubbles:true,cancelable:true,clientX:t.x,clientY:t.y,buttons:1};
            t.el.dispatchEvent(new PointerEvent('pointerdown',o));
            t.el.dispatchEvent(new MouseEvent('mousedown',o));
            t.el.dispatchEvent(new MouseEvent('mouseup',o));
            t.el.dispatchEvent(new PointerEvent('pointerup',o));
            t.el.click();
            t.el.__aac_clicked = now;
            cd[t.ck] = now;
            clicked.push(t.reason);
        } catch(_) {}
    }
    return JSON.stringify({clicked:clicked});
})()`;

export class AutoAcceptManager {
    private timeoutId: NodeJS.Timeout | undefined;
    private enabled: boolean = false;
    private outputChannel: vscode.OutputChannel;
    private connections: Map<string, any> = new Map();
    private lastClickTime: number = 0;

    constructor(initialEnabledState: boolean) {
        this.enabled = initialEnabledState;
        this.outputChannel = vscode.window.createOutputChannel('Antigravity Auto Accept');
        this.log('Extension activated. Warmup delay: ' + STARTUP_DELAY_MS + 'ms');
        setTimeout(() => this.scheduleNext(FAST_INTERVAL_MS), STARTUP_DELAY_MS);
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.log(enabled ? 'Auto-Accept Enabled' : 'Auto-Accept Disabled');
    }

    public isEnabled(): boolean { return this.enabled; }

    public reloadConfiguration(): void {
        this.log('Configuration reloaded');
    }

    private scheduleNext(delayMs: number): void {
        if (this.timeoutId) { clearTimeout(this.timeoutId); }
        this.timeoutId = setTimeout(async () => {
            if (this.enabled) { await this.mainLoop(); }
            const idle = (Date.now() - this.lastClickTime) > IDLE_AFTER_MS;
            this.scheduleNext(idle ? IDLE_INTERVAL_MS : FAST_INTERVAL_MS);
        }, delayMs);
    }

    private async getPages(): Promise<any[]> {
        return new Promise(resolve => {
            const req = http.get(
                { hostname: '127.0.0.1', port: CDP_PORT, path: '/json/list', timeout: 1000 },
                res => {
                    let body = '';
                    res.on('data', (c: string) => body += c);
                    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve([]); } });
                }
            );
            req.on('error', () => resolve([]));
            req.on('timeout', () => { req.destroy(); resolve([]); });
        });
    }

    private async connect(page: any): Promise<any> {
        const id = page.id;
        const existing = this.connections.get(id);
        if (existing && existing.ws.readyState === WebSocket.OPEN) { return existing; }
        if (existing) { try { existing.ws.close(); } catch (_) {} this.connections.delete(id); }

        return new Promise(resolve => {
            const ws = new WebSocket(page.webSocketDebuggerUrl);
            const conn = { ws, title: page.title || '', id: 1, pending: new Map<number, Function>(), contexts: new Map<string, number>() };
            const timer = setTimeout(() => { try { ws.close(); } catch (_) {} resolve(null); }, 3000);
            ws.on('message', (raw: Buffer) => {
                try {
                    const m = JSON.parse(raw.toString());
                    if (m.method === 'Runtime.executionContextCreated') {
                        const ctx = m.params?.context;
                        if (ctx?.auxData?.frameId) { conn.contexts.set(ctx.auxData.frameId, ctx.id); }
                    }
                    if (m.method === 'Runtime.executionContextDestroyed') {
                        const did = m.params?.executionContextId;
                        for (const [fid, cid] of conn.contexts) { if (cid === did) { conn.contexts.delete(fid); break; } }
                    }
                    if (m.id && conn.pending.has(m.id)) { conn.pending.get(m.id)!(m); conn.pending.delete(m.id); }
                } catch (_) {}
            });
            ws.on('open', async () => {
                clearTimeout(timer);
                this.connections.set(id, conn);
                await this.cdpSend(conn, 'Runtime.enable', {});
                await this.cdpSend(conn, 'Page.enable', {});
                resolve(conn);
            });
            ws.on('error', () => { clearTimeout(timer); resolve(null); });
            ws.on('close', () => { conn.pending.forEach((cb: Function) => cb(null)); conn.pending.clear(); this.connections.delete(id); });
        });
    }

    private cdpSend(conn: any, method: string, params: any): Promise<any> {
        return new Promise(resolve => {
            if (conn.ws.readyState !== WebSocket.OPEN) { return resolve(null); }
            const id = conn.id++;
            const t = setTimeout(() => { conn.pending.delete(id); resolve(null); }, 5000);
            conn.pending.set(id, (msg: any) => { clearTimeout(t); resolve(msg); });
            try { conn.ws.send(JSON.stringify({ id, method, params: params || {} })); }
            catch (_) { clearTimeout(t); conn.pending.delete(id); resolve(null); }
        });
    }

    private collectFrameIds(tree: any, result: string[]): void {
        if (!tree) { return; }
        if (tree.frame?.id) { result.push(tree.frame.id); }
        if (tree.childFrames) { for (const c of tree.childFrames) { this.collectFrameIds(c, result); } }
    }

    private async scanPage(conn: any): Promise<boolean> {
        let didClick = false;
        try {
            const ftResult = await this.cdpSend(conn, 'Page.getFrameTree', {});
            const frameIds: (string | null)[] = [];
            if (ftResult?.result?.frameTree) { this.collectFrameIds(ftResult.result.frameTree, frameIds as string[]); }
            if (frameIds.length === 0) { frameIds.push(null); }

            for (const frameId of frameIds) {
                const evalParams: any = { expression: SCAN_SCRIPT, returnByValue: true, userGesture: true };
                if (frameId) {
                    const ctxId = conn.contexts.get(frameId);
                    if (!ctxId) { continue; }
                    evalParams.contextId = ctxId;
                }
                const r = await this.cdpSend(conn, 'Runtime.evaluate', evalParams);
                if (!r?.result?.result?.value) { continue; }
                const data = JSON.parse(r.result.result.value);
                if (data.clicked?.length > 0) {
                    this.log(`Clicked: ${data.clicked.join(', ')} on "${conn.title}"`);
                    didClick = true;
                }
            }
        } catch (e: any) { /* silent */ }
        return didClick;
    }

    private async mainLoop(): Promise<void> {
        try {
            const pages = await this.getPages();
            let anyClick = false;
            for (const page of pages) {
                const type = page.type || '';
                if ((page.title || '').includes('Extension Host')) { continue; }
                if (type === 'service_worker' || type === 'worker') { continue; }
                if (!page.webSocketDebuggerUrl) { continue; }
                const conn = await this.connect(page);
                if (!conn) { continue; }
                if (await this.scanPage(conn)) { anyClick = true; }
            }
            if (anyClick) { this.lastClickTime = Date.now(); }
        } catch (_) {}
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    public dispose(): void {
        if (this.timeoutId) { clearTimeout(this.timeoutId); }
        this.connections.forEach((c: any) => { try { c.ws.close(); } catch (_) {} });
        this.connections.clear();
        this.outputChannel.dispose();
    }
}
