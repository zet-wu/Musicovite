import {formatDateTime, formatRelativeTime} from '@/shared/i18n';
import type {Track} from '@api/types/library';

export interface RecentTrack extends Track {
    playTime?: number;
    cover?: string | null;
}

export interface RecentTrackEntry {
    track: RecentTrack;
    index: number;
}

export type RecentTrackGroups = Record<string, RecentTrackEntry[]>;

export type RecentTrackDisplayRow =
    | {kind: 'date-header'; key: string; label: string; count: number}
    | {kind: 'track'; key: string; track: RecentTrack; index: number};

export function groupRecentTracksByDate(tracks: RecentTrack[], now = new Date()): RecentTrackGroups {
    const groups: RecentTrackGroups = {};

    tracks.forEach((track, index) => {
        const playDate = new Date(track.playTime || now.getTime());
        const diffDays = Math.floor((now.getTime() - playDate.getTime()) / (1000 * 60 * 60 * 24));

        let dateKey: string;
        if (diffDays === 0) {
            dateKey = 'day:0';
        } else if (diffDays === 1) {
            dateKey = 'day:1';
        } else if (diffDays < 7) {
            dateKey = `day:${diffDays}`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            dateKey = `week:${weeks}`;
        } else {
            dateKey = `month:${playDate.getFullYear()}-${playDate.getMonth()}`;
        }

        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push({track, index});
    });

    return groups;
}

export function flattenRecentTrackRows(tracks: RecentTrack[], now = new Date()): RecentTrackDisplayRow[] {
    const groups = groupRecentTracksByDate(tracks, now);
    return Object.entries(groups).flatMap(([bucket, entries]) => [
        {
            kind: 'date-header' as const,
            key: `date:${bucket}`,
            get label() { return bucket.startsWith('month:')
                ? formatDateTime(new Date(Number(bucket.slice(6).split('-')[0]), Number(bucket.slice(6).split('-')[1])), {year: 'numeric', month: 'long'})
                : formatRelativeTime(-Number(bucket.split(':')[1]), bucket.startsWith('week:') ? 'week' : 'day'); },
            count: entries.length
        },
        ...entries.map(({track, index}) => ({
            kind: 'track' as const,
            key: `track:${track.fileId || track.filePath}:${track.playTime || 0}:${index}`,
            track,
            index
        }))
    ]);
}
