import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DOMImplementation, DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {LyricsService} from '@/features/lyrics/service/LyricsService';
import {LyricsNormalizer} from '@/features/lyrics/format/LyricsNormalizer';
import {TtmlDocumentService} from '@/features/lyrics/format/TtmlDocumentService';
import {LyricsProviderRegistry} from '@/features/lyrics/providers/LyricsProviderRegistry';
const gateway = vi.hoisted(() => ({getEmbedded: vi.fn(), readCanonical: vi.fn(), saveCanonical: vi.fn()}));
vi.mock('@/infrastructure/electron', () => ({lyricsGateway: gateway}));
const ttml = new TtmlDocumentService({parser: new DOMParser(), implementation: new DOMImplementation(), serializer: new XMLSerializer()});
const xml = (text: string) => ttml.serialize({metadata: {}, lines: [{text, startTime: 1000, endTime: 2000}]});
const track = {fileId: 'song', filePath: 'song.m4a', title: 'Song', artist: 'Artist'};
const query = {trackId: 'song', filePath: 'song.m4a', title: 'Song', artists: ['Artist']};
const stpp = (id: number, text = xml(String(id))) => ({candidateId: `stpp:${id}`, type: 'STPP', format: 'ttml', text});
function service(providers = new LyricsProviderRegistry()) {
    return new LyricsService({providers, localSource: {find: async () => null} as never, normalizer: new LyricsNormalizer(ttml)});
}
beforeEach(() => {
    vi.resetAllMocks();
    gateway.readCanonical.mockResolvedValue({success: false});
    gateway.saveCanonical.mockImplementation(async (trackId, _text, source, selectionMode) => ({success: true, binding: {trackId, source, selectionMode}}));
});
describe('内嵌候选选择与持久化', () => {
    it('首轨损坏时按文件顺序选下一轨，覆盖旧自动逐词缓存', async () => {
        gateway.readCanonical.mockResolvedValue({success: true, ttml: xml('old'), binding: {selectionMode: 'auto', source: {kind: 'provider'}}});
        gateway.getEmbedded.mockResolvedValue({success: true, candidates: [stpp(9, 'broken'), stpp(7), stpp(2)]});
        const result = await service().load(track, new AbortController().signal);
        expect(result.document?.source).toMatchObject({candidateId: 'stpp:7'});
        expect(result.binding?.selectionMode).toBe('auto');
    });
    it('手动非首轨保持 canonical，刷新只查原候选', async () => {
        const source = {kind: 'embedded', trackId: 'song', candidateId: 'stpp:2'} as const;
        const binding = {trackId: 'song', source, selectionMode: 'manual' as const, updatedAt: 0, canonicalTtmlPath: ''};
        gateway.readCanonical.mockResolvedValue({success: true, ttml: xml('manual'), binding});
        gateway.getEmbedded.mockResolvedValue({success: true, candidates: [stpp(9), stpp(2)]});
        expect((await service().load(track, new AbortController().signal)).document?.ttml.lines[0].text).toBe('manual');
        gateway.getEmbedded.mockResolvedValue({success: true, candidates: [stpp(9)]});
        await expect(service().refreshBinding(query, binding, new AbortController().signal)).rejects.toThrow('不可用');
        expect(gateway.saveCanonical).not.toHaveBeenCalled();
    });
    it('LRC 评分来自解析能力，内部 TTML 不获得格式分', async () => {
        gateway.getEmbedded.mockResolvedValue({success: true, candidates: [
            {candidateId: 'plain', text: '[00:01]A B'},
            {candidateId: 'extended', text: '[00:01]A [00:02]B[00:03]'}
        ]});
        const instance = service();
        const previews = await instance.listEmbedded(query);
        expect(previews.map(p => instance.scoreEmbedded(p))).toMatchObject([
            {identityScore: 100, qualityScore: 0}, {identityScore: 100, qualityScore: 40}
        ]);
        expect((await instance.load(track, new AbortController().signal)).document?.source).toMatchObject({candidateId: 'extended'});
    });
    it('较高质量同身份桶在线候选参与实际比较', async () => {
        gateway.getEmbedded.mockResolvedValue({success: true, candidates: [{candidateId: 'extended', text: '[00:01]A [00:02]B[00:03]'}]});
        const providers = new LyricsProviderRegistry();
        providers.register({id: 'online', displayName: 'Online', search: async () => [{providerId: 'online', candidateId: '1', title: 'Song', artists: ['Artist'], identityScore: 95, qualityScore: 65}], fetch: async () => ({kind: 'ttml', ttml: ttml.serialize({metadata: {timingMode: 'Word'}, lines: [{text: 'Online', startTime: 1000, endTime: 2000}]})})});
        expect((await service(providers).load(track, new AbortController().signal)).document?.source.kind).toBe('provider');
    });
    it('取消读取后不写入绑定', async () => {
        const controller = new AbortController();
        gateway.getEmbedded.mockImplementation(async () => {controller.abort(); return {success: true, candidates: [stpp(1)]};});
        await expect(service().load(track, controller.signal)).rejects.toThrow();
        expect(gateway.saveCanonical).not.toHaveBeenCalled();
    });
});
