type SessionMode = 'edit' | 'create';
type SessionMessage = Record<string, unknown>;

export interface EditorFileAccess {
    read(): Promise<Uint8Array>;
    write(bytes: Uint8Array): Promise<void>;
}

/** File transport owns persistence acknowledgments, never PNG interpretation.
 * Serial I/O lets watcher notifications observe the completed write and suppress
 * its echo without treating an unconfirmed export as a saved file. */
export class EditorFileSession {
    private disposed = false;
    private operations = Promise.resolve();
    private lastDelivered?: string;
    private lastWritten?: string;
    private readonly acceptedWrites = new Set<string>();
    private readonly writes = new Map<string, { revision: string; png: string; operation: Promise<void> }>();

    constructor(
        private readonly sessionId: string,
        private readonly mode: SessionMode,
        private readonly file: EditorFileAccess,
        private readonly post: (message: SessionMessage) => Promise<unknown>,
    ) {}

    public accepts(message: unknown): message is SessionMessage {
        return !this.disposed && !!message && typeof message === 'object'
            && 'sessionId' in message && message.sessionId === this.sessionId;
    }

    public async receive(message: unknown): Promise<void> {
        if (!this.accepts(message)) return;
        if (message.type === 'ready' && this.mode === 'edit') {
            await this.enqueue(() => this.load(false));
        } else if (message.type === (this.mode === 'edit' ? 'save' : 'createFile')) {
            const { requestId, revision, png } = message;
            if (typeof requestId !== 'string' || !requestId || typeof revision !== 'string' || !revision) return;
            if (typeof png !== 'string' || !png || Buffer.from(png, 'base64').toString('base64') !== png) {
                await this.send({ type: 'saveFailed', requestId, revision, error: 'Invalid PNG binary transport.' });
                return;
            }
            const previous = this.writes.get(requestId);
            if (previous) {
                // A repeated ID cannot apply a different snapshot to this file.
                if (previous.revision !== revision || previous.png !== png) return;
                await previous.operation;
                return;
            }
            if (this.acceptedWrites.has(requestId)) return;
            this.acceptedWrites.add(requestId);
            const operation = this.enqueue(async () => {
                try {
                    if (this.disposed) return;
                    await this.file.write(Buffer.from(png, 'base64'));
                    this.lastWritten = png;
                    this.lastDelivered = undefined;
                    await this.send({ type: this.mode === 'edit' ? 'saved' : 'createdSaved', requestId, revision });
                } catch (error) {
                    await this.send({ type: 'saveFailed', requestId, revision, error: `Failed to save diagram: ${error}` });
                }
            });
            this.writes.set(requestId, { revision, png, operation });
            await operation;
            this.writes.delete(requestId);
        }
    }

    public fileChanged(): Promise<void> {
        return this.mode === 'edit' ? this.enqueue(() => this.load(true)) : Promise.resolve();
    }

    public dispose(): void { this.disposed = true; }

    private enqueue(operation: () => Promise<void>): Promise<void> {
        const next = this.operations.then(() => this.disposed ? undefined : operation());
        this.operations = next.catch(() => {});
        return next;
    }

    private async send(message: SessionMessage): Promise<void> {
        if (!this.disposed) await this.post({ ...message, sessionId: this.sessionId });
    }

    private async load(external: boolean): Promise<void> {
        try {
            const png = Buffer.from(await this.file.read()).toString('base64');
            if (external && (png === this.lastDelivered || png === this.lastWritten)) return;
            await this.send({ type: external ? 'external' : 'load', png });
            this.lastDelivered = png;
            this.lastWritten = undefined;
        } catch (error) {
            // A successful retry must reach the webview even when the bytes
            // equal the last delivered/saved file, so it can clear the error.
            this.lastDelivered = undefined;
            this.lastWritten = undefined;
            await this.send({ type: 'loadFailed', error: `Failed to load diagram: ${error}` });
        }
    }
}
