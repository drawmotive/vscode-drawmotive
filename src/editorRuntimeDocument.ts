/** Browser webviews read packaged assets through VS Code's authenticated resource
 * transport. Navigation remains on the controlled frame's host origin. */
export function editorRuntimeDocument(html: string, assetBaseUrl: string, cspSource: string): string {
    const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const source = attribute(cspSource);
    const policy = `default-src 'none'; script-src ${source} 'wasm-unsafe-eval'; style-src ${source} 'unsafe-inline'; img-src ${source} data: blob:; font-src ${source}; connect-src ${source} data: blob:; worker-src ${source} blob:; object-src 'none'; base-uri ${source};`;
    return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
        .replace('<base href="./">', `<base href="${attribute(assetBaseUrl)}">`)
        // Classic cross-origin scripts need CORS mode for their dynamic imports
        // to retain a usable script base instead of about:blank.
        .replaceAll('<script src=', '<script crossorigin="anonymous" src=');
}
