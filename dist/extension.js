/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
const DrawmotiveEditorProvider_1 = __webpack_require__(2);
const pngMetadata_1 = __webpack_require__(3);
function activate(context) {
    console.log('Drawmotive extension activated');
    // Register the custom editor provider for .draw.png files
    const provider = new DrawmotiveEditorProvider_1.DrawmotiveEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider('drawmotive.editor', provider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    });
    context.subscriptions.push(registration);
    // Register command to create new drawing
    const newDrawingCommand = vscode.commands.registerCommand('drawmotive.newDrawing', async () => {
        const uri = await vscode.window.showSaveDialog({
            filters: {
                'Drawmotive Diagrams': ['draw.png']
            },
            saveLabel: 'Create Drawing'
        });
        if (uri) {
            // Create a valid empty PNG file (not 0 bytes)
            const emptyPngData = (0, pngMetadata_1.createEmptyPng)();
            await vscode.workspace.fs.writeFile(uri, emptyPngData);
            // Open the newly created file in the editor
            await vscode.commands.executeCommand('vscode.openWith', uri, 'drawmotive.editor');
        }
    });
    context.subscriptions.push(newDrawingCommand);
}
function deactivate() {
    console.log('Drawmotive extension deactivated');
}


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DrawmotiveEditorProvider = void 0;
const vscode = __importStar(__webpack_require__(1));
const pngMetadata_1 = __webpack_require__(3);
/**
 * Provider for Drawmotive custom editor that handles .draw.png files (binary PNG format)
 */
class DrawmotiveEditorProvider {
    context;
    static viewType = 'drawmotive.editor';
    constructor(context) {
        this.context = context;
    }
    async openCustomDocument(uri, openContext, _token) {
        return { uri, dispose: () => { } };
    }
    async resolveCustomEditor(document, webviewPanel, _token) {
        // Setup webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };
        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);
        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    await this.updateWebview(document.uri, webviewPanel.webview);
                    break;
                case 'update':
                    await this.updateDocument(document.uri, message.data);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(`Drawmotive: ${message.error}`);
                    break;
            }
        }, null, this.context.subscriptions);
        // Watch for external file changes
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(document.uri, '*'));
        watcher.onDidChange(async () => {
            await this.updateWebview(document.uri, webviewPanel.webview);
        });
        webviewPanel.onDidDispose(() => {
            watcher.dispose();
        });
    }
    async updateWebview(fileUri, webview) {
        try {
            // Read file as binary PNG data
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            console.log(`[DrawmotiveEditorProvider] Read file: ${fileData.length} bytes`);
            let diagramData = '';
            if (fileData.length > 0) {
                const metadata = await (0, pngMetadata_1.readPngMetadata)(Buffer.from(fileData));
                console.log(`[DrawmotiveEditorProvider] Extracted metadata: ${metadata ? metadata.substring(0, 100) + '...' : 'null'}`);
                if (metadata) {
                    diagramData = metadata;
                }
            }
            console.log(`[DrawmotiveEditorProvider] Sending init message with diagramData length: ${diagramData.length}`);
            webview.postMessage({
                type: 'init',
                data: {
                    fileId: fileUri.fsPath,
                    diagramData: diagramData,
                    pngData: fileData.length > 0 ? Buffer.from(fileData).toString('base64') : ''
                }
            });
        }
        catch (error) {
            console.error('Error updating webview:', error);
            webview.postMessage({
                type: 'error',
                error: `Failed to load diagram: ${error}`
            });
        }
    }
    async updateDocument(fileUri, data) {
        try {
            console.log('[DrawmotiveEditorProvider] updateDocument called with data:', data);
            const { raw, png } = data;
            if (!raw || !png) {
                console.error('[DrawmotiveEditorProvider] Missing data fields:', { hasRaw: !!raw, hasPng: !!png });
                throw new Error('Missing required data fields (raw or png)');
            }
            console.log(`[DrawmotiveEditorProvider] Received raw data length: ${raw.length}, png data length: ${png.length}`);
            const pngBuffer = Buffer.from(png, 'base64');
            console.log(`[DrawmotiveEditorProvider] Decoded PNG buffer: ${pngBuffer.length} bytes`);
            const finalPngBuffer = await (0, pngMetadata_1.writePngWithMetadata)(pngBuffer, raw);
            console.log(`[DrawmotiveEditorProvider] Final PNG with metadata: ${finalPngBuffer.length} bytes`);
            // Write binary PNG data directly to file
            await vscode.workspace.fs.writeFile(fileUri, finalPngBuffer);
            console.log('[DrawmotiveEditorProvider] File written successfully');
        }
        catch (error) {
            console.error('Error updating document:', error);
            vscode.window.showErrorMessage(`Failed to save diagram: ${error}`);
        }
    }
    async getHtmlForWebview(webview) {
        const indexPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor', 'index.html');
        const indexBytes = await vscode.workspace.fs.readFile(indexPath);
        let html = Buffer.from(indexBytes).toString('utf8');
        const editorUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor'));
        // Convert relative paths to absolute webview URIs
        html = html.replace(/href="([^"]+)"/g, (match, path) => {
            if (path.startsWith('http'))
                return match;
            return `href="${editorUri}/${path}"`;
        });
        html = html.replace(/src="([^"]+)"/g, (match, path) => {
            if (path.startsWith('http'))
                return match;
            return `src="${editorUri}/${path}"`;
        });
        // Add CSP
        html = html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval';
        script-src-elem ${webview.cspSource} 'unsafe-inline';
        style-src ${webview.cspSource} 'unsafe-inline';
        img-src ${webview.cspSource} data: blob:;
        font-src ${webview.cspSource};
        connect-src ${webview.cspSource} http://localhost data: blob:;
        worker-src ${webview.cspSource} blob:;
        child-src ${webview.cspSource} blob:;
    ">`);
        return html;
    }
}
exports.DrawmotiveEditorProvider = DrawmotiveEditorProvider;


