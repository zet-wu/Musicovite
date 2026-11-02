import {bindLocalizedText, t} from '@/shared/i18n';

import {appNotificationService} from "@/features/appShell/service";
import {favoriteService} from "@/features/library/service/FavoriteService";
import type {Unsubscribe} from "@api/types/common";
import type {Track} from "@api/types/track";

interface PlayerFavoriteControllerOptions {
    button: HTMLButtonElement;
    addDomListener: (
        element: EventTarget,
        event: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
    ) => void;
}

class PlayerFavoriteController {
    private readonly button: HTMLButtonElement;
    private readonly addDomListener: PlayerFavoriteControllerOptions['addDomListener'];
    private readonly unsubscribeFavorite: Unsubscribe;
    private currentTrack: Track | null = null;
    private pending = false;

    constructor(options: PlayerFavoriteControllerOptions) {
        this.button = options.button;
        this.addDomListener = options.addDomListener;
        this.unsubscribeFavorite = favoriteService.onChanged(({trackIds}) => {
            const currentTrack = this.currentTrack;
            if (currentTrack?.fileId && trackIds.includes(currentTrack.fileId)) {
                this.update(currentTrack);
            }
        });
        this.update(null);
    }

    bind(): void {
        this.addDomListener(this.button, 'click', () => {
            void this.toggle();
        });
    }

    update(track: Track | null): void {
        this.currentTrack = track;
        const favorite = favoriteService.isFavorite(track);
        const disabled = !track?.fileId || this.pending;
        this.button.disabled = disabled;
        this.button.classList.toggle('active', favorite);
        this.button.classList.toggle('disabled', disabled);
        this.button.setAttribute('aria-pressed', String(favorite));
        bindLocalizedText(this.button, () => favorite ? t('messages:removeFromFavorites') : t('app:favorites'), 'title');
    }

    destroy(): void {
        this.unsubscribeFavorite();
    }

    private async toggle(): Promise<void> {
        const track = this.currentTrack;
        if (!track?.fileId || this.pending) {
            return;
        }

        this.pending = true;
        this.update(track);
        const result = await favoriteService.toggle(track);
        this.pending = false;
        this.update(track);

        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotUpdateFavorites'));
        }
    }
}

export {PlayerFavoriteController};
