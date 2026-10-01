import {lyricsGateway} from '@/infrastructure/electron';
import type {ProviderLyricsPayload, TrackLyricsQuery} from '../domain/types';

export interface EmbeddedCandidate {
    candidateId: string;
    title: string;
    stpp: boolean;
    payload?: ProviderLyricsPayload;
    error?: string;
}

export class EmbeddedLyricsSource {
    async list(query: TrackLyricsQuery): Promise<EmbeddedCandidate[]> {
        if (!query.filePath) return [];
        const result = await lyricsGateway.getEmbedded(query.filePath);
        if (!result.success) return [];
        return (result.candidates ?? (result.lyrics ? [result.lyrics] : [])).map((embedded, index) => {
            const candidate: EmbeddedCandidate = {
                candidateId: String(embedded.candidateId ?? 'legacy:' + index),
                title: [embedded.type, embedded.language, embedded.description].filter(Boolean).join(' · ') || '内嵌歌词',
                stpp: embedded.type === 'STPP'
            };
            if (embedded.error) return {...candidate, error: String(embedded.error)};
            const text = embedded.text.replace(/^\uFEFF/, '').trim();
            if (embedded.format?.toLowerCase() === 'ttml' || text.startsWith('<')) {
                candidate.payload = {kind: 'ttml', ttml: text};
            } else if (hasLrcTimestamp(text)) {
                candidate.payload = {kind: 'lrc', lyrics: text};
            } else if (embedded.synchronized && embedded.timestamps?.length) {
                candidate.payload = {kind: 'lrc', lyrics: embedded.timestamps.map(item => '[' + formatTimestamp(item.time) + ']' + item.text).join('\n')};
            } else candidate.error = '未包含受支持的定时歌词';
            return candidate;
        });
    }

    async find(query: TrackLyricsQuery, candidateId?: string): Promise<ProviderLyricsPayload | null> {
        const candidates = await this.list(query);
        return (candidateId ? candidates.find(item => item.candidateId === candidateId) : candidates.find(item => item.payload))?.payload ?? null;
    }
}

function hasLrcTimestamp(text: string): boolean {
    return /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?]/m.test(text);
}

function formatTimestamp(seconds: number): string {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    const minutesPart = Math.floor(milliseconds / 60_000);
    const secondsPart = Math.floor((milliseconds % 60_000) / 1000);
    const millisecondsPart = milliseconds % 1000;
    return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}.${String(millisecondsPart).padStart(3, '0')}`;
}
