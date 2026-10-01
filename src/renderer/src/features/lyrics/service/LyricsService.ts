import type {Track} from '@api/types/track';
import {lyricsGateway} from '@/infrastructure/electron';
import type {
    LyricsBinding,
    LyricsCandidate,
    LyricsCandidatePreview,
    LyricsDocument,
    LyricsSelectionMode,
    LyricsSourceRef,
    TrackLyricsQuery
} from '../domain/types';
import {LyricsNormalizer} from '../format/LyricsNormalizer';
import type {LyricsProviderRegistry} from '../providers/LyricsProviderRegistry';
import {LyricsSearchService} from './LyricsSearchService';
import {EmbeddedLyricsSource} from '../sources/EmbeddedLyricsSource';
import {LocalLyricsSource} from '../sources/LocalLyricsSource';
import {AUTO_MATCH_IDENTITY_THRESHOLD, compareLyricsCandidates, scoreLyricsCandidateQuality} from '../domain/candidateMatching';
import {TtmlDocumentService} from '../format/TtmlDocumentService';
import {shiftTimeline} from '../format/TtmlTimelineEditor';

export interface EmbeddedLyricsPreview {
    candidateId: string;
    title: string;
    stpp: boolean;
    preview?: LyricsCandidatePreview;
    error?: string;
}

export interface LyricsLoadResult {
    document: LyricsDocument | null;
    binding?: LyricsBinding;
    error?: string;
}

export interface LyricsTimelineShiftResult extends LyricsLoadResult {
    appliedDeltaMs: number;
}

export interface LyricsServiceOptions {
    providers: LyricsProviderRegistry;
    localSource: LocalLyricsSource;
    embeddedSource?: EmbeddedLyricsSource;
    normalizer?: LyricsNormalizer;
    ttmlService?: TtmlDocumentService;
}

export class LyricsService {
    private readonly providers: LyricsProviderRegistry;
    private readonly localSource: LocalLyricsSource;
    private readonly embeddedSource: EmbeddedLyricsSource;
    private readonly normalizer: LyricsNormalizer;
    private readonly ttmlService?: TtmlDocumentService;

    constructor(options: LyricsServiceOptions) {
        this.providers = options.providers;
        this.localSource = options.localSource;
        this.embeddedSource = options.embeddedSource ?? new EmbeddedLyricsSource();
        this.normalizer = options.normalizer ?? new LyricsNormalizer();
        this.ttmlService = options.ttmlService;
    }

    async load(track: Track, signal: AbortSignal): Promise<LyricsLoadResult> {
        const query = toTrackLyricsQuery(track);
        const save = (document: LyricsDocument) => {
            signal.throwIfAborted();
            return this.persist(query.trackId, document, 'auto');
        };
        const persisted = await lyricsGateway.readCanonical(query.trackId);
        signal.throwIfAborted();
        if (persisted.success && persisted.ttml && persisted.binding?.selectionMode === 'manual') {
            try {
                const source = persisted.binding.source;
                if (source.kind === 'embedded' && source.candidateId) {
                    const available = await this.embeddedSource.find(query, source.candidateId);
                    if (!available) throw new Error('已绑定的内嵌候选已失效');
                }
                signal.throwIfAborted();
                return {document: this.normalizer.fromTtml(persisted.ttml, this.createContext(query, source)), binding: persisted.binding};
            } catch (error) {
                signal.throwIfAborted();
                console.warn('⚠️ Lyrics: 手动绑定失效，重新自动匹配', error);
            }
        }
        const embedded = await this.listEmbedded(query);
        signal.throwIfAborted();
        const stpp = embedded.find(item => item.stpp && item.preview);
        if (stpp?.preview) return save(stpp.preview.document);
        if (persisted.success && persisted.ttml && persisted.binding?.selectionMode === 'auto' && persisted.binding.source.kind !== 'embedded') {
            try {
                return {document: this.normalizer.fromTtml(persisted.ttml, this.createContext(query, persisted.binding.source)), binding: persisted.binding};
            } catch (error) {
                console.warn('⚠️ Lyrics: 自动缓存无效，重新匹配', error);
            }
        }
        let localFallback: LyricsDocument | null = null;
        const local = await this.localSource.find(query);
        signal.throwIfAborted();
        if (local) {
            try {
                const source: LyricsSourceRef = {kind: 'local', path: local.path};
                const document = local.kind === 'ttml'
                    ? this.normalizer.fromTtml(local.content, this.createContext(query, source))
                    : this.normalizer.fromLrc(local.content, this.createContext(query, source));
                if (isWordTimed(document)) return save(document);
                localFallback = document;
            } catch (error) { console.warn('⚠️ Lyrics: 外置歌词解析失败', error); }
        }
        const searchResults = await new LyricsSearchService(this.providers).searchAll(query, signal);
        signal.throwIfAborted();
        const candidates: Array<{candidate: LyricsCandidate; document?: LyricsDocument}> = embedded
            .filter(item => !item.stpp && item.preview)
            .map(item => ({candidate: this.scoreEmbedded(item), document: item.preview!.document}));
        candidates.push(...searchResults.flatMap(result => result.candidates.slice(0, 2))
            .filter(candidate => candidate.identityScore >= AUTO_MATCH_IDENTITY_THRESHOLD)
            .map(candidate => ({candidate})));
        candidates.sort((a, b) => compareLyricsCandidates(a.candidate, b.candidate));
        let lineFallback: LyricsDocument | null = null;
        for (const item of candidates) {
            signal.throwIfAborted();
            try {
                const document = item.document ?? await this.fetchCandidate(query, item.candidate, signal);
                signal.throwIfAborted();
                if (isWordTimed(document)) return save(document);
                lineFallback ??= document;
            } catch (error) {
                signal.throwIfAborted();
                console.warn('⚠️ Lyrics: 候选自动匹配失败', error);
            }
        }
        if (localFallback) return save(localFallback);
        if (lineFallback) return save(lineFallback);
        return {document: null, error: '未找到歌词'};
    }

