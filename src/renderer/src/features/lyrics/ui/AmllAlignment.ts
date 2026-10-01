import type {LyricAlignment} from '../format/TtmlDocumentService';
import './amllAlignment.css';

interface LineElement {
    getElement(): HTMLElement;
    getLine(): {startTime: number; alignment?: LyricAlignment};
}

// 使用 AMLL 公开的行组接口；属性保留在虚拟化复用的外层元素上。
export function applyAmllAlignment(player: {currentLyricGroups?: Array<{mainLine: LineElement; bgLine?: LineElement}>}): void {
    for (const group of player.currentLyricGroups ?? []) {
        for (const line of [group.mainLine, group.bgLine]) {
            if (!line) continue;
            const element = line.getElement();
            element.dataset.lyricAlignment = line.getLine().alignment ?? 'left';
            if (line === group.bgLine && element.parentElement) {
                element.parentElement.dataset.bgAlignment = line.getLine().alignment ?? 'left';
            }
        }
    }
}
