import {th, t, bindLocalizedText, setLocalizedText} from '@/shared/i18n';

import type {Track} from '@api/types/track';
import {lyricsGateway} from '@/infrastructure/electron';
import {getLyricsService, lyricsProviderRegistry, lyricsSearchService} from '../service/defaultLyricsServices';
import {toTrackLyricsQuery, type EmbeddedLyricsPreview} from '../service/LyricsService';
import type {LyricsCandidate, LyricsCandidatePreview, LyricsDocument, TrackLyricsQuery} from '../domain/types';
import {describeLyricsCandidatePreview, describeLyricsDocument} from '../domain/describeLyricsCandidatePreview';
import type {ProviderSearchResult} from '../service/LyricsSearchService';
import {TtmlDocumentService} from '../format/TtmlDocumentService';

type PickerTab = 'current' | 'embedded' | 'local' | string;

export interface LyricsDocumentAppliedDetail {
    trackId: string;
    document: LyricsDocument;
}

export class LyricsSourcePicker {
    private readonly root: HTMLElement;
    private readonly tabs: HTMLElement;
    private readonly content: HTMLElement;
    private readonly preview: HTMLElement;
    private readonly status: HTMLElement;
    private readonly ttmlService = new TtmlDocumentService();
    private track: Track | null = null;
    private query: TrackLyricsQuery | null = null;
    private activeTab: PickerTab = 'current';
    private searchController: AbortController | null = null;
    private inspectionController: AbortController | null = null;
    private readonly searchResults = new Map<string, ProviderSearchResult>();
    private readonly previewCache = new Map<string, LyricsCandidatePreview>();
    private readonly previewRequests = new Map<string, Promise<LyricsCandidatePreview>>();
    private selectedCandidate: LyricsCandidate | null = null;
    private selectedPreview: LyricsCandidatePreview | null = null;
    private localPreview: LyricsCandidatePreview | null | undefined;
    private embeddedPreviews: EmbeddedLyricsPreview[] | undefined;
    private embeddedRequest = 0;

    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'lyrics-source-picker';
        this.root.hidden = true;
        this.root.innerHTML = `
            <div class="lyrics-source-picker__backdrop" data-action="close"></div>
            <section class="lyrics-source-picker__dialog" role="dialog" aria-modal="true" aria-label="${th('messages:chooseLyrics')}" data-i18n-aria-label="messages:chooseLyrics">
                <header class="lyrics-source-picker__header">
                    <div><h2 data-i18n="messages:chooseLyrics">${th('messages:chooseLyrics')}</h2><p class="lyrics-source-picker__track"></p></div>
                    <button type="button" data-action="close" aria-label="${th('app:close')}" data-i18n-aria-label="app:close">×</button>
                </header>
                <nav class="lyrics-source-picker__tabs" aria-label="${th('audit:lyricsSources')}" data-i18n-aria-label="audit:lyricsSources"></nav>
                <div class="lyrics-source-picker__body">
                    <div class="lyrics-source-picker__results"></div>
                    <aside class="lyrics-source-picker__preview"><p data-i18n="messages:selectACandidateToPreview">${th('messages:selectACandidateToPreview')}</p></aside>
                </div>
                <footer class="lyrics-source-picker__footer">
                    <span class="lyrics-source-picker__status"></span>
                    <div>
                        <button type="button" data-action="auto" data-i18n="messages:matchAutomaticallyAgain">${th('messages:matchAutomaticallyAgain')}</button>
                        <button type="button" data-action="clear" data-i18n="messages:clearManualBinding">${th('messages:clearManualBinding')}</button>
                        <button type="button" data-action="refresh" data-i18n="messages:refreshCurrentSource">${th('messages:refreshCurrentSource')}</button>
                        <button type="button" class="primary" data-action="apply" disabled data-i18n="messages:useTheseLyrics">${th('messages:useTheseLyrics')}</button>
                    </div>
                </footer>
            </section>`;
        document.body.appendChild(this.root);
        this.tabs = this.requireElement('.lyrics-source-picker__tabs');
        this.content = this.requireElement('.lyrics-source-picker__results');
        this.preview = this.requireElement('.lyrics-source-picker__preview');
        this.status = this.requireElement('.lyrics-source-picker__status');
        this.root.addEventListener('click', event => {
            const query = this.query;
            void this.handleClick(event).catch(error => {
                if (this.query === query) this.setStatus(error instanceof Error ? error.message : String(error));
            });
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.root.hidden) this.close();
        });
    }

    async open(track: Track): Promise<void> {
        this.closeRequests();
        this.track = track;
        this.query = toTrackLyricsQuery(track);
        this.activeTab = 'current';
        this.selectedCandidate = null;
        this.selectedPreview = null;
        this.localPreview = undefined;
        this.embeddedPreviews = undefined;
        this.embeddedRequest++;
        this.searchResults.clear();
        this.previewCache.clear();
        this.previewRequests.clear();
        this.preview.innerHTML = `<p data-i18n="messages:selectACandidateToPreview">${th('messages:selectACandidateToPreview')}</p>`;
        this.setStatus('');
        this.getActionButton('apply').disabled = true;
        this.inspectionController = new AbortController();
        this.root.hidden = false;
        this.requireElement('.lyrics-source-picker__track').textContent = `${track.title} · ${track.artist}`;
        this.renderTabs();
        const query = this.query;
        await this.renderCurrent();
        if (this.query === query) this.startProviderSearches();
    }

    close(): void {
        this.closeRequests();
        this.root.hidden = true;
        this.selectedCandidate = null;
        this.selectedPreview = null;
        this.embeddedRequest++;
        this.track = null;
        this.query = null;
    }

    destroy(): void {
        this.close();
        this.root.remove();
    }

    private startProviderSearches(): void {
        if (!this.query) return;
        this.searchController = new AbortController();
        const controller = this.searchController;
        for (const provider of lyricsProviderRegistry.list()) {
            this.searchResults.set(provider.id, {
                providerId: provider.id,
                displayName: provider.displayName,
                state: 'loading',
                candidates: []
            });
            void lyricsSearchService.searchProvider(provider.id, this.query, this.searchController.signal)
                .then(result => {
                    if (controller.signal.aborted) return;
                    this.searchResults.set(provider.id, result);
                    if (this.activeTab === provider.id) this.renderActiveTab();
                })
                .catch(() => undefined);
        }
    }

    private renderTabs(): void {
        const tabs = [
            {id: 'current', label: () => t('messages:current')},
            {id: 'embedded', label: () => t('messages:embedded')},
            {id: 'local', label: () => t('messages:local')},
            ...lyricsProviderRegistry.list().map(provider => ({id: provider.id, label: () => provider.displayName}))
        ];
        this.tabs.replaceChildren(...tabs.map(tab => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.tab = tab.id;
            bindLocalizedText(button, tab.label);
            button.classList.toggle('active', tab.id === this.activeTab);
            return button;
        }));
    }

    private async renderCurrent(): Promise<void> {
        const query = this.query;
        if (!query) return;
        this.activeTab = 'current';
        this.renderTabs();
        this.content.innerHTML = `<div class="lyrics-source-picker__loading" data-i18n="messages:readingCurrentBinding">${th('messages:readingCurrentBinding')}</div>`;
        const result = await lyricsGateway.readCanonical(query.trackId);
        if (this.query !== query || this.activeTab !== 'current') return;
        if (!result.success || !result.binding) {
            this.content.innerHTML = `<div class="lyrics-source-picker__empty" data-i18n="messages:noLyricsBinding">${th('messages:noLyricsBinding')}</div>`;
            return;
        }
        const binding = result.binding;
        const source = binding.source;
        const description = () => source.kind === 'provider'
            ? `${source.providerId} · ${binding.selectionMode === 'manual' ? t('messages:manualSelection') : t('messages:automaticMatch')}`
            : source.kind === 'local' ? t('dynamic:localLyricsSource', {path: source.path}) : t('dynamic:embeddedLyricsSource', {candidate: source.candidateId ?? t('messages:unsupportedBinding')});
        this.content.innerHTML = `<article class="lyrics-candidate current"><strong><span data-i18n="messages:currentlyUsed">${th('messages:currentlyUsed')}</span></strong><p></p><div class="lyrics-candidate__badges"></div></article>`;
        const paragraph = this.content.querySelector('p');
        if (paragraph) bindLocalizedText(paragraph, description);
        let document: LyricsDocument | null = null;
        if (result.ttml) {
            try {
                const ttml = this.ttmlService.parse(result.ttml);
                document = {
                    ttmlText: result.ttml,
                    ttml,
                    render: this.ttmlService.project(ttml),
                    source
                };
            } catch (error) {
                console.warn('⚠️ Lyrics: 当前绑定 TTML 徽章解析失败', error);
            }
        }
        this.renderBadgeLabels(this.content.querySelector('article')!, () => [
            t('messages:bound'), ...(document ? ['TTML', ...describeLyricsDocument(document)] : [])
        ]);
    }

    private renderActiveTab(): void {
        this.renderTabs();
        this.setStatus('');
        if (this.activeTab === 'current') {
            void this.renderCurrent();
            return;
        }
        if (this.activeTab === 'local') {
            void this.renderLocal();
            return;
        }
        if (this.activeTab === 'embedded') {
            void this.renderEmbedded();
            return;
        }

        const result = this.searchResults.get(this.activeTab);
        if (!result || result.state === 'loading') {
            this.content.innerHTML = `<div class="lyrics-source-picker__loading" data-i18n="messages:searching">${th('messages:searching')}</div>`;
            return;
        }
        if (result.state === 'error') {
            this.content.innerHTML = `<div class="lyrics-source-picker__empty"><p></p><button type="button" data-action="retry" data-i18n="messages:retry">${th('messages:retry')}</button></div>`;
            const paragraph = this.content.querySelector('p');
            if (paragraph) bindLocalizedText(paragraph, () => result.error ?? t('messages:searchFailed'), 'textContent');
            return;
        }
        if (result.candidates.length === 0) {
            this.content.innerHTML = `<div class="lyrics-source-picker__empty" data-i18n="messages:noLyricsCandidatesFound">${th('messages:noLyricsCandidatesFound')}</div>`;
            return;
        }
        this.content.replaceChildren(...result.candidates.map(candidate => this.createCandidateRow(candidate)));
        void this.inspectCandidates(result.providerId, result.candidates);
    }

    private createCandidateRow(candidate: LyricsCandidate): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'lyrics-candidate';
        row.dataset.candidateId = candidate.candidateId;
        const duration = candidate.durationMs ? formatDuration(candidate.durationMs) : '--:--';
        row.innerHTML = `<strong></strong><p></p><div class="lyrics-candidate__badges"></div><span class="lyrics-candidate__score"></span>`;
        row.querySelector('strong')!.textContent = candidate.title;
        bindLocalizedText(row.querySelector('p')!, () => `${candidate.artists.join(' / ') || t('app:unknownArtist')} · ${candidate.album || t('messages:unknownAlbum')} · ${duration}`, 'textContent');
        setLocalizedText(row.querySelector('.lyrics-candidate__score')!, 'dynamic:matchScore', {score: candidate.identityScore}, 'textContent');
        const preview = this.previewCache.get(candidateKey(candidate));
        if (preview) this.renderCandidateBadges(row, preview);
        return row;
    }

    private async renderLocal(): Promise<void> {
        const query = this.query;
        if (!query) return;
        if (this.localPreview === undefined) {
            this.content.innerHTML = `<div class="lyrics-source-picker__loading" data-i18n="messages:findingLocalLyrics">${th('messages:findingLocalLyrics')}</div>`;
            const preview = await getLyricsService().previewLocal(query);
            if (this.query !== query) return;
            this.localPreview = preview;
        }
        if (this.query !== query || this.activeTab !== 'local') return;
        if (!this.localPreview) {
            this.content.innerHTML = `<div class="lyrics-source-picker__empty" data-i18n="messages:noMatchingLocalLyrics">${th('messages:noMatchingLocalLyrics')}</div>`;
            return;
        }

        const source = this.localPreview.document.source;
        if (source.kind !== 'local') return;
        const row = this.createSourceRow('local', source.path.split(/[\\/]/).pop() || source.path, source.path);
        this.renderCandidateBadges(row, this.localPreview);
        this.content.replaceChildren(row);
    }

    private async renderEmbedded(): Promise<void> {
        const query = this.query;
        if (!query) return;
        const request = ++this.embeddedRequest;
        this.content.innerHTML = `<div class="lyrics-source-picker__loading" data-i18n="messages:readingEmbeddedLyrics">${th('messages:readingEmbeddedLyrics')}</div>`;
        try {
            const results = this.embeddedPreviews ?? await getLyricsService().listEmbedded(query);
            if (this.query !== query || this.activeTab !== 'embedded' || request !== this.embeddedRequest) return;
            this.embeddedPreviews = results;
            if (!results.length) {
                this.content.innerHTML = `<div class="lyrics-source-picker__empty" data-i18n="messages:noEmbeddedLyricsInThisAudioFile">${th('messages:noEmbeddedLyricsInThisAudioFile')}</div>`;
                return;
            }
            this.content.replaceChildren(...results.map(item => {
                const row = this.createSourceRow('embedded', item.title, item.candidateId);
                row.dataset.embeddedId = item.candidateId;
                if (item.preview) {
                    this.renderCandidateBadges(row, item.preview);
                    const score = getLyricsService().scoreEmbedded(item);
                    const label = documentNode('span', '');
                    bindLocalizedText(label, () => t('messages:match100Quality') + score.qualityScore);
                    label.className = 'lyrics-candidate__score';
                    row.appendChild(label);
                } else {
                    this.renderBadgeLabels(row, () => [item.error ? t('messages:invalidOrUnsupported') : t('messages:notChecked')]);
                    row.title = item.error ?? '';
                    (row as HTMLButtonElement).disabled = true;
                }
                return row;
            }));
        } catch (error) {
            if (this.query === query && request === this.embeddedRequest) this.content.textContent = String(error);
        }
    }

    private createSourceRow(kind: 'local' | 'embedded', title: string, description: string): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'lyrics-candidate';
        row.dataset.sourceKind = kind;
        row.innerHTML = '<strong></strong><p></p><div class="lyrics-candidate__badges"></div>';
        row.querySelector('strong')!.textContent = title;
        row.querySelector('p')!.textContent = description;
        return row;
    }

    private async inspectCandidates(providerId: string, candidates: LyricsCandidate[]): Promise<void> {
        const query = this.query;
        const controller = this.inspectionController;
        if (!query || !controller || controller.signal.aborted) return;
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < candidates.length && !controller.signal.aborted) {
                const candidate = candidates[nextIndex++];
                try {
                    const preview = await this.resolveCandidate(query, candidate, controller.signal);
                    if (this.activeTab === providerId) this.updateCandidateBadges(candidate, preview);
                } catch (error) {
                    if (!controller.signal.aborted && this.activeTab === providerId) {
                        this.updateCandidateError(candidate, error);
                    }
                }
            }
        };
        await Promise.all(Array.from({length: Math.min(3, candidates.length)}, worker));
    }

    private resolveCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsCandidatePreview> {
        const key = candidateKey(candidate);
        const cached = this.previewCache.get(key);
        if (cached) return Promise.resolve(cached);
        const pending = this.previewRequests.get(key);
        if (pending) return pending;
        const request = getLyricsService().previewCandidate(query, candidate, signal)
            .then(preview => {
                if (signal.aborted) throw signal.reason;
                this.previewCache.set(key, preview);
                return preview;
            })
            .finally(() => {
                if (this.previewRequests.get(key) === request) this.previewRequests.delete(key);
            });
        this.previewRequests.set(key, request);
        return request;
    }

    private updateCandidateBadges(candidate: LyricsCandidate, preview: LyricsCandidatePreview): void {
        const row = this.findCandidateRow(candidate);
        if (row) this.renderCandidateBadges(row, preview);
    }

    private renderCandidateBadges(row: HTMLElement, preview: LyricsCandidatePreview): void {
        this.renderBadgeLabels(row, () => describeLyricsCandidatePreview(preview));
    }

    private renderBadgeLabels(row: HTMLElement, getLabels: () => string[]): void {
        const badges = row.querySelector('.lyrics-candidate__badges');
        if (!badges) return;
        badges.replaceChildren(...getLabels().map((_label, index) => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            bindLocalizedText(badge, () => getLabels()[index] || '');
            return badge;
        }));
    }

    private updateCandidateError(candidate: LyricsCandidate, error: unknown): void {
        const row = this.findCandidateRow(candidate);
        const badges = row?.querySelector('.lyrics-candidate__badges');
        if (!badges) return;
        const badge = document.createElement('span');
        badge.className = 'badge error';
        setLocalizedText(badge, 'messages:couldNotParse', {}, 'textContent');
        badge.title = error instanceof Error ? error.message : String(error);
        badges.replaceChildren(badge);
    }

    private findCandidateRow(candidate: LyricsCandidate): HTMLElement | undefined {
        return Array.from(this.content.querySelectorAll<HTMLElement>('[data-candidate-id]'))
            .find(row => row.dataset.candidateId === candidate.candidateId);
    }

    private async selectCandidate(candidateId: string): Promise<void> {
        const result = this.searchResults.get(this.activeTab);
        const candidate = result?.candidates.find(item => item.candidateId === candidateId);
        if (!candidate || !this.query) return;
        this.selectedCandidate = candidate;
        this.selectedPreview = null;
        this.content.querySelectorAll('.lyrics-candidate').forEach(row => {
            row.classList.toggle('selected', (row as HTMLElement).dataset.candidateId === candidateId);
        });
        this.getActionButton('apply').disabled = true;
        this.preview.innerHTML = `<p data-i18n="messages:loadingPreview">${th('messages:loadingPreview')}</p>`;

        const cacheKey = `${candidate.providerId}:${candidate.candidateId}`;
        let resolved = this.previewCache.get(cacheKey);
        if (!resolved) {
            const controller = this.inspectionController;
            if (!controller) return;
            try {
                resolved = await this.resolveCandidate(this.query, candidate, controller.signal);
                this.updateCandidateBadges(candidate, resolved);
            } catch (error) {
                if (!controller.signal.aborted && this.selectedCandidate === candidate) this.preview.textContent = error instanceof Error ? error.message : String(error);
                return;
            }
        }
        if (this.selectedCandidate !== candidate) return;
        this.renderDocumentPreview(resolved.document);
        this.getActionButton('apply').disabled = false;
    }

    private selectSourcePreview(kind: 'local' | 'embedded', candidateId?: string): void {
        const preview = kind === 'local' ? this.localPreview : this.embeddedPreviews?.find(item => item.candidateId === candidateId)?.preview;
        if (!preview) return;
        this.selectedCandidate = null;
        this.selectedPreview = preview;
        this.content.querySelectorAll('.lyrics-candidate').forEach(row => {
            row.classList.toggle('selected', (row as HTMLElement).dataset.sourceKind === kind && (kind === 'local' || (row as HTMLElement).dataset.embeddedId === candidateId));
        });
        this.renderDocumentPreview(preview.document);
        this.getActionButton('apply').disabled = false;
    }

    private renderDocumentPreview(document: LyricsDocument): void {
        this.preview.replaceChildren(...document.render.lines.slice(0, 6).map(line => {
            const block = documentNode('div', line.words.map(word => word.word).join(''));
            if (line.translatedLyric) block.appendChild(documentNode('small', line.translatedLyric));
            if (line.romanLyric) block.appendChild(documentNode('small', line.romanLyric));
            return block;
        }));
    }

    private async applySelected(): Promise<void> {
        if (!this.query || (!this.selectedCandidate && !this.selectedPreview)) return;
        const query = this.query;
        this.getActionButton('apply').disabled = true;
        this.setStatus(t('messages:applyingLyrics'));
        try {
            const preview = this.selectedPreview
                ?? (this.selectedCandidate ? this.previewCache.get(candidateKey(this.selectedCandidate)) : undefined);
            if (!preview) throw new Error(t('audit:previewExpired'));
            const result = await getLyricsService().applyPreview(this.query, preview);
            if (this.query !== query) return;
            if (!result.document || !result.binding) throw new Error(result.error ?? t('audit:applyLyricsFailed'));
            window.dispatchEvent(new CustomEvent<LyricsDocumentAppliedDetail>('lyrics:document-applied', {
                detail: {trackId: query.trackId, document: result.document}
            }));
            this.setStatus(t('messages:lyricsApplied'));
            await this.renderCurrent();
        } catch (error) {
            if (this.query !== query) return;
            this.setStatus(error instanceof Error ? error.message : String(error));
            this.getActionButton('apply').disabled = false;
        }
    }

    private async rerunAutomaticMatch(): Promise<void> {
        if (!this.track || !this.query) return;
        const query = this.query;
        const track = this.track;
        this.setStatus(t('messages:matchingAgain'));
        await getLyricsService().clearBinding(track);
        if (this.query !== query) return;
        const controller = this.inspectionController ?? new AbortController();
        const result = await getLyricsService().load(track, controller.signal);
        if (this.query !== query) return;
        if (result.document && result.binding) {
            window.dispatchEvent(new CustomEvent<LyricsDocumentAppliedDetail>('lyrics:document-applied', {
                detail: {trackId: query.trackId, document: result.document}
            }));
            this.setStatus(t('messages:automaticMatchingComplete'));
            await this.renderCurrent();
        } else {
            this.setStatus(result.error ?? t('messages:noLyricsFound'));
        }
    }

    private async clearBinding(): Promise<void> {
        if (!this.track) return;
        const query = this.query;
        await getLyricsService().clearBinding(this.track);
        if (this.query !== query) return;
        this.setStatus(t('messages:bindingClearedExternalLyricsFilesWereKept'));
        await this.renderCurrent();
    }

    private retryActiveProvider(): void {
        if (!this.query || ['current', 'local', 'embedded'].includes(this.activeTab)) return;
        const provider = lyricsProviderRegistry.get(this.activeTab);
        if (!provider) return;
        this.resetCandidateInspections();
        this.selectedCandidate = null;
        this.getActionButton('apply').disabled = true;
        this.preview.innerHTML = `<p data-i18n="messages:selectACandidateToPreview">${th('messages:selectACandidateToPreview')}</p>`;
        const controller = this.searchController ?? new AbortController();
        this.searchController = controller;
        this.searchResults.set(provider.id, {providerId: provider.id, displayName: provider.displayName, state: 'loading', candidates: []});
        this.renderActiveTab();
        void lyricsSearchService.searchProvider(provider.id, this.query, controller.signal).then(result => {
            if (controller.signal.aborted) return;
            this.searchResults.set(provider.id, result);
            this.renderActiveTab();
        }).catch(() => undefined);
    }

    private async refreshCurrentSource(): Promise<void> {
        if (!this.query) return;
        const query = this.query;
        if (this.activeTab === 'local') {
            this.localPreview = undefined;
            this.selectedPreview = null;
            this.getActionButton('apply').disabled = true;
            await this.renderLocal();
            return;
        }
        if (this.activeTab === 'embedded') {
            this.embeddedPreviews = undefined;
            this.embeddedRequest++;
            this.selectedPreview = null;
            this.getActionButton('apply').disabled = true;
            await this.renderEmbedded();
            return;
        }
        if (this.activeTab !== 'current') {
            this.retryActiveProvider();
            return;
        }
        const result = await lyricsGateway.getBinding(query.trackId);
        if (this.query !== query) return;
        if (!result.success || !result.binding) throw new Error(result.error ?? t('messages:noLyricsBinding'));
        this.setStatus(t('messages:refreshingCurrentSource'));
        const controller = this.inspectionController ?? new AbortController();
        const refreshed = await getLyricsService().refreshBinding(query, result.binding, controller.signal);
        if (this.query !== query) return;
        if (!refreshed.document || !refreshed.binding) throw new Error(refreshed.error ?? t('audit:refreshLyricsFailed'));
        window.dispatchEvent(new CustomEvent<LyricsDocumentAppliedDetail>('lyrics:document-applied', {
            detail: {trackId: query.trackId, document: refreshed.document}
        }));
        this.setStatus(t('messages:currentSourceRefreshed'));
        await this.renderCurrent();
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target as HTMLElement;
        const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
        if (action === 'close') this.close();
        else if (action === 'apply') await this.applySelected();
        else if (action === 'auto') await this.rerunAutomaticMatch();
        else if (action === 'clear') await this.clearBinding();
        else if (action === 'refresh') await this.refreshCurrentSource();
        else if (action === 'retry') this.retryActiveProvider();

        const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab;
        if (tab) {
            this.activeTab = tab;
            this.selectedCandidate = null;
            this.selectedPreview = null;
            this.getActionButton('apply').disabled = true;
            this.preview.innerHTML = `<p data-i18n="messages:selectACandidateToPreview">${th('messages:selectACandidateToPreview')}</p>`;
            this.renderActiveTab();
        }
        const candidateId = target.closest<HTMLElement>('[data-candidate-id]')?.dataset.candidateId;
        if (candidateId) await this.selectCandidate(candidateId);
        const sourceKind = target.closest<HTMLElement>('[data-source-kind]')?.dataset.sourceKind;
        if (sourceKind === 'local' || sourceKind === 'embedded') this.selectSourcePreview(sourceKind, target.closest<HTMLElement>('[data-embedded-id]')?.dataset.embeddedId);
    }

    private getActionButton(action: string): HTMLButtonElement {
        return this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    }

    private setStatus(message: string): void {
        this.status.textContent = message;
    }

    private closeRequests(): void {
        this.searchController?.abort();
        this.inspectionController?.abort();
        this.searchController = null;
        this.inspectionController = null;
        this.previewRequests.clear();
    }

    private resetCandidateInspections(): void {
        this.inspectionController?.abort();
        this.inspectionController = new AbortController();
        this.previewCache.clear();
        this.previewRequests.clear();
    }

    private requireElement(selector: string): HTMLElement {
        const element = this.root.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`歌词选择器缺少元素: ${selector}`);
        return element;
    }
}

let picker: LyricsSourcePicker | null = null;

export function getLyricsSourcePicker(): LyricsSourcePicker {
    picker ??= new LyricsSourcePicker();
    return picker;
}

function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.round(milliseconds / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function documentNode(tagName: string, text: string): HTMLElement {
    const element = document.createElement(tagName);
    element.textContent = text;
    return element;
}

function candidateKey(candidate: LyricsCandidate): string {
    return `${candidate.providerId}:${candidate.candidateId}`;
}
