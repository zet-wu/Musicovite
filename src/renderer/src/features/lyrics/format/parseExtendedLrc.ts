import {t} from '@/shared/i18n';
import type {LyricLine} from '@applemusic-like-lyrics/ttml';

const stamp = '(\\d{1,3}):(\\d{2})(?:[.:](\\d{1,3}))?';
const milliseconds = (match: RegExpMatchArray): number => Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number((match[3] ?? '').padEnd(3, '0'));

// 仅正文内的时间边界触发扩展格式；连续行首时间戳仍交给普通 LRC。
export function parseExtendedLrc(text: string): LyricLine[] | null {
    const lines: LyricLine[] = [];
    let extended = false;
    const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0);
    for (const raw of text.split(/\r?\n/)) {
        const head = raw.match(new RegExp(`^\\[${stamp}\\]`));
        if (!head) continue;
        const startTime = milliseconds(head) + offset;
        const body = raw.slice(head[0].length);
        const angle = body.includes('<') && new RegExp(`<${stamp}>`).test(body);
        const square = !new RegExp(`^\\[${stamp}\\]`).test(body) && new RegExp(`.+\\[${stamp}\\]`).test(body);
        if (!angle && !square) {
            const headers = raw.match(new RegExp(`^(?:\\[${stamp}\\])+`))![0];
            for (const time of headers.matchAll(new RegExp(`\\[${stamp}\\]`, 'g'))) {
                const start = milliseconds(time) + offset;
                lines.push({text: raw.slice(headers.length), startTime: start, endTime: start});
            }
            continue;
        }
        extended = true;
        const boundaries = [...body.matchAll(new RegExp(angle ? `<${stamp}>` : `\\[${stamp}\\]`, 'g'))];
        const words: NonNullable<LyricLine['words']> = [];
        let time = startTime;
        let cursor = 0;
        for (const boundary of boundaries) {
            const end = milliseconds(boundary) + offset;
            if (end < time) throw new Error(t('audit:reversedLrcTiming'));
            const word = body.slice(cursor, boundary.index);
            if (word) words.push({text: word, startTime: time, endTime: end});
            time = end;
            cursor = boundary.index! + boundary[0].length;
        }
        const tail = body.slice(cursor);
        // 缺失结束边界用零长度表示，不伪造源词时长。
        if (tail) words.push({text: tail, startTime: time, endTime: time});
        lines.push({text: words.map(word => word.text).join(''), startTime, endTime: time, words});
    }
    return extended ? lines.sort((a, b) => a.startTime - b.startTime) : null;
}
