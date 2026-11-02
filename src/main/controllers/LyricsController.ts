import {nativeT} from '../services/i18n/Translation';
import {createHash} from 'node:crypto';
import {readStppCandidates} from '../services/lyrics/StppReader';
// 歌词控制器

import * as fs from 'fs';
import * as path from 'path';
import {dialog, net} from 'electron';
import {BaseController, Controller, IpcHandle} from '../decorators/IpcHandler';
import {WindowManager} from '../core/WindowManager';
import {extractAllEmbeddedLyrics, getMimeTypeFromExtension} from '../utils/metadata';
import {generateLyricsSearchPatterns, findBestLyricsMatch} from '../utils/FileSearch';
import {NetworkFileAdapter} from '../services/network/NetworkFileAdapter';
import {
    LyricsPersistenceService,
    type PersistedLyricsSelectionMode,
    type PersistedLyricsSource
} from '../services/lyrics/LyricsPersistenceService';

interface DirCache {
    files: string[];
    expiresAt: number;
}

interface LyricsExportResult {
    success: boolean;
    filePath?: string;
    cancelled?: boolean;
    error?: string;
}

const TTML_FILTERS: Electron.FileFilter[] = [
    {name: nativeT('errors:ttmlLyrics'), extensions: ['ttml']},
    {name: nativeT('errors:allFiles'), extensions: ['*']}
];

const DIR_CACHE_TTL = 60_000; // 60 秒

@Controller('lyrics')
export class LyricsController extends BaseController {
    private dirCache = new Map<string, DirCache>();
    private providerRequests = new Map<string, AbortController>();

    constructor(
        private networkFileAdapter: NetworkFileAdapter,
        private lyricsPersistence: LyricsPersistenceService,
        private windowManager: WindowManager
    ) {
        super();
    }

