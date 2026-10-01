import {
    TTMLGenerator,
    TTMLParser,
    toAmllLyrics,
    type AmllLyricResult,
    type GeneratorOptions,
    type TTMLParserOptions,
    type TTMLResult,
    type TTMLToAmllOptions
} from '@applemusic-like-lyrics/ttml';

const TT = 'http://www.w3.org/ns/ttml';
const TTM = 'http://www.w3.org/ns/ttml#metadata';
const ITUNES = 'http://music.apple.com/lyric-ttml-internal';
export type LyricAlignment = 'left' | 'right' | 'center';
type Vocal = TTMLResult['lines'][number] & {backgroundVocal?: TTMLResult['lines'][number]};
export type AlignedLyricResult = Omit<AmllLyricResult, 'lines'> & {lines: Array<AmllLyricResult['lines'][number] & {alignment?: LyricAlignment}>};

export interface TtmlDomAdapters {
    parser?: TTMLParserOptions['domParser'];
    implementation?: GeneratorOptions['domImplementation'];
    serializer?: GeneratorOptions['xmlSerializer'];
}

export class TtmlDocumentService {
    private readonly generator: TTMLGenerator;
    private readonly domParser: NonNullable<TTMLParserOptions['domParser']>;
    private readonly xmlSerializer: NonNullable<GeneratorOptions['xmlSerializer']>;

    constructor(adapters: TtmlDomAdapters = {}) {
        this.domParser = adapters.parser ?? new DOMParser();
        this.xmlSerializer = adapters.serializer ?? new XMLSerializer();
        this.generator = new TTMLGenerator(
            adapters.implementation && adapters.serializer
                ? {
                    domImplementation: adapters.implementation,
                    xmlSerializer: adapters.serializer,
                    useSidecar: true
                }
                : {useSidecar: true}
        );
    }

    parse(ttmlText: string): TTMLResult {
        if (!ttmlText.trim()) {
            throw new Error('TTML 内容为空');
        }
        const dom = this.domParser.parseFromString(ttmlText, 'application/xml') as unknown as Document;
        if (dom.documentElement?.localName !== 'tt' || (dom.documentElement.namespaceURI && dom.documentElement.namespaceURI !== TT)) {
            throw new Error('不是有效的 TTML 文档');
        }
        if (dom.getElementsByTagName('parsererror').length) throw new Error('TTML XML 解析失败');
        // 上游按字面查找正文和附属轨，在内存 DOM 归一化已知命名空间的元素前缀。
        for (const element of Array.from(dom.getElementsByTagName('*'))) {
            if (!element.prefix || (element.namespaceURI !== TT && element.namespaceURI !== ITUNES)) continue;
            const replacement = dom.createElementNS(element.namespaceURI, element.localName);
            for (const attribute of Array.from(element.attributes)) {
                replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
            }
            while (element.firstChild) replacement.appendChild(element.firstChild);
            element.parentNode?.replaceChild(replacement, element);
        }
        const paragraphs = Array.from(dom.getElementsByTagNameNS(TT, 'p'));
        if (!paragraphs.length) paragraphs.push(...Array.from(dom.getElementsByTagName('p')));
        const usedKeys = new Set(paragraphs.map(p => p.getAttributeNS(ITUNES, 'key')).filter(Boolean));
        paragraphs.forEach((p, index) => {
            // 上游解析器要求 iTunes key；仅在内存副本补齐，不改原始 XML。
            if (!p.getAttributeNS(ITUNES, 'key')) {
                let key = `musicbox-${index}`;
                while (usedKeys.has(key)) key += '-';
                usedKeys.add(key);
                p.setAttributeNS(ITUNES, 'itunes:key', key);
            }
        });
        for (const span of Array.from(dom.getElementsByTagNameNS(TT, 'span'))) {
            if (!span.getAttribute('begin') && !span.getAttribute('end') && !span.getAttributeNS(TTM, 'role')
                && span.textContent && !span.textContent.trim() && !span.children?.length) {
                span.parentNode?.replaceChild(dom.createTextNode(span.textContent), span);
            }
        }
        const result = new TTMLParser({domParser: {parseFromString: () => dom}}).parse(ttmlText);
        for (const line of result.lines as Vocal[]) {
            const p = paragraphs.find(item => item.getAttributeNS(ITUNES, 'key') === line.id);
            const bg = p && Array.from(p.getElementsByTagNameNS(TT, 'span')).find(item => item.getAttributeNS(TTM, 'role') === 'x-bg');
            const agent = bg?.getAttributeNS(TTM, 'agent');
            if (line.backgroundVocal && agent) line.backgroundVocal.agentId = agent;
        }
        return result;
    }

    serialize(document: TTMLResult): string {
        const generated = this.generator.generate(document);
        if (!document.lines.some(line => (line as Vocal).backgroundVocal?.agentId)) return generated;
        const dom = this.domParser.parseFromString(generated, 'application/xml') as unknown as Document;
        const paragraphs = Array.from(dom.getElementsByTagNameNS(TT, 'p'));
        document.lines.forEach((line, index) => {
            const agent = (line as Vocal).backgroundVocal?.agentId;
            if (!agent) return;
            const bg = Array.from(paragraphs[index]?.getElementsByTagNameNS(TT, 'span') ?? []).find(item => item.getAttributeNS(TTM, 'role') === 'x-bg');
            bg?.setAttributeNS(TTM, 'ttm:agent', agent);
        });
        return this.xmlSerializer.serializeToString(dom);
    }

    project(document: TTMLResult, options: TTMLToAmllOptions = {}): AlignedLyricResult {
        const result: AlignedLyricResult = toAmllLyrics(document, options);
        const agents = Object.keys(document.metadata.agents ?? {});
        const alignment = (refs?: string): LyricAlignment => {
            const ids = [...new Set(refs?.trim().split(/\s+/).filter(Boolean) ?? [])];
            if (ids.length > 1 || ids.some(id => document.metadata.agents?.[id]?.type === 'group')) return 'center';
            const index = agents.indexOf(ids[0]);
            return index >= 0 && index % 2 === 1 ? 'right' : 'left';
        };
        let index = 0;
        for (const line of document.lines as Vocal[]) {
            const mainAlignment = alignment(line.agentId);
            const main = result.lines[index++];
            main.alignment = mainAlignment;
            main.isDuet = mainAlignment === 'right';
            if (line.backgroundVocal) {
                const bg = result.lines[index++];
                bg.alignment = line.backgroundVocal.agentId ? alignment(line.backgroundVocal.agentId) : mainAlignment;
                bg.isDuet = bg.alignment === 'right';
            }
        }
        return result;
    }
}
