/** File dialogs understand the final PNG extension. The host owns the compound
 * document suffix so native and workbench dialogs produce the same editor URI. */
export function drawingPath(path: string): string {
    if (path.toLowerCase().endsWith('.draw.png')) return path;
    return path.replace(/.png$/i, '') + '.draw.png';
}