    async listEmbedded(query: TrackLyricsQuery): Promise<EmbeddedLyricsPreview[]> {
        const candidates = await this.embeddedSource.list(query);
        return candidates.map(candidate => {
            try {
                if (!candidate.payload) return candidate;
                const source: LyricsSourceRef = {kind: 'embedded', trackId: query.trackId, candidateId: candidate.candidateId};
                const document = this.normalizer.fromPayload(candidate.payload, this.createContext(query, source));
                if (!document.render.lines.length) throw new Error('歌词没有可播放内容');
                return {...candidate, preview: {document, format: candidate.payload.kind}};
            } catch (error) {
                return {...candidate, error: error instanceof Error ? error.message : String(error)};
            }
        });
    }

    scoreEmbedded(item: EmbeddedLyricsPreview): LyricsCandidate {
        const preview = item.preview!;
        const lines = preview.document.render.lines;
        const candidate = {
            providerId: 'embedded', candidateId: item.candidateId, title: item.title, artists: [],
            capabilities: {
                ttml: preview.format === 'ttml', wordTimed: isWordTimed(preview.document),
                translation: lines.some(line => !!line.translatedLyric),
                romanization: lines.some(line => !!line.romanLyric || line.words.some(word => !!word.romanWord)),
                ruby: lines.some(line => line.words.some(word => !!word.ruby?.length))
            }
        };
        return {...candidate, identityScore: 100, qualityScore: scoreLyricsCandidateQuality(candidate)};
    }

    async applyCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsLoadResult> {
        const document = await this.fetchCandidate(query, candidate, signal);
        return this.persist(query.trackId, document, 'manual');
    }

    async applyPreview(query: TrackLyricsQuery, preview: LyricsCandidatePreview): Promise<LyricsLoadResult> {
        return this.persist(query.trackId, preview.document, 'manual');
    }

    async previewLocal(query: TrackLyricsQuery): Promise<LyricsCandidatePreview | null> {
        const local = await this.localSource.find(query);
        if (!local) return null;
        const source: LyricsSourceRef = {kind: 'local', path: local.path};
        return {
            document: local.kind === 'ttml'
                ? this.normalizer.fromTtml(local.content, this.createContext(query, source))
                : this.normalizer.fromLrc(local.content, this.createContext(query, source)),
            format: local.kind
        };
    }

    async previewEmbedded(query: TrackLyricsQuery): Promise<LyricsCandidatePreview | null> {
        return (await this.listEmbedded(query)).find(item => item.preview)?.preview ?? null;
    }

    async refreshBinding(
        query: TrackLyricsQuery,
        binding: LyricsBinding,
        signal: AbortSignal
    ): Promise<LyricsLoadResult> {
        const source = binding.source;
        let document: LyricsDocument;
        if (source.kind === 'local') {
            const result = await lyricsGateway.readLocalFile(source.path);
            if (!result.success || !result.content?.trim()) throw new Error(result.error ?? '本地歌词不可用');
            document = source.path.toLocaleLowerCase().endsWith('.ttml')
                ? this.normalizer.fromTtml(result.content, this.createContext(query, source))
                : this.normalizer.fromLrc(result.content, this.createContext(query, source));
        } else if (source.kind === 'embedded') {
            const payload = await this.embeddedSource.find(query, source.candidateId);
            if (!payload) throw new Error('音频内嵌歌词不可用');
            document = this.normalizer.fromPayload(payload, this.createContext(query, source));
        } else {
            const provider = this.providers.get(source.providerId);
            if (!provider) throw new Error('未知歌词来源');
            const candidate = (await provider.search(query, signal))
                .find(item => item.candidateId === source.candidateId);
            if (!candidate) throw new Error('当前歌词候选已不可用');
            document = await this.fetchCandidate(query, candidate, signal);
        }
        signal.throwIfAborted();
        return this.persist(query.trackId, document, binding.selectionMode);
    }