    @IpcHandle('lyrics:readCanonical')
    async readCanonical(trackId: string) {
        try {
            const result = await this.lyricsPersistence.read(trackId);
            return result ? {success: true, ...result} : {success: false, error: nativeT('errors:boundLyricsNotFound')};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('lyrics:getBinding')
    async getBinding(trackId: string) {
        try {
            return {success: true, binding: await this.lyricsPersistence.getBinding(trackId)};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('lyrics:saveCanonical')
    async saveCanonical(
        trackId: string,
        ttml: string,
        source: PersistedLyricsSource,
        selectionMode: PersistedLyricsSelectionMode
    ) {
        try {
            const binding = await this.lyricsPersistence.save(trackId, ttml, source, selectionMode);
            return {success: true, binding};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('lyrics:exportTtml')
    async exportTtml(defaultName: string, content: string): Promise<LyricsExportResult> {
        if (typeof content !== 'string' || content.trim().length === 0) {
            return {success: false, error: nativeT('errors:noTtmlLyricsToSave')};
        }

        try {
            const win = this.windowManager.getMainWindow();
            const result = await dialog.showSaveDialog(win as any, {
                title: nativeT('errors:saveTtmlLyrics'),
                defaultPath: this.createTtmlFileName(defaultName),
                filters: TTML_FILTERS
            });

            if (result.canceled || !result.filePath) {
                return {success: false, cancelled: true};
            }

            await fs.promises.writeFile(result.filePath, content, 'utf-8');
            return {success: true, filePath: result.filePath};
        } catch (error) {
            return {success: false, error: error instanceof Error ? error.message : String(error)};
        }
    }

    @IpcHandle('lyrics:clearBinding')
    async clearBinding(trackId: string) {
        try {
            return {success: true, cleared: await this.lyricsPersistence.clearBinding(trackId)};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('lyrics:providerRequest')
    async providerRequest(
        requestId: string,
        url: string,
        options: {method?: string; headers?: Record<string, string>; body?: string} = {}
    ) {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:' || !PROVIDER_HOSTS.has(parsedUrl.hostname)) {
            throw new Error(nativeT('errors:accessToThisLyricsSourceIsNotAllowed'));
        }

        const method = (options.method ?? 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'POST') throw new Error(nativeT('errors:unsupportedLyricsRequestMethod'));
        if ((options.body?.length ?? 0) > 1024 * 1024) throw new Error(nativeT('errors:lyricsRequestIsTooLarge'));

        const controller = new AbortController();
        this.providerRequests.set(requestId, controller);
        try {
            const response = await net.fetch(parsedUrl.toString(), {
                method,
                headers: filterProviderHeaders(options.headers),
                body: method === 'POST' ? options.body : undefined,
                signal: controller.signal
            });
            const body = await response.text();
            if (body.length > 10 * 1024 * 1024) throw new Error(nativeT('errors:lyricsResponseIsTooLarge'));
            return {
                status: response.status,
                statusText: response.statusText,
                body,
                headers: {
                    'content-type': response.headers.get('content-type') ?? 'text/plain',
                    ...(response.headers.get('retry-after') ? {'retry-after': response.headers.get('retry-after')!} : {})
                }
            };
        } finally {
            this.providerRequests.delete(requestId);
        }
    }

    @IpcHandle('lyrics:cancelProviderRequest')
    cancelProviderRequest(requestId: string): void {
        this.providerRequests.get(requestId)?.abort();
    }

    private async getCachedDir(lyricsDir: string): Promise<string[]> {
        const now = Date.now();
        const cached = this.dirCache.get(lyricsDir);
        if (cached && cached.expiresAt > now) return cached.files;
        const files = await fs.promises.readdir(lyricsDir);
        this.dirCache.set(lyricsDir, {files, expiresAt: now + DIR_CACHE_TTL});
        return files;
    }

    @IpcHandle('lyrics:readLocalFile')
    async readLocalFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
        const chardet = require('chardet');
        const iconv = require('iconv-lite');
        try {
            const buffer = await fs.promises.readFile(filePath);
            const detectedEncoding = chardet.detect(buffer) || 'utf8';
            const content = iconv.decode(buffer, detectedEncoding);
            return {success: true, content};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('lyrics:getEmbedded')
    async getEmbedded(filePath: string): Promise<{ success: boolean; lyrics?: any; candidates?: any[]; source?: string; error?: string }> {
        const mm = require('music-metadata');
        try {
            if (!filePath) {
                return {success: false, error: nativeT('errors:invalidFilePath')};
            }

            const isNetwork = this.networkFileAdapter.isNetworkPath(filePath);
            if (!isNetwork) {
                try {
                    await fs.promises.access(filePath);
                } catch {
                    return {success: false, error: nativeT('errors:theAudioFileDoesNotExist')};
                }
            }

            const candidates: any[] = [];
            const isMp4 = ['.m4a', '.mp4', '.m4b'].includes(path.extname(filePath).toLowerCase());
            const buffer = isNetwork ? await this.networkFileAdapter.readFile(filePath) : undefined;
            if (isMp4) {
                const handle = buffer ? undefined : await fs.promises.open(filePath, 'r');
                try {
                    const size = buffer?.length ?? (await handle!.stat()).size;
                    candidates.push(...await readStppCandidates({size, read: async (offset, length) => {
                        if (buffer) return buffer.subarray(offset, offset + length);
                        const target = Buffer.alloc(length);
                        const {bytesRead} = await handle!.read(target, 0, length, offset);
                        if (bytesRead !== length) throw new Error(nativeT('errors:mediaFileCouldNotBeReadCompletely'));
                        return target;
                    }}));
                } catch (error) {
                    candidates.push({candidateId: 'stpp:error', type: 'STPP', format: 'ttml', text: '', error: String(error)});
                } finally {
                    await handle?.close();
                }
            }
            try {
                const metadata = buffer
                    ? await mm.parseBuffer(buffer, {mimeType: getMimeTypeFromExtension(path.extname(filePath)), size: buffer.length})
                    : await mm.parseFile(filePath);
                candidates.push(...extractAllEmbeddedLyrics(metadata));
            } catch (error) {
                if (!candidates.length) throw error;
            }
            for (const candidate of candidates) {
                candidate.contentHash = createHash('sha256').update(JSON.stringify([candidate.text, candidate.timestamps])).digest('hex');
            }
            return {success: true, candidates, lyrics: candidates.find(item => !item.error), source: 'embedded'};
        } catch (error: any) {
            let msg = error.message;
            if (error.code === 'ENOENT') msg = '音频文件不存在或无法访问';
            else if (error.code === 'EACCES') msg = '没有权限访问音频文件';
            return {success: false, error: msg};
        }
    }

    @IpcHandle('lyrics:searchLocalFiles')
    async searchLocalFiles(
        lyricsDir: string,
        title: string,
        artist: string,
        album: string,
        extension = '.lrc'
    ): Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }> {
        try {
            try {
                await fs.promises.access(lyricsDir);
            } catch {
                return {success: false, error: nativeT('errors:lyricsFolderDoesNotExist')};
            }

            const files = await this.getCachedDir(lyricsDir);
            const lyricsFiles = files.filter(f => path.extname(f).toLowerCase() === extension.toLowerCase());

            const searchPatterns = generateLyricsSearchPatterns(title, artist, album, extension);
            const matched = findBestLyricsMatch(lyricsFiles, searchPatterns);
            if (matched) {
                return {success: true, filePath: path.join(lyricsDir, matched), fileName: matched};
            }
            return {success: false, error: nativeT('errors:noMatchingLyricsFile')};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('lyrics:saveToLocal')
    async saveToLocal(
        lyricsDir: string,
        title: string,
        artist: string,
        _album: string,
        content: string,
        format = 'lrc'
    ): Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }> {
        try {
            if (!lyricsDir) return {success: false, error: nativeT('errors:lyricsFolderIsNotConfigured')};
            await fs.promises.mkdir(lyricsDir, {recursive: true});

            let fileName = artist?.trim()
                ? `${artist.trim()} - ${title.trim()}.${format}`
                : `${title.trim()}.${format}`;
            fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
            const filePath = path.join(lyricsDir, fileName);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            this.dirCache.delete(lyricsDir);
            return {success: true, filePath, fileName};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    private createTtmlFileName(defaultName: string): string {
        const safeName = (defaultName || 'lyrics')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/[. ]+$/g, '')
            .trim() || 'lyrics';
        return safeName.toLowerCase().endsWith('.ttml') ? safeName : `${safeName}.ttml`;
    }
}

const PROVIDER_HOSTS = new Set([
    'amlldb.bikonoo.com',
    'music.163.com',
    'c.y.qq.com',
    'i.y.qq.com',
    'u.y.qq.com',
    'mobiles.kugou.com',
    'songsearch.kugou.com',
    'lyrics.kugou.com'
]);

function filterProviderHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    const allowed = new Set(['accept', 'content-type', 'origin', 'referer']);
    return Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => allowed.has(name.toLowerCase())));
}
