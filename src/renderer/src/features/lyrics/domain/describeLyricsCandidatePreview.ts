import type {LyricsCandidatePreview, LyricsDocument} from './types';
import {t} from '@/shared/i18n';

export function describeLyricsCandidatePreview(preview: LyricsCandidatePreview): string[] {
    const [timing, ...features] = describeLyricsDocument(preview.document);
    return [
        preview.format.toUpperCase(),
        timing,
        preview.fallbackReason === 'source-unavailable' && preview.fallbackFrom
            ? t('lyrics:sourceMissingFormat', {format: preview.fallbackFrom.toUpperCase()})
            : false,
        ...features
    ].filter((label): label is string => Boolean(label));
}

export function describeLyricsDocument(document: LyricsDocument): string[] {
    const lines = document.render.lines;
    const labels = [
        t(document.ttml.metadata.timingMode === 'Word' || lines.some(line => line.words.length > 1) ? 'messages:wordByWord' : 'messages:lineByLine'),
        lines.some(line => Boolean(line.translatedLyric?.trim())) && t('messages:translation'),
        lines.some(line => Boolean(line.romanLyric?.trim()) || line.words.some(word => Boolean(word.romanWord?.trim()))) && t('messages:romanization'),
        lines.some(line => line.words.some(word => Boolean(word.ruby?.length))) && t('messages:rubyAnnotations')
    ];
    return labels.filter((label): label is string => Boolean(label));
}
