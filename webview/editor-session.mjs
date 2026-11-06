/** The product owns file identity, save confirmation and reload decisions; the
 * public SDK owns document validation, revisions and PNG encoding. A file write
 * only establishes the baseline for its exact exported snapshot. */
export function startEditorSession({ createEditor, vscode, container, status, saveButton, assetBaseUrl, workerFactory, sessionId, mode = 'edit' }) {
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
        // The host owns Save; the canvas SDK owns document state and editing.
        status.textContent = loadError || '';
        status.hidden = !loadError;
        const enabled = loaded && currentState?.health === 'healthy' && !saving && !phase;
        saveButton.disabled = mode !== 'edit' || !enabled;
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
            container, assetBaseUrl, signal: controller.signal, workerFactory,
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
        save: () => save({ signal: controller.signal }),
        // Canvas focus is the input boundary: native inline text, host controls,
        // IME and system shortcuts retain their browser behavior.
        keydown(event) {
            if (disposed || !loaded || mode !== 'edit' || !editor || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat
                || event.target?.tagName !== 'CANVAS' || event.target.isContentEditable || event.altKey || event.shiftKey) return;
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 's') {
                event.preventDefault();
                if (!saveButton.disabled) save({ signal: controller.signal }).catch(() => {});
                return;
            }
            if (event.ctrlKey || event.metaKey || currentState?.health !== 'healthy' || !currentState.editingEnabled) return;
            const tool = { v: 'select', a: 'arrow', r: 'rectangle', o: 'ellipse', d: 'diamond', t: 'text' }[key];
            if (!tool && key !== 'escape') return;
            event.preventDefault();
            Promise.resolve().then(() => tool ? editor.setTool(tool) : editor.cancelInteraction()).catch(report);
        },
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
            saveButton.disabled = true;
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