/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * Simple PNG metadata handler for Drawmotive VSCode extension
 * Manually inserts/extracts tEXt chunks from PNG files
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.readPngMetadata = readPngMetadata;
exports.writePngWithMetadata = writePngWithMetadata;
exports.createEmptyPng = createEmptyPng;
const METADATA_KEY = 'drawmotive';
/**
 * Reads Drawmotive metadata from a PNG file
 */
async function readPngMetadata(pngBuffer) {
    try {
        if (pngBuffer.length === 0) {
            return null;
        }
        const metadata = readTextChunk(pngBuffer, METADATA_KEY);
        if (metadata) {
            console.log('[readPngMetadata] Found metadata with key:', METADATA_KEY, 'length:', metadata.length);
            return metadata;
        }
        console.log('[readPngMetadata] No metadata found with key:', METADATA_KEY);
        return null;
    }
    catch (error) {
        console.error('[readPngMetadata] Error:', error);
        return null;
    }
}
/**
 * Writes a PNG file with embedded Drawmotive metadata
 */
async function writePngWithMetadata(pngBuffer, metadata) {
    try {
        console.log('[writePngWithMetadata] Adding metadata, length:', metadata.length);
        // Remove existing drawmotive chunk if present
        const cleanedBuffer = removeTextChunk(pngBuffer, METADATA_KEY);
        // Insert new tEXt chunk
        const outputBuffer = insertTextChunk(cleanedBuffer, METADATA_KEY, metadata);
        console.log('[writePngWithMetadata] Output buffer size:', outputBuffer.length);
        // Verify
        const verifyMetadata = readTextChunk(outputBuffer, METADATA_KEY);
        console.log('[writePngWithMetadata] Verification:', !!verifyMetadata, 'length:', verifyMetadata?.length);
        return outputBuffer;
    }
    catch (error) {
        console.error('[writePngWithMetadata] Error:', error);
        throw error;
    }
}
/**
 * Reads a tEXt chunk from PNG
 */
function readTextChunk(pngBuffer, keyword) {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('Invalid PNG signature');
    }
    let offset = 8;
    while (offset + 12 <= pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
        if (offset + 12 + length > pngBuffer.length)
            break;
        if (type === 'tEXt') {
            const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
            const nullIndex = data.indexOf(0);
            if (nullIndex > 0) {
                const chunkKeyword = data.subarray(0, nullIndex).toString('latin1');
                if (chunkKeyword === keyword) {
                    return data.subarray(nullIndex + 1).toString('latin1');
                }
            }
        }
        if (type === 'IEND')
            break;
        offset += 12 + length;
    }
    return null;
}
/**
 * Removes a tEXt chunk with specific keyword
 */
function removeTextChunk(pngBuffer, keyword) {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('Invalid PNG signature');
    }
    const chunks = [PNG_SIGNATURE];
    let offset = 8;
    while (offset + 12 <= pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
        if (offset + 12 + length > pngBuffer.length)
            break;
        const chunkSize = 12 + length;
        const chunk = pngBuffer.subarray(offset, offset + chunkSize);
        // Skip tEXt chunks with our keyword
        if (type === 'tEXt') {
            const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
            const nullIndex = data.indexOf(0);
            if (nullIndex > 0) {
                const chunkKeyword = data.subarray(0, nullIndex).toString('latin1');
                if (chunkKeyword === keyword) {
                    offset += chunkSize;
                    continue; // Skip this chunk
                }
            }
        }
        chunks.push(chunk);
        offset += chunkSize;
        if (type === 'IEND')
            break;
    }
    return Buffer.concat(chunks);
}
/**
 * Inserts a tEXt chunk before IEND
 */
function insertTextChunk(pngBuffer, keyword, text) {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('Invalid PNG signature');
    }
    // Find IEND position
    let iendPos = -1;
    let offset = 8;
    while (offset + 8 <= pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
        if (type === 'IEND') {
            iendPos = offset;
            break;
        }
        offset += 12 + length;
    }
    if (iendPos === -1) {
        throw new Error('IEND chunk not found');
    }
    // Create tEXt chunk
    const keywordBuf = Buffer.from(keyword, 'latin1');
    const textBuf = Buffer.from(text, 'latin1');
    const data = Buffer.concat([keywordBuf, Buffer.from([0]), textBuf]);
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from('tEXt', 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    const textChunk = Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
    // Combine: before IEND + tEXt chunk + IEND chunk
    return Buffer.concat([
        pngBuffer.subarray(0, iendPos),
        textChunk,
        pngBuffer.subarray(iendPos)
    ]);
}
/**
 * CRC32 calculation for PNG chunks
 */
function crc32(buffer) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc = crc ^ buffer[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xEDB88320;
            }
            else {
                crc = crc >>> 1;
            }
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
/**
 * Creates an empty PNG (not used by VSCode extension, but keeping for compatibility)
 */
function createEmptyPng() {
    // Minimal 1x1 white PNG
    return Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x03, 0x20, 0x00, 0x00, 0x02, 0x58, // 800x600
        0x08, 0x06, 0x00, 0x00, 0x00, 0xDB, 0x3F, 0x57,
        0x9F, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk (minimal)
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
        0x42, 0x60, 0x82
    ]);
}


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map