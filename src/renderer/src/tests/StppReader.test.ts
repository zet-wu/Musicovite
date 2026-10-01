import {describe, expect, it} from 'vitest';
import {readStppCandidates} from '../../../main/services/lyrics/StppReader';

const u32 = (...values: number[]) => {const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v, i * 4)); return b;};
const box = (type: string, ...parts: Buffer[]) => {const b = Buffer.concat(parts); return Buffer.concat([u32(b.length + 8), Buffer.from(type), b]);};
const xml = Buffer.from('<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s">A</p></div></body></tt>');
function fixture(ids = [9, 2], broken = false, co64 = false, fragmented = false) {
    const tracks = ids.map((id, index) => {
        const offset = co64 ? Buffer.alloc(8) : u32(8 + index * xml.length);
        if (co64) offset.writeBigUInt64BE(BigInt(8 + index * xml.length));
        return box('trak', box('tkhd', u32(0, 0, 0, id)), box('mdia',
            box('hdlr', u32(0, 0), Buffer.from('subt')),
            box('mdhd', u32(0, 0, 0, 1000, 3000, 0)),
            box('minf', box('stbl',
                box('stsd', u32(0, 1), box('stpp', Buffer.alloc(8), Buffer.from('http://www.w3.org/ns/ttml\0\0\0'))),
                box('stsz', u32(0, 0, broken && index === 0 ? 2 : 1, xml.length)),
                box('stts', u32(0, 1, 1, 3000)), box('stsc', u32(0, 1, 1, 1, 1)),
                box(co64 ? 'co64' : 'stco', u32(0, 1), offset)))));
    });
    return Buffer.concat([box('mdat', ...ids.map(() => xml)), box('free', Buffer.alloc(3)), box('moov', ...tracks, ...(fragmented ? [box('mvex')] : []))]);
}
const read = (b: Buffer) => readStppCandidates({size: b.length, read: async (o, n) => b.subarray(o, o + n)});

describe('单 sample STPP', () => {
    it('按文件顺序读取多轨，支持 co64 和尾部 moov', async () => {
        const result = await read(fixture([9, 2], false, true));
        expect(result.map(c => c.candidateId)).toEqual(['stpp:9', 'stpp:2']);
        expect(result.every(c => c.text === xml.toString() && !c.error)).toBe(true);
    });
    it('多 sample 候选失败不阻断下一轨', async () => {
        const result = await read(fixture([9, 2], true));
        expect(result[0].error).toContain('单 sample');
        expect(result[1].text).toBe(xml.toString());
    });
    it('分片文件不误报支持，截断 box 失败', async () => {
        expect((await read(fixture([9], false, false, true)))[0].error).toContain('分片');
        await expect(read(fixture().subarray(0, 20))).rejects.toThrow();
    });
});
