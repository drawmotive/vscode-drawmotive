/**
 * Simple PNG metadata handler for Drawmotive VSCode extension
 * Manually inserts/extracts tEXt chunks from PNG files
 */

const METADATA_KEY = 'drawmotive';

/**
 * Reads Drawmotive metadata from a PNG file
 */
export async function readPngMetadata(pngBuffer: Buffer): Promise<string | null> {
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
    } catch (error) {
        console.error('[readPngMetadata] Error:', error);
        return null;
    }
}

/**
 * Writes a PNG file with embedded Drawmotive metadata
 */
export async function writePngWithMetadata(pngBuffer: Buffer, metadata: string): Promise<Buffer> {
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
    } catch (error) {
        console.error('[writePngWithMetadata] Error:', error);
        throw error;
    }
}

/**
 * Reads a tEXt chunk from PNG
 */
function readTextChunk(pngBuffer: Buffer, keyword: string): string | null {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('Invalid PNG signature');
    }

    let offset = 8;

    while (offset + 12 <= pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');

        if (offset + 12 + length > pngBuffer.length) break;

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

        if (type === 'IEND') break;

        offset += 12 + length;
    }

    return null;
}

/**
 * Removes a tEXt chunk with specific keyword
 */
function removeTextChunk(pngBuffer: Buffer, keyword: string): Buffer {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('Invalid PNG signature');
    }

    const chunks: Buffer[] = [PNG_SIGNATURE];
    let offset = 8;

    while (offset + 12 <= pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');

        if (offset + 12 + length > pngBuffer.length) break;

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

        if (type === 'IEND') break;
    }

    return Buffer.concat(chunks);
}

/**
 * Inserts a tEXt chunk before IEND
 */
function insertTextChunk(pngBuffer: Buffer, keyword: string, text: string): Buffer {
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
function crc32(buffer: Buffer): number {
    let crc = 0xFFFFFFFF;

    for (let i = 0; i < buffer.length; i++) {
        crc = crc ^ buffer[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xEDB88320;
            } else {
                crc = crc >>> 1;
            }
        }
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Creates an empty PNG (not used by VSCode extension, but keeping for compatibility)
 */
export function createEmptyPng(): Buffer {
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
