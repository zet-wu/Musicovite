import {nativeT} from '../i18n/Translation';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {app} from 'electron';

export type LibrarySourceType = 'directory' | 'file';
export type LibrarySourceOrigin = string;

export interface LibrarySourceKnownFile {
    path: string;
    canonicalPath: string;
    trackId?: string;
}

export interface LibrarySource {
    id: string;
    type: LibrarySourceType;
    path: string;
    canonicalPath: string;
    origin: LibrarySourceOrigin;
    knownFiles: LibrarySourceKnownFile[];
    createdAt: number;
    lastScanAt?: number;
}

export interface PlaylistSourceBinding {
    id: string;
    playlistId: string;
    sourceId: string;
    managedFiles: LibrarySourceKnownFile[];
    excludedPaths: string[];
    createdAt: number;
    lastSyncAt?: number;
}

export interface PlaylistBindingPartition {
    activeBindings: PlaylistSourceBinding[];
    orphanBindings: PlaylistSourceBinding[];
}

export function partitionPlaylistBindings(
    bindings: PlaylistSourceBinding[],
    validPlaylistIds: Iterable<string>
): PlaylistBindingPartition {
    const validIds = new Set(validPlaylistIds);
    const activeBindings: PlaylistSourceBinding[] = [];
    const orphanBindings: PlaylistSourceBinding[] = [];

    for (const binding of bindings) {
        (validIds.has(binding.playlistId) ? activeBindings : orphanBindings).push(binding);
    }
    return {activeBindings, orphanBindings};
}

interface LibrarySourceData {
    version: 1;
    sources: LibrarySource[];
    playlistBindings: PlaylistSourceBinding[];
}

export interface LibrarySourceLoadResult {
    state: 'created' | 'loaded';
    sourceCount: number;
    directorySourceCount: number;
    fileSourceCount: number;
}

export interface RemovedLibrarySource {
    source: LibrarySource;
    removedBindings: PlaylistSourceBinding[];
}

const CURRENT_VERSION = 1;

export class LibrarySourceManager {
    private readonly sourceFilePath: string;
    private data: LibrarySourceData = {
        version: CURRENT_VERSION,
        sources: [],
        playlistBindings: []
    };
    private loaded = false;
    private loadPromise: Promise<LibrarySourceLoadResult> | null = null;
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(sourceFilePath?: string) {
        if (sourceFilePath) {
            this.sourceFilePath = sourceFilePath;
            return;
        }

        this.sourceFilePath = path.join(app.getPath('userData'), 'music-library-sources.json');
    }

    async load(): Promise<LibrarySourceLoadResult> {
        if (this.loaded) return this.createLoadResult('loaded');
        if (this.loadPromise) return this.loadPromise;
        this.loadPromise = this.loadInternal();
        try {
            return await this.loadPromise;
        } finally {
            this.loadPromise = null;
        }
    }

    private async loadInternal(): Promise<LibrarySourceLoadResult> {
        try {
            const raw = await fs.promises.readFile(this.sourceFilePath, 'utf8');
            this.data = this.validateData(JSON.parse(raw));
            this.loaded = true;
            return this.createLoadResult('loaded');
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw new Error(`加载音乐库来源失败: ${error.message}`);
            }
        }

