import {DOMImplementation, DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {describe, expect, it} from 'vitest';
import {TtmlDocumentService} from '@/features/lyrics/format/TtmlDocumentService';
const service = new TtmlDocumentService({parser: new DOMParser(), implementation: new DOMImplementation(), serializer: new XMLSerializer()});
const wrap = (body: string) => `<x:tt xmlns:x="http://www.w3.org/ns/ttml" xmlns:m="http://www.w3.org/ns/ttml#metadata"><x:head><x:metadata><m:agent xml:id="v8" type="person"/><m:agent xml:id="v1" type="person"/><m:agent xml:id="v9" type="person"/><m:agent xml:id="g" type="group"/></x:metadata></x:head><x:body><x:div>${body}</x:div></x:body></x:tt>`;
describe('TTML 消费适配', () => {
    it('一个正文词对应多个音译音节时全部保留', () => {
        const projected = service.project({metadata: {}, lines: [{text: '何', startTime: 1000, endTime: 2000,
            words: [{text: '何', startTime: 1000, endTime: 2000}],
            romanizations: [{text: 'na ni', words: [{text: 'na', endsWithSpace: true, startTime: 1000, endTime: 1500}, {text: 'ni', startTime: 1500, endTime: 2000}]}]
        }]});
        expect(projected.lines[0].words[0].romanWord).toBe('na ni');
    });
    it('按命名空间解析附属音译而非要求固定前缀', () => {
        const xml = '<t:tt xmlns:t="http://www.w3.org/ns/ttml" xmlns:a="http://music.apple.com/lyric-ttml-internal"><t:head><t:metadata><a:iTunesMetadata><a:transliterations><a:transliteration xml:lang="ja-Latn"><a:text for="L1"><a:span begin="1s" end="2s">a</a:span></a:text></a:transliteration></a:transliterations></a:iTunesMetadata></t:metadata></t:head><t:body><t:div><t:p a:key="L1" begin="1s" end="2s"><t:span begin="1s" end="2s">あ</t:span></t:p></t:div></t:body></t:tt>';
        expect(service.project(service.parse(xml)).lines[0].words[0].romanWord).toBe('a');
    });
    it('按声明顺序对齐，集合去重、合唱和 group 居中且不改变后续侧位', () => {
        const xml = wrap(['v1', 'v8 v9', 'v8', 'v1 v1', 'g', 'unknown', 'v9', ''].map(agent => `<x:p begin="1s" end="3s" m:agent="${agent}">word</x:p>`).join(''));
        const doc = service.parse(xml);
        expect(service.project(doc).lines.map(l => l.alignment)).toEqual(['right', 'center', 'left', 'right', 'center', 'left', 'left', 'left']);
        expect(doc.lines[1].agentId).toBe('v8 v9');
    });
    it('背景明确歌手独立排版，无歌手继承主行；序列化后引用保留', () => {
        const doc = service.parse(wrap('<x:p m:agent="v1" begin="1s" end="4s">Main<x:span m:role="x-bg" m:agent="v8" begin="2s" end="3s">BG</x:span></x:p><x:p m:agent="v8 v1" begin="5s" end="8s">Main<x:span m:role="x-bg" begin="6s" end="7s">BG</x:span></x:p>'));
        const projected = service.project(doc);
        expect(projected.lines.map(l => l.alignment)).toEqual(['right', 'left', 'center', 'center']);
        expect(projected.lines[1]).toMatchObject({startTime: 2000, endTime: 3000});
        expect(service.project(service.parse(service.serialize(doc))).lines.map(l => l.alignment)).toEqual(['right', 'left', 'center', 'center']);
    });
    it.each([' ', '<x:span> </x:span>'])('动态词保留 span 间空白 %s', space => {
        const doc = service.parse(wrap(`<x:p begin="1s" end="3s"><x:span begin="1s" end="2s">Hello</x:span>${space}<x:span begin="2s" end="3s">world</x:span></x:p>`));
        expect(service.project(doc).lines[0].words.map(w => w.word).join('')).toBe('Hello world');
        expect(service.project(doc).lines[0].words.map(w => [w.startTime, w.endTime])).toEqual([[1000, 2000], [2000, 3000]]);
    });
});
