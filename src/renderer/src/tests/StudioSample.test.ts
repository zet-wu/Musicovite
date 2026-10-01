import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {DOMImplementation, DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {expect, it} from 'vitest';
import {readStppCandidates} from '../../../main/services/lyrics/StppReader';
import {extractAllEmbeddedLyrics} from '../../../main/utils/metadata';
import {parseBuffer} from 'music-metadata';
import {TtmlDocumentService} from '@/features/lyrics/format/TtmlDocumentService';

// 真实产物由验收环境提供，不将用户媒体复制进仓库。
it.skipIf(!process.env.MUSICBOX_STUDIO_SAMPLE)('Studio 真实产物读取并进入共用播放投影', async () => {
    const bytes = await readFile(process.env.MUSICBOX_STUDIO_SAMPLE!);
    const stpp = await readStppCandidates({size: bytes.length, read: async (offset, length) => bytes.subarray(offset, offset + length)});
    const tags = extractAllEmbeddedLyrics(await parseBuffer(bytes, {mimeType: 'audio/mp4', size: bytes.length}));
    expect(stpp.length).toBeGreaterThan(0);
    expect(stpp[0].error).toBeUndefined();
    expect(tags.length).toBeGreaterThan(0);
    const service = new TtmlDocumentService({parser: new DOMParser(), implementation: new DOMImplementation(), serializer: new XMLSerializer()});
    const parsed = service.parse(stpp[0].text);
    const projected = service.project(parsed);
    expect(projected.lines.length).toBeGreaterThan(0);
    expect(projected.lines[0].startTime).toBeGreaterThan(0);
    expect(projected.lines.some(line => line.words.some(word => word.ruby?.length))).toBe(true);
    expect(projected.lines.some(line => line.translatedLyric)).toBe(true);
    expect(projected.lines.some(line => line.romanLyric || line.words.some(word => word.romanWord))).toBe(true);
    process.stdout.write(JSON.stringify({sha256: createHash('sha256').update(bytes).digest('hex'), tracks: stpp.map(c => c.candidateId), tags: tags.length, lines: projected.lines.length, firstTime: projected.lines[0].startTime}) + '\n');
});