        this.data = {version: CURRENT_VERSION, sources: [], playlistBindings: []};
        await this.persist(JSON.stringify(this.data, null, 2));
        this.loaded = true;
        return this.createLoadResult('created');
    }

    async ensureSource(
        type: LibrarySourceType,
        sourcePath: string,
        origin: LibrarySourceOrigin
    ): Promise<{source: LibrarySource; created: boolean}> {
        this.assertLoaded();
        const id = this.createSourceId(type, sourcePath);
        const existing = this.data.sources.find(source => source.id === id);
        if (existing) return {source: this.cloneSource(existing), created: false};

        const source = this.createSource(type, sourcePath, origin, Date.now());
        this.data.sources.push(source);
        await this.save();
        return {source: this.cloneSource(source), created: true};
    }

    async updateSourceScan(
        sourceId: string,
        knownFiles: LibrarySourceKnownFile[],
        fullScan: boolean
    ): Promise<LibrarySource> {
        this.assertLoaded();
        const source = this.data.sources.find(item => item.id === sourceId);
        if (!source) throw new Error('音乐库来源不存在');

        const normalizedFiles = this.mergeKnownFiles(
            fullScan ? [] : source.knownFiles,
            knownFiles
        );
        source.knownFiles = normalizedFiles;
        source.lastScanAt = Date.now();
        await this.save();
        return this.cloneSource(source);
    }

    async save(): Promise<void> {
        this.assertLoaded();
        const contents = JSON.stringify(this.data, null, 2);
        const operation = this.saveQueue.then(() => this.persist(contents));
        this.saveQueue = operation.catch(() => undefined);
        return operation;
    }

    private async persist(contents: string): Promise<void> {
        const temporaryPath = `${this.sourceFilePath}.tmp`;
        try {
            await fs.promises.mkdir(path.dirname(this.sourceFilePath), {recursive: true});
            await fs.promises.writeFile(temporaryPath, contents, 'utf8');
            try {
                await fs.promises.copyFile(this.sourceFilePath, `${this.sourceFilePath}.bak`);
            } catch (error: any) {
                if (error.code !== 'ENOENT') throw error;
            }
            await fs.promises.rename(temporaryPath, this.sourceFilePath);
        } catch (error) {
            await fs.promises.unlink(temporaryPath).catch(() => undefined);
            console.error('❌ LibrarySourceManager: 保存音乐库来源失败:', error);
            throw error;
        }
    }

    getSources(): LibrarySource[] {
        return this.data.sources.map(source => this.cloneSource(source));
    }

    getPlaylistBindings(): PlaylistSourceBinding[] {
        return this.data.playlistBindings.map(binding => ({
            ...binding,
            managedFiles: binding.managedFiles.map(file => ({...file})),
            excludedPaths: [...binding.excludedPaths]
        }));
    }

    getSource(sourceId: string): LibrarySource | undefined {
        const source = this.data.sources.find(item => item.id === sourceId);
        return source ? this.cloneSource(source) : undefined;
    }

    getPlaylistBinding(bindingId: string): PlaylistSourceBinding | undefined {
        const binding = this.data.playlistBindings.find(item => item.id === bindingId);
        return binding ? this.cloneBinding(binding) : undefined;
    }

    async createPlaylistBinding(
        playlistId: string,
        sourceId: string
    ): Promise<{binding: PlaylistSourceBinding; created: boolean}> {
        this.assertLoaded();
        const source = this.data.sources.find(item => item.id === sourceId);
        if (!source || source.type !== 'directory') throw new Error('只能绑定音乐文件夹来源');

        const id = crypto.createHash('sha256').update(`${playlistId}:${sourceId}`).digest('hex');
        const existing = this.data.playlistBindings.find(binding => binding.id === id);
        if (existing) return {binding: this.cloneBinding(existing), created: false};

        const binding: PlaylistSourceBinding = {
            id,
            playlistId,
            sourceId,
            managedFiles: [],
            excludedPaths: [],
            createdAt: Date.now()
        };
        this.data.playlistBindings.push(binding);
        await this.save();
        return {binding: this.cloneBinding(binding), created: true};
    }

    async synchronizeSourceBindings(sourceId: string): Promise<PlaylistSourceBinding[]> {
        this.assertLoaded();
        const source = this.data.sources.find(item => item.id === sourceId);
        if (!source) throw new Error('音乐库来源不存在');

        const bindings = this.data.playlistBindings.filter(binding => binding.sourceId === sourceId);
        const now = Date.now();
        for (const binding of bindings) {
            binding.managedFiles = source.knownFiles.map(file => ({...file}));
            binding.lastSyncAt = now;
        }
        if (bindings.length > 0) await this.save();
        return bindings.map(binding => this.cloneBinding(binding));
    }

    async excludePlaylistFiles(playlistId: string, filePaths: string[]): Promise<number> {
        this.assertLoaded();
        const canonicalPaths = new Set(filePaths.map(filePath => this.canonicalize(filePath)));
        let changed = 0;

        for (const binding of this.data.playlistBindings.filter(item => item.playlistId === playlistId)) {
            const managedPaths = new Set(binding.managedFiles.map(file => file.canonicalPath));
            const exclusions = new Set(binding.excludedPaths);
            for (const canonicalPath of canonicalPaths) {
                if (managedPaths.has(canonicalPath) && !exclusions.has(canonicalPath)) {
                    exclusions.add(canonicalPath);
                    changed++;
                }
            }
            binding.excludedPaths = Array.from(exclusions);
        }
        if (changed > 0) await this.save();
        return changed;
    }

    async restorePlaylistBindingExclusions(bindingId: string): Promise<number> {
        this.assertLoaded();
        const binding = this.data.playlistBindings.find(item => item.id === bindingId);
        if (!binding) throw new Error('歌单文件夹绑定不存在');
        const restoredCount = binding.excludedPaths.length;
        binding.excludedPaths = [];
        if (restoredCount > 0) await this.save();
        return restoredCount;
    }

    async removePlaylistBinding(bindingId: string): Promise<PlaylistSourceBinding> {
        this.assertLoaded();
        const index = this.data.playlistBindings.findIndex(item => item.id === bindingId);
        if (index === -1) throw new Error('歌单文件夹绑定不存在');
        const [binding] = this.data.playlistBindings.splice(index, 1);
        await this.save();
        return this.cloneBinding(binding);
    }

    async removePlaylistBindings(playlistId: string): Promise<number> {
        this.assertLoaded();
        const before = this.data.playlistBindings.length;
        this.data.playlistBindings = this.data.playlistBindings.filter(
            binding => binding.playlistId !== playlistId
        );
        const removedCount = before - this.data.playlistBindings.length;
        if (removedCount > 0) await this.save();
        return removedCount;
    }

    async removeOrphanedPlaylistBindings(validPlaylistIds: Iterable<string>): Promise<PlaylistSourceBinding[]> {
        this.assertLoaded();
        const validIds = new Set(validPlaylistIds);
        const removedBindings = this.data.playlistBindings.filter(
            binding => !validIds.has(binding.playlistId)
        );
        if (removedBindings.length === 0) return [];

        this.data.playlistBindings = this.data.playlistBindings.filter(
            binding => validIds.has(binding.playlistId)
        );
        await this.save();
        return removedBindings.map(binding => this.cloneBinding(binding));
    }

    async removeSource(sourceId: string): Promise<RemovedLibrarySource> {
        this.assertLoaded();
        const index = this.data.sources.findIndex(item => item.id === sourceId);
        if (index === -1) throw new Error('音乐库来源不存在');
        const [source] = this.data.sources.splice(index, 1);
        const removedBindings = this.data.playlistBindings.filter(binding => binding.sourceId === sourceId);
        this.data.playlistBindings = this.data.playlistBindings.filter(binding => binding.sourceId !== sourceId);
        await this.save();
        return {
            source: this.cloneSource(source),
            removedBindings: removedBindings.map(binding => this.cloneBinding(binding))
        };
    }

    isFileCoveredByOtherSource(filePath: string, excludedSourceId: string): boolean {
        this.assertLoaded();
        const canonicalPath = this.canonicalize(filePath);
        return this.data.sources.some(source => (
            source.id !== excludedSourceId
            && (
                source.knownFiles.some(file => file.canonicalPath === canonicalPath)
                || (source.type === 'file' && source.canonicalPath === canonicalPath)
                || (source.type === 'directory' && this.containsPath(source.path, filePath))
            )
        ));
    }

    canonicalize(sourcePath: string): string {
        if (sourcePath.startsWith('network://')) {
            const normalized = sourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
            const separatorIndex = normalized.indexOf('/', 'network://'.length);
            if (separatorIndex === -1) return normalized.toLowerCase();
            return normalized.slice(0, separatorIndex).toLowerCase() + normalized.slice(separatorIndex);
        }

        const normalized = path.normalize(path.resolve(sourcePath));
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    createSourceId(type: LibrarySourceType, sourcePath: string): string {
        return crypto
            .createHash('sha256')
            .update(`${type}:${this.canonicalize(sourcePath)}`)
            .digest('hex');
    }

    private createSource(
        type: LibrarySourceType,
        sourcePath: string,
        origin: LibrarySourceOrigin,
        createdAt: number
    ): LibrarySource {
        return {
            id: this.createSourceId(type, sourcePath),
            type,
            path: sourcePath,
            canonicalPath: this.canonicalize(sourcePath),
            origin,
            knownFiles: [],
            createdAt
        };
    }

    private containsPath(directoryPath: string, filePath: string): boolean {
        const canonicalDirectory = this.canonicalize(directoryPath);
        const canonicalFile = this.canonicalize(filePath);

        if (canonicalDirectory.startsWith('network://')) {
            return canonicalFile === canonicalDirectory || canonicalFile.startsWith(`${canonicalDirectory}/`);
        }

        const relativePath = path.relative(canonicalDirectory, canonicalFile);
        return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
    }

    private validateData(data: any): LibrarySourceData {
        if (data?.version !== CURRENT_VERSION) {
            throw new Error(nativeT('errors:unsupportedSourceVersion', {version: String(data?.version)}));
        }
        if (!Array.isArray(data.sources) || !Array.isArray(data.playlistBindings)) {
            throw new Error(nativeT('errors:invalidSourceData'));
        }
        const sourceIds = new Set<string>();
        const sources = data.sources.map((source: any): LibrarySource => {
            if (!source || typeof source.id !== 'string' || !source.id || sourceIds.has(source.id)
                || !['directory', 'file'].includes(source.type) || typeof source.path !== 'string' || !source.path) {
                throw new Error(nativeT('errors:invalidSourceRecord'));
            }
            sourceIds.add(source.id);
            return {
                ...source,
                origin: typeof source.origin === 'string' ? source.origin : 'unknown',
                createdAt: Number.isFinite(source.createdAt) ? source.createdAt : 0,
                canonicalPath: this.canonicalize(source.path),
                knownFiles: this.validateKnownFiles(source.knownFiles)
            };
        });
        const bindingIds = new Set<string>();
        const playlistBindings = data.playlistBindings.map((binding: any): PlaylistSourceBinding => {
            if (!binding || typeof binding.id !== 'string' || !binding.id || bindingIds.has(binding.id)
                || typeof binding.playlistId !== 'string' || !binding.playlistId || !sourceIds.has(binding.sourceId)
                || !Array.isArray(binding.excludedPaths)
                || !binding.excludedPaths.every((value: unknown) => typeof value === 'string')) {
                throw new Error(nativeT('errors:invalidSourceBinding'));
            }
            bindingIds.add(binding.id);
            return {...binding, createdAt: Number.isFinite(binding.createdAt) ? binding.createdAt : 0, managedFiles: this.validateKnownFiles(binding.managedFiles), excludedPaths: [...binding.excludedPaths]};
        });
        return {version: CURRENT_VERSION, sources, playlistBindings};
    }

    private validateKnownFiles(files: any): LibrarySourceKnownFile[] {
        if (!Array.isArray(files)) throw new Error(nativeT('errors:invalidSourceFiles'));
        return files.map((file: any) => {
            if (!file || typeof file.path !== 'string' || !file.path
                || (file.trackId !== undefined && typeof file.trackId !== 'string')) {
                throw new Error(nativeT('errors:invalidSourceFile'));
            }
            return {path: file.path, canonicalPath: this.canonicalize(file.path), trackId: file.trackId};
        });
    }

    private mergeKnownFiles(
        existingFiles: LibrarySourceKnownFile[],
        newFiles: LibrarySourceKnownFile[]
    ): LibrarySourceKnownFile[] {
        const filesByPath = new Map<string, LibrarySourceKnownFile>();
        for (const file of [...existingFiles, ...newFiles]) {
            if (!file?.path) continue;
            const canonicalPath = this.canonicalize(file.path);
            filesByPath.set(canonicalPath, {
                path: file.path,
                canonicalPath,
                trackId: file.trackId
            });
        }
        return Array.from(filesByPath.values());
    }

    private cloneSource(source: LibrarySource): LibrarySource {
        return {
            ...source,
            knownFiles: source.knownFiles.map(file => ({...file}))
        };
    }

    private cloneBinding(binding: PlaylistSourceBinding): PlaylistSourceBinding {
        return {
            ...binding,
            managedFiles: binding.managedFiles.map(file => ({...file})),
            excludedPaths: [...binding.excludedPaths]
        };
    }

    private assertLoaded(): void {
        if (!this.loaded) throw new Error('音乐库来源尚未加载');
    }

    private createLoadResult(state: 'created' | 'loaded'): LibrarySourceLoadResult {
        return {
            state,
            sourceCount: this.data.sources.length,
            directorySourceCount: this.data.sources.filter(source => source.type === 'directory').length,
            fileSourceCount: this.data.sources.filter(source => source.type === 'file').length
        };
    }
}
