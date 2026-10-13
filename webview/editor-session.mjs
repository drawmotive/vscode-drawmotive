/** The product owns file identity, save confirmation and reload decisions; the
 * public SDK owns document validation, revisions and PNG encoding. A file write
 * only establishes the baseline for its exact exported snapshot. */
export function startEditorSession({ createEditor, vscode, container, status, assetBaseUrl, frameDocument, sessionId, mode = 'edit' }) {
    const controller = new AbortController();
    const pending = new Map();
    let sequence = 0;
    let editor;
    let unsubscribe;
    let disposed = false;
    let loaded = false;
    let loadedSource;
    let savedSource;
    let savedRevision;
    let currentState;
    let saving;
    let imports = Promise.resolve();
    let phase = mode === 'create' ? 'Creating diagram…' : 'Loading editor…';
    let loadError;
    let actionEnabled;

    const send = message => { if (!disposed) vscode.postMessage({ ...message, sessionId }); };
    const dirty = () => loaded && (currentState?.revision === null || currentState?.revision !== savedRevision);
    const errorText = error => error instanceof Error ? error.message : String(error);
    const completed = async operation => {
        try { return await operation; }
        catch (error) {
            // SDK deadlines do not cancel an already accepted command. Keep its
            // result pending rather than enabling edits or retrying replacement.
            if (error?.code !== 'RequestTimeoutUnknown' || !error.completion) throw error;
            const outcome = await error.completion;
            if (outcome.error) throw outcome.error;
            return outcome.result;
        }
    };
    const update = () => {
        if (disposed) return;
        // Only file/PNG load failures occupy webview space. Progress and save
        // errors belong to the action state and VS Code notifications.
        status.textContent = loadError || '';
        status.hidden = !loadError;
        const enabled = loaded && currentState?.health === 'healthy' && !saving && !phase;
        if (editor && mode === 'edit' && actionEnabled !== enabled) {
            actionEnabled = enabled;
            editor.setActionState('host.save', { enabled }).catch(report);
        }
    };
    const report = error => {
        if (disposed) return;
        send({ type: 'error', error: errorText(error) });
    };
    const request = (type, data, signal) => {
        if (disposed || signal?.aborted) return Promise.reject(signal?.reason ?? new Error('Editor closed.'));
        const requestId = `${sessionId}:${++sequence}`;
        return new Promise((resolve, reject) => {
            const abort = () => { pending.delete(requestId); reject(signal.reason ?? new Error('Action cancelled.')); };
            pending.set(requestId, { type, revision: data.revision, resolve, reject, signal, abort });
            signal?.addEventListener('abort', abort, { once: true });
            send({ type, requestId, ...data });
        });
    };
    const settle = message => {
        const entry = pending.get(message.requestId);
        if (!entry) return;
        const response = entry.type === 'confirmReload' ? 'reloadDecision' : entry.type === 'createFile' ? 'createdSaved' : 'saved';
        if (message.type !== response && message.type !== 'saveFailed') return;
        if (entry.type !== 'confirmReload' && message.revision !== entry.revision) return;
        pending.delete(message.requestId);
        entry.signal?.removeEventListener('abort', entry.abort);
        if (message.type === 'saveFailed') entry.reject(new Error(message.error || 'Save failed.'));
        else entry.resolve(message);
    };

    const save = ({ signal } = {}) => {
        if (saving || !loaded || currentState?.health !== 'healthy' || phase) return Promise.reject(new Error('The document is not ready to save.'));
        // Keep editing enabled: later edits must survive this snapshot's ack.
        phase = 'Saving…';
        const operation = (async () => {
            try {
                const snapshot = await completed(editor.exportSnapshot({ formats: ['png'], png: { embedDocument: true } }));
                await request('save', { revision: snapshot.revision, png: snapshot.png.base64 }, signal);
                savedRevision = snapshot.revision;
                savedSource = snapshot.png.base64;
                loadedSource = undefined;
                currentState = await completed(editor.getState());
            } catch (error) {
                report(error);
                throw error;
            } finally {
                saving = undefined;
                phase = undefined;
                update();
            }
        })();
        saving = operation;
        update();
        return operation;
    };

    const replace = async message => {
        await ready;
        await saving?.catch(() => {});
        if (disposed || typeof message.png !== 'string') return;
        if (loaded && (message.png === loadedSource || message.png === savedSource)) {
            loadError = undefined;
            update();
            return;
        }
        let previous;
        const wasLoaded = loaded;
        try {
            phase = 'Loading diagram…';
            update();
            previous = await completed(editor.getState());
            // Freeze before querying dirty state or asking the user. No edits
            // can arrive between their reload decision and replacement.
            await completed(editor.setEditingEnabled(false));
            currentState = await completed(editor.getState());
            if (loaded && dirty()) {
                const decision = await request('confirmReload', {}, controller.signal);
                if (decision.reload !== true) {
                    return;
                }
            }
            // A zero-byte .draw.png is a host-created blank document, not an
            // invalid PNG. Reset through the SDK so storage/history/revisions
            // share the same authority as ordinary document replacement.
            if (message.png === '') await completed(editor.clearDocument());
            else await completed(editor.replacePngDocument(message.png));
            // The new baseline belongs to the completed replacement, even if
            // a later viewport adjustment fails. Viewport does not edit data.
            currentState = await completed(editor.getState());
            loaded = true;
            loadedSource = message.png;
            savedSource = undefined;
            savedRevision = currentState.revision;
            loadError = undefined;
            await completed(editor.fitViewport());
        } catch (error) {
            loadError = errorText(error);
            report(error);
        } finally {
            if (!disposed) {
                if (previous) {
                    const enabled = loaded && (!wasLoaded || previous.health === 'faulted' || previous.editingEnabled);
                    await completed(editor.setEditingEnabled(enabled)).catch(report);
                }
                currentState = await completed(editor.getState()).catch(() => currentState);
                phase = undefined;
                update();
            }
        }
    };

    const ready = (async () => {
        editor = await createEditor({
            container, assetBaseUrl, ...(frameDocument ? { frameDocument } : {}), signal: controller.signal,
            modules: { analytics: false, authentication: false, remoteSync: false },
            ui: { actions: mode === 'edit' ? [{ id: 'host.save', label: 'Save diagram', icon: 'save', enabled: false, onInvoke: save }] : [] },
        });
        // Do not expose an editable empty scene while waiting for the file.
        await completed(editor.setEditingEnabled(false));
        unsubscribe = editor.onStateChanged(state => {
            currentState = state;
            update();
        });
        if (mode === 'create') {
            const blank = await completed(editor.exportSnapshot({ formats: ['png'], png: { embedDocument: true } }));
            await request('createFile', { revision: blank.revision, png: blank.png.base64 }, controller.signal);
            await editor.dispose();
            send({ type: 'creationComplete' });
        } else send({ type: 'ready' });
    })();
    ready.catch(error => { phase = undefined; update(); report(error); });
    update();

    return {
        ready,
        receive(message) {
            if (disposed || !message || message.sessionId !== sessionId) return;
            if (['saved', 'createdSaved', 'saveFailed', 'reloadDecision'].includes(message.type)) settle(message);
            else if (mode === 'edit' && ['load', 'external'].includes(message.type)) {
                imports = imports.then(() => replace(message)).catch(report);
            } else if (message.type === 'loadFailed') { loadError = message.error; update(); }
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            controller.abort(new Error('Editor closed.'));
            unsubscribe?.();
            for (const entry of pending.values()) {
                entry.signal?.removeEventListener('abort', entry.abort);
                entry.reject(new Error('Editor closed.'));
            }
            pending.clear();
            await editor?.dispose();
        },
    };
}