    async previewCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsCandidatePreview> {
        const provider = this.providers.get(candidate.providerId);
        if (!provider) throw new Error('未知歌词来源');
        const payload = await provider.fetch(candidate, signal);
        const source: LyricsSourceRef = {
            kind: 'provider',
            providerId: candidate.providerId,
            candidateId: candidate.candidateId
        };
        return {
            document: this.normalizer.fromPayload(payload, this.createContext(query, source)),
            format: payload.kind,
            ...(payload.fallbackFrom ? {fallbackFrom: payload.fallbackFrom} : {}),
            ...(payload.fallbackReason ? {fallbackReason: payload.fallbackReason} : {})
        };
    }

    async clearBinding(track: Track): Promise<void> {
        const result = await lyricsGateway.clearBinding(toTrackLyricsQuery(track).trackId);
        if (!result.success) throw new Error(result.error ?? '清除歌词绑定失败');
    }

    async shiftCanonicalTimeline(
        query: TrackLyricsQuery,
        requestedDeltaMs: number
    ): Promise<LyricsTimelineShiftResult> {
        const persisted = await lyricsGateway.readCanonical(query.trackId);
        if (!persisted.success || !persisted.ttml || !persisted.binding) {
            return {
                document: null,
                appliedDeltaMs: 0,
                error: persisted.error ?? '当前歌曲没有可编辑的 canonical 歌词'
            };
        }

        try {
            const ttmlService = this.ttmlService ?? new TtmlDocumentService();
            const current = ttmlService.parse(persisted.ttml);
            const shifted = shiftTimeline(current, requestedDeltaMs);
            const ttmlText = ttmlService.serialize(shifted.document);
            const document: LyricsDocument = {
                ttmlText,
                ttml: shifted.document,
                render: ttmlService.project(shifted.document),
                source: persisted.binding.source
            };
            const saved = await lyricsGateway.saveCanonical(
                query.trackId,
                ttmlText,
                persisted.binding.source,
                'manual'
            );
            if (!saved.success) {
                return {
                    document: null,
                    appliedDeltaMs: 0,
                    error: saved.error ?? 'canonical TTML 保存失败'
                };
            }
            return {document, binding: saved.binding, appliedDeltaMs: shifted.appliedDeltaMs};
        } catch (error) {
            return {
                document: null,
                appliedDeltaMs: 0,
                error: error instanceof Error ? error.message : '歌词时间轴调整失败'
            };
        }
    }

    private async persist(
        trackId: string,
        document: LyricsDocument,
        selectionMode: LyricsSelectionMode
    ): Promise<LyricsLoadResult> {
        const saved = await lyricsGateway.saveCanonical(trackId, document.ttmlText, document.source, selectionMode);
        if (!saved.success) {
            console.warn(`⚠️ Lyrics: canonical TTML 保存失败: ${saved.error ?? '未知错误'}`);
        }
        return {document, binding: saved.binding};
    }

    private async fetchCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsDocument> {
        const provider = this.providers.get(candidate.providerId);
        if (!provider) throw new Error('未知歌词来源');
        const payload = await provider.fetch(candidate, signal);
        const source: LyricsSourceRef = {
            kind: 'provider',
            providerId: candidate.providerId,
            candidateId: candidate.candidateId
        };
        return this.normalizer.fromPayload(payload, this.createContext(query, source));
    }

    private createContext(query: TrackLyricsQuery, source: LyricsSourceRef) {
        return {
            source,
            durationMs: query.durationMs,
            title: query.title,
            artists: query.artists,
            album: query.album
        };
    }
}

function isWordTimed(document: LyricsDocument): boolean {
    if (document.ttml.metadata.timingMode === 'Word') return true;
    return document.render.lines.some(line => line.words.length > 1);
}

export function toTrackLyricsQuery(track: Track): TrackLyricsQuery {
    const filePath = String(track.filePath || track.path || '');
    const trackId = String(track.fileId || track.id || filePath || `${track.title}\u0000${track.artist}`);
    const duration = typeof track.duration === 'number' && Number.isFinite(track.duration)
        ? (track.duration < 10_000 ? track.duration * 1000 : track.duration)
        : undefined;
    return {
        trackId,
        title: track.title,
        artists: track.artist ? track.artist.split(/[、/&;,，]+/).map(artist => artist.trim()).filter(Boolean) : [],
        album: track.album,
        durationMs: duration,
        filePath
    };
}
