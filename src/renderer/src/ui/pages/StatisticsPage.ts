import {onLocaleChanged, htmlT, th, t} from '@/shared/i18n';

/**
 * 统计页组件
 */

import {Component} from "@ui/base/Component";
import {libraryPageDataService} from "@/features/library/service/LibraryPageDataService";
import {
    recentPlaybackHistoryService,
    type PlayStats,
    type RecentTrack
} from "@/features/playback/service/RecentPlaybackHistoryService";
import type {Track} from "@api/types/library";
const EMPTY_PLAY_STATS: PlayStats = {
    totalTracks: 0,
    totalDuration: 0,
    favoriteArtist: '',
    uniqueArtists: 0,
    uniqueAlbums: 0,
    totalPlayedSongs: 0,
    totalPlayedDuration: 0,
    mostPlayedTracks: []
};

class StatisticsPage extends Component {
    private container: Element | null;
    private tracks: Track[];
    private recentTracks: RecentTrack[];
    private playStats: PlayStats;
    private listenersSetup: boolean;
    private historyUnsubscribe: (() => void) | null;
    private isVisible: boolean;
    private viewGeneration = 0;
    private disposeLocale = onLocaleChanged(() => {
        if (!this.isVisible) return;
        const scroller = document.querySelector<HTMLElement>('.main-content');
        const scrollTop = scroller?.scrollTop || 0;
        this.calculatePlayStats();
        this.render();
        if (scroller) scroller.scrollTop = scrollTop;
    });

    constructor(container: string | Element | null) {
        super(container);
        this.container = this.element;
        this.tracks = [];
        this.recentTracks = [];
        this.playStats = {...EMPTY_PLAY_STATS};
        this.listenersSetup = false;
        this.historyUnsubscribe = null;
        this.isVisible = false;
    }

    async show(): Promise<void> {
        const viewGeneration = ++this.viewGeneration;
        if (!this.listenersSetup) {
            this.setupElements();
            this.setupAPIListeners();
            this.listenersSetup = true;
        }
        if (this.element) {
            (this.element as HTMLElement).style.display = 'block';
        }
        this.isVisible = true;
        const pageData = await libraryPageDataService.getStatisticsPageData();
        if (!this.isVisible || viewGeneration !== this.viewGeneration) return;
        this.tracks = pageData.tracks;
        this.loadPlayHistory();
        this.calculatePlayStats();
        this.render();
    }

    hide(): void {
        this.viewGeneration++;
        this.isVisible = false;
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    destroy(): void {
        this.disposeLocale();
        this.historyUnsubscribe?.();
        this.historyUnsubscribe = null;
        this.tracks.length = 0;
        this.recentTracks.length = 0;
        this.playStats = {...EMPTY_PLAY_STATS};
        this.listenersSetup = false;
        this.isVisible = false;
        super.destroy();
    }

    setupElements(): void {
        this.container = this.element;
    }

    setupAPIListeners(): void {
        // 监听音乐库更新
        this.addAPIEventListenerManaged('libraryUpdated', (tracks: Track[]) => {
            this.tracks = tracks || [];
            this.calculatePlayStats();
            if (this.isVisible) this.render();
        });

        this.historyUnsubscribe = recentPlaybackHistoryService.subscribe(() => {
            this.loadPlayHistory();
            this.calculatePlayStats();
            if (this.isVisible) {
                this.render();
            }
        });

    }

    loadPlayHistory(): void {
        this.recentTracks = recentPlaybackHistoryService.loadHistory(50);
    }

    calculatePlayStats(): void {
        this.playStats = recentPlaybackHistoryService.calculatePlayStats(this.tracks, this.recentTracks);
    }

    formatDuration(seconds: number): string {
        if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return t('dynamic:durationCompactMinutes', {minutes: minutes});
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            return t('dynamic:durationCompactHours', {hours: hours, minutes: remainingMinutes});
        }
    }

    formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return t('messages:today');
        if (days === 1) return t('messages:yesterday');
        if (days < 7) return t('dynamic:daysAgo', {count: days});
        if (days < 30) return t('dynamic:weeksAgo', {count: Math.floor(days / 7)});
        if (days < 365) return t('dynamic:monthsAgo', {count: Math.floor(days / 30)});
        return t('dynamic:yearsAgo', {count: Math.floor(days / 365)});
    }

    render(): void {
        if (!this.container) return;

        const mostPlayedTracks = this.playStats.mostPlayedTracks || [];

        this.container.innerHTML = `
            <div class="page-content statistics-page">
                <div class="page-header">
                    <h1 class="page-title">
                        <svg class="page-icon" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M16,11.78L20.24,4.45L21.97,5.45L16.74,14.5L10.23,10.75L5.46,19H22V21H2V3H4V17.54L9.5,8L16,11.78Z"/>
                        </svg><span data-i18n="messages:musicStatistics">${th('messages:musicStatistics')}</span></h1>
                    <p class="page-subtitle" data-i18n="messages:yourListeningStatisticsAndMemories">${th('messages:yourListeningStatisticsAndMemories')}</p>
                    <div class="statistics-header-actions">
                        <button
                            class="statistics-clear-button"
                            id="clear-play-statistics"
                            ${this.playStats.totalPlayedSongs === 0 ? 'disabled' : ''}
                         data-i18n="messages:clearPlayStatistics">${th('messages:clearPlayStatistics')}</button>
                    </div>
                </div>

                <div class="stats-overview">
                    <div class="stats-grid">
                        <div class="stat-card primary">
                            <div class="stat-icon">🎵</div>
                            <div class="stat-number">${this.playStats.totalTracks}</div>
                            <div class="stat-label" data-i18n="messages:totalTracks">${th('messages:totalTracks')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">👨‍🎤</div>
                            <div class="stat-number">${this.playStats.uniqueArtists}</div>
                            <div class="stat-label" data-i18n="app:artist">${th('app:artist')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">💿</div>
                            <div class="stat-number">${this.playStats.uniqueAlbums}</div>
                            <div class="stat-label" data-i18n="app:albums">${th('app:albums')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">⏱️</div>
                            <div class="stat-number">${this.formatDuration(this.playStats.totalDuration)}</div>
                            <div class="stat-label" data-i18n="messages:libraryDuration">${th('messages:libraryDuration')}</div>
                        </div>
                    </div>
                </div>

                <div class="stats-section">
                    <h2 class="section-title">
                        <svg class="title-icon" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z"/>
                        </svg><span data-i18n="messages:playStatistics">${th('messages:playStatistics')}</span></h2>
                    <div class="play-stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${this.playStats.totalPlayedSongs}</div>
                            <div class="stat-label" data-i18n="messages:totalPlays">${th('messages:totalPlays')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${this.formatDuration(this.playStats.totalPlayedDuration)}</div>
                            <div class="stat-label" data-i18n="messages:listeningTime">${th('messages:listeningTime')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${this.playStats.favoriteArtist}</div>
                            <div class="stat-label" data-i18n="messages:favoriteArtist">${th('messages:favoriteArtist')}</div>
                        </div>
                    </div>
                </div>

                ${mostPlayedTracks.length > 0 ? `
                <div class="stats-section">
                    <h2 class="section-title">
                        <svg class="title-icon" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
                        </svg><span data-i18n="messages:mostPlayed">${th('messages:mostPlayed')}</span></h2>
                    <div class="most-played-list">
                        ${mostPlayedTracks.map((track, index) => `
                            <div class="most-played-item">
                                <div class="rank">${index + 1}</div>
                                <div class="track-info">
                                    <div class="track-title">${track.title}</div>
                                    <div class="track-artist">${track.artist}</div>
                                </div>
                                <div class="play-count">${htmlT('audit:playCount', {count: track.playCount})}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

            </div>
        `;

        this.setupPageEventListeners();
    }

    setupPageEventListeners(): void {
        const clearButton = this.container?.querySelector<HTMLButtonElement>('#clear-play-statistics');
        clearButton?.addEventListener('click', async () => {
            const confirmed = await recentPlaybackHistoryService.confirmClearPlayStatistics();
            if (confirmed) {
                recentPlaybackHistoryService.clearPlayStatistics();
            }
        });
    }
}

export {StatisticsPage};
