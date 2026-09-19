import { createServer, Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

/** The public editor requires an HTTP(S) frame for Blazor navigation and its
 * origin-checked API. Serve packaged assets on loopback instead of rewriting
 * the published runtime for vscode-webview: URLs. No workspace files are served. */
export class EditorAssetServer {
    private readonly token = randomBytes(24).toString('hex');
    private server?: Server;
    private readonly forwardedHosts = new Set<string>();
    private starting?: Promise<{ url: string; port: number }>;

    constructor(private readonly assetRoot: string) {}

    public start(): Promise<{ url: string; port: number }> {
        return this.starting ??= this.listen();
    }

    /** VS Code owns tunnel origin allocation; accept only its resolved Host. */
    public allowForwardedOrigin(url: string): void {
        this.forwardedHosts.add(new URL(url).host);
    }

    private async listen(): Promise<{ url: string; port: number }> {
        const server = this.server = createServer(async (request, response) => {
            const address = server.address();
            if (!address || typeof address === 'string' || (request.headers.host !== `127.0.0.1:${address.port}` && !this.forwardedHosts.has(request.headers.host ?? ''))) {
                response.writeHead(403).end();
                return;
            }
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                response.writeHead(405, { Allow: 'GET, HEAD' }).end();
                return;
            }
            try {
                const pathname = decodeURIComponent(new URL(request.url!, 'http://127.0.0.1').pathname);
                const prefix = `/${this.token}/`;
                if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
                const relative = pathname.slice(prefix.length);
                const file = path.resolve(this.assetRoot, relative);
                if (!relative || relative.includes('\\') || !file.startsWith(path.resolve(this.assetRoot) + path.sep)) {
                    response.writeHead(404).end();
                    return;
                }
                const bytes = await readFile(file);
                response.writeHead(200, {
                    'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'",
                });
                response.end(request.method === 'HEAD' ? undefined : bytes);
            } catch {
                response.writeHead(404).end();
            }
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Editor asset server did not start');
        return { url: `http://127.0.0.1:${address.port}/${this.token}/host.html`, port: address.port };
    }

    public dispose(): void {
        this.server?.close();
        this.server?.closeAllConnections();
    }
}
