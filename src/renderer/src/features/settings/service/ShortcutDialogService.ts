import {t} from '@/shared/i18n';

import type {ConfirmOptions} from "@/shared/types/AppContracts";
import type {ShortcutConflict} from "./ShortcutSettingsService";

class ShortcutDialogService {
    createConflictConfirmOptions(conflicts: ShortcutConflict[], newShortcut: string): ConfirmOptions {
        const conflictNames = conflicts.map((conflict) => {
            const typeName = conflict.type === 'local' ? t('messages:inApplication') : t('messages:global');
            return `${t(`shortcuts:${conflict.id}Name`)} (${typeName})`;
        }).join('、');

        return {
            title: t('messages:shortcutConflict'),
            message: t('dynamic:shortcutConflictConfirm', {shortcut: this.formatShortcutKey(newShortcut), conflicts: conflictNames}),
            confirmText: t('messages:overwrite'),
            type: 'warning'
        };
    }

    createResetConfirmOptions(): ConfirmOptions {
        return {
            title: t('messages:resetShortcuts'),
            message: t('settings:resetShortcutsConfirm'),
            confirmText: t('app:reset'),
            type: 'warning'
        };
    }

    formatShortcutKey(key: string): string {
        if (!key) {
            return t('messages:notSet');
        }

        return key
            .replace(/Ctrl/g, 'Ctrl')
            .replace(/Alt/g, 'Alt')
            .replace(/Shift/g, 'Shift')
            .replace(/Cmd/g, '⌘')
            .replace(/ArrowUp/g, '↑')
            .replace(/ArrowDown/g, '↓')
            .replace(/ArrowLeft/g, '←')
            .replace(/ArrowRight/g, '→')
            .replace(/Space/g, t('messages:space'));
    }
}

export const shortcutDialogService = new ShortcutDialogService();
