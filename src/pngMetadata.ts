import { PNG } from 'pngjs';

const METADATA_KEY = 'drawmotive';

/**
 * Reads Drawmotive metadata from a PNG file
 * @param pngBuffer The PNG file buffer
 * @returns The metadata string, or null if not found
 */
export async function readPngMetadata(pngBuffer: Buffer): Promise<string | null> {
    try {
        if (pngBuffer.length === 0) {
            return null;
        }

        const png: any = PNG.sync.read(pngBuffer);

        // Check for metadata in text chunks
        if (png.text && png.text[METADATA_KEY]) {
            return png.text[METADATA_KEY];
        }

        return null;
    } catch (error) {
        console.error('Error reading PNG metadata:', error);
        return null;
    }
}

/**
 * Writes a PNG file with embedded Drawmotive metadata
 * @param pngBuffer The PNG image buffer
 * @param metadata The metadata string to embed
 * @returns The PNG buffer with embedded metadata
 */
export async function writePngWithMetadata(pngBuffer: Buffer, metadata: string): Promise<Buffer> {
    try {
        const png: any = PNG.sync.read(pngBuffer);

        // Add metadata to text chunks
        if (!png.text) {
            png.text = {};
        }
        png.text[METADATA_KEY] = metadata;

        // Write back to buffer
        const outputBuffer = PNG.sync.write(png, {
            colorType: png.colorType,
            inputColorType: png.colorType,
            bitDepth: png.bitDepth,
            inputHasAlpha: true
        });

        return outputBuffer;
    } catch (error) {
        console.error('Error writing PNG metadata:', error);
        throw new Error(`Failed to write PNG metadata: ${error}`);
    }
}

/**
 * Creates an empty PNG with minimal dimensions
 * @returns An empty PNG buffer
 */
export function createEmptyPng(): Buffer {
    const png = new PNG({
        width: 800,
        height: 600,
        colorType: 6, // RGBA
        bitDepth: 8
    });

    // Fill with white background
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (png.width * y + x) << 2;
            png.data[idx] = 255;     // R
            png.data[idx + 1] = 255; // G
            png.data[idx + 2] = 255; // B
            png.data[idx + 3] = 255; // A
        }
    }

    return PNG.sync.write(png);
}
