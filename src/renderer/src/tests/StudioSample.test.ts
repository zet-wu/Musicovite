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
    const service = new TtmlDocumentService({parser: new DOMParser(), implementation: new DOMImplementation(), serializer: new XMLSerializer()});
    const parsed = service.parse(stpp[0].text);
    const projected = service.project(parsed);
    expect(projected.lines.length).toBeGreaterThan(0);
    expect(projected.lines[0].startTime).toBeGreaterThanOrEqual(0);
    process.stdout.write(JSON.stringify({sha256: createHash('sha256').update(bytes).digest('hex'), tracks: stpp.map(c => c.candidateId), tags: tags.length, lines: projected.lines.length, firstTime: projected.lines[0].startTime}) + '\n');
});


it('通用 TTML 接受零起始和缺失可选翻译/注音', () => {
    const service = new TtmlDocumentService({parser: new DOMParser(), implementation: new DOMImplementation(), serializer: new XMLSerializer()});
    const result = service.project(service.parse('<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="1s">Hello</p></div></body></tt>'));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].startTime).toBe(0);
    expect(result.lines[0].words.map(word => word.word).join('')).toBe('Hello');
});
