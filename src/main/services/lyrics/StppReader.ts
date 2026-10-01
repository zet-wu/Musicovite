export interface StppCandidate {
    candidateId: string;
    type: 'STPP';
    format: 'ttml';
    text: string;
    synchronized: true;
    language?: string;
    description?: string;
    error?: string;
}

export interface MediaReader {
    size: number;
    read(offset: number, length: number): Promise<Buffer>;
}

interface Box {type: string; start: number; data: number; end: number}
const MAX_XML = 16 * 1024 * 1024;

// 只读取 box 头、moov 与目标 sample，不将整首本地音频加载到内存。
export async function readStppCandidates(reader: MediaReader): Promise<StppCandidate[]> {
    const roots: Box[] = [];
    for (let offset = 0; offset < reader.size;) {
        const header = await reader.read(offset, Math.min(16, reader.size - offset));
        const box = readBox(header, 0, reader.size - offset);
        roots.push({...box, start: offset, data: offset + box.data, end: offset + box.end});
        offset += box.end;
    }
    const result: StppCandidate[] = [];
    for (const root of roots.filter(box => box.type === 'moov')) {
        if (root.end - root.data > 64 * 1024 * 1024) throw new Error('MP4 索引过大');
        const data = await reader.read(root.data, root.end - root.data);
        const children = boxes(data, 0, data.length);
        const fragmented = roots.some(box => box.type === 'moof') || children.some(box => box.type === 'mvex');
        for (const track of children.filter(box => box.type === 'trak')) {
            let candidate: StppCandidate | undefined;
            try {
                const mdia = child(data, track, 'mdia');
                const stbl = child(data, child(data, mdia, 'minf'), 'stbl');
                const stsd = child(data, stbl, 'stsd');
                const entries = boxes(data, stsd.data + 8, stsd.end);
                if (!entries.some(box => box.type === 'stpp')) continue;
                const tkhd = child(data, track, 'tkhd');
                const id = uint(data, tkhd, data[tkhd.data] === 1 ? 20 : 12);
                candidate = {candidateId: `stpp:${id}`, type: 'STPP', format: 'ttml', text: '', synchronized: true, description: `STPP · 轨道 ${id}`};
                result.push(candidate);
                if (fragmented) throw new Error('暂不支持分片 MP4');
                if (entries.length !== 1 || entries[0].type !== 'stpp') throw new Error('不支持的 sample 描述');
                const hdlr = child(data, mdia, 'hdlr');
                if (data.toString('ascii', hdlr.data + 8, hdlr.data + 12) !== 'subt') throw new Error('不支持的字幕 handler');
                const mdhd = child(data, mdia, 'mdhd');
                const languageOffset = data[mdhd.data] === 1 ? 32 : 20;
                const language = data.readUInt16BE(mdhd.data + languageOffset);
                candidate.language = [10, 5, 0].map(shift => String.fromCharCode(((language >> shift) & 31) + 96)).join('');
                const edts = boxes(data, track.data, track.end).find(box => box.type === 'edts');
                if (edts) throw new Error('暂不支持带 edit list 的 STPP');
                const stsz = child(data, stbl, 'stsz');
                if (uint(data, stsz, 8) !== 1) throw new Error('暂仅支持单 sample STPP');
                const length = uint(data, stsz, 4) || uint(data, stsz, 12);
                if (!length || length > MAX_XML) throw new Error('TTML sample 大小无效');
                const stts = child(data, stbl, 'stts');
                if (uint(data, stts, 4) !== 1 || uint(data, stts, 8) !== 1 || !uint(data, stts, 12)) throw new Error('无效的 sample 时间表');
                const stsc = child(data, stbl, 'stsc');
                if (uint(data, stsc, 4) !== 1 || uint(data, stsc, 8) !== 1 || uint(data, stsc, 12) !== 1 || uint(data, stsc, 16) !== 1) throw new Error('不支持的 chunk 映射');
                const offsets = boxes(data, stbl.data, stbl.end).filter(box => box.type === 'stco' || box.type === 'co64');
                if (offsets.length !== 1 || uint(data, offsets[0], 4) !== 1) throw new Error('无效的 chunk 偏移表');
                const table = offsets[0];
                const offset = table.type === 'co64' ? wide(data, table.data + 8, table.end) : uint(data, table, 8);
                if (!roots.some(box => box.type === 'mdat' && offset >= box.data && offset + length <= box.end)) throw new Error('sample 超出 mdat 边界');
                candidate.text = new TextDecoder('utf-8', {fatal: true}).decode(await reader.read(offset, length));
            } catch (error) {
                if (candidate) candidate.error = error instanceof Error ? error.message : String(error);
            }
        }
    }
    return result;
}

function wide(data: Buffer, offset: number, end: number): number {
    if (offset + 8 > end) throw new Error('截断的 64 位字段');
    const value = Number(data.readBigUInt64BE(offset));
    if (!Number.isSafeInteger(value)) throw new Error('偏移超出安全整数范围');
    return value;
}

function readBox(data: Buffer, offset: number, available: number): Box {
    if (available < 8 || offset + 8 > data.length) throw new Error('截断的 MP4 box');
    let size = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const header = size === 1 ? 16 : 8;
    if (size === 1) size = wide(data, offset + 8, data.length);
    if (size === 0) size = available;
    if (size < header || size > available) throw new Error('MP4 box 边界无效');
    return {type, start: offset, data: offset + header, end: offset + size};
}

function boxes(data: Buffer, start: number, end: number): Box[] {
    const result: Box[] = [];
    while (start < end) {
        const box = readBox(data, start, end - start);
        result.push(box);
        start = box.end;
    }
    return result;
}

function child(data: Buffer, parent: Box, type: string): Box {
    const found = boxes(data, parent.data, parent.end).find(box => box.type === type);
    if (!found) throw new Error(`缺少 ${type}`);
    return found;
}

function uint(data: Buffer, box: Box, offset: number): number {
    if (box.data + offset + 4 > box.end) throw new Error(`截断的 ${box.type}`);
    return data.readUInt32BE(box.data + offset);
}
