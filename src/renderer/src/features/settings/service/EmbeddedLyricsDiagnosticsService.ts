import {t} from '@/shared/i18n';

import {mediaFileDialogService} from "@/features/media/service";
import {lyricsGateway} from '@/infrastructure/electron';

interface DebugEmbeddedLyricsResult {
    success: boolean;
    error?: string;
    lyricsAnalysis?: {
        type?: string;
        format?: string;
        language?: string;
        description?: string;
        synchronized?: boolean;
        textLength?: number;
        timestampCount?: number;
        textSample?: string;
    };
}

export interface EmbeddedLyricsDiagnosticsReport {
    selected: boolean;
    foundLyrics: boolean;
    filePath?: string;
    report?: string;
    error?: string;
}

class EmbeddedLyricsDiagnosticsService {
    async chooseFileAndBuildReport(): Promise<EmbeddedLyricsDiagnosticsReport> {
        const filePaths = await mediaFileDialogService.openFiles();
        if (!filePaths || filePaths.length === 0) {
            return {selected: false, foundLyrics: false};
        }

        const filePath = filePaths[0];
        const result = await lyricsGateway.getEmbedded(filePath);
        const lyrics = result.lyrics;
        const debugResult: DebugEmbeddedLyricsResult = {
            success: result.success,
            error: result.error,
            lyricsAnalysis: lyrics ? {
                type: lyrics.type,
                format: lyrics.format,
                language: lyrics.language,
                description: lyrics.description,
                synchronized: lyrics.synchronized,
                textLength: lyrics.text?.length ?? 0,
                timestampCount: lyrics.timestamps?.length ?? 0,
                textSample: lyrics.text?.slice(0, 500)
            } : undefined
        };

        return {
            selected: true,
            foundLyrics: debugResult.success && !!debugResult.lyricsAnalysis,
            filePath,
            report: this.buildReport(filePath, debugResult),
            error: debugResult.error
        };
    }

    private buildReport(filePath: string, debugResult: DebugEmbeddedLyricsResult): string {
        const reportLines: string[] = [
            t('dynamic:diagnosticFile', {path: filePath}),
            t('dynamic:diagnosticTime', {time: new Date().toLocaleString()}),
            ``,
            t('audit:reportResults'),
            t('dynamic:diagnosticSuccess', {success: debugResult.success ? t('messages:yes') : t('messages:no')})
        ];

        if (debugResult.success && debugResult.lyricsAnalysis) {
            const analysis = debugResult.lyricsAnalysis;
            reportLines.push(
                ``,
                t('audit:reportLyrics'),
                t('dynamic:diagnosticType', {type: analysis.type}),
                t('dynamic:diagnosticFormat', {format: analysis.format}),
                t('dynamic:diagnosticLanguage', {language: analysis.language || t('messages:unknown')}),
                t('dynamic:diagnosticDescription', {description: analysis.description || t('messages:none')}),
                t('dynamic:diagnosticSynchronized', {synchronized: analysis.synchronized ? t('messages:yes') : t('messages:no')}),
                t('dynamic:diagnosticLength', {count: analysis.textLength}),
                t('dynamic:diagnosticTimestamps', {count: analysis.timestampCount}),
                ``
            );

            if (analysis.textSample) {
                reportLines.push(t('audit:reportPreview'), analysis.textSample, ``);
            }

        } else {
            reportLines.push(t('dynamic:diagnosticError', {details: debugResult.error || t('messages:unknownError')}));
        }

        return reportLines.join('\n');
    }
}

export const embeddedLyricsDiagnosticsService = new EmbeddedLyricsDiagnosticsService();
