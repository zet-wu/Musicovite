import {t, onLocaleChanged} from '@/shared/i18n';
import {desktopLyricsWindowService} from './service';
import type {DesktopLyricsElements} from './DesktopLyricsTypes';

type DesktopLyricsWindowService = typeof desktopLyricsWindowService;

export class DesktopLyricsLockController {
    private isLocked = false;
    private disposeLocale = onLocaleChanged(() => this.updateLockPresentation());
    destroy(): void { this.disposeLocale(); }

    constructor(
        private readonly elements: Pick<DesktopLyricsElements, 'container' | 'controlsBar' | 'lockBtn' | 'lockIcon' | 'unlockIcon'>,
        private readonly windowService: DesktopLyricsWindowService = desktopLyricsWindowService
    ) {
        this.updateLockPresentation();
    }

    get locked(): boolean {
        return this.isLocked;
    }

    bindControlHover(): void {
        this.elements.controlsBar.addEventListener('mouseenter', () => {
            void this.handleControlMouseEnter();
        });

        this.elements.controlsBar.addEventListener('mouseleave', () => {
            void this.handleControlMouseLeave();
        });
    }

    async toggle(): Promise<void> {
        this.isLocked = !this.isLocked;
        await this.applyLockState();
    }

    forceUnlocked(): void {
        this.isLocked = false;
        this.updateLockPresentation();
    }

    async applyMousePassthrough(): Promise<void> {
        if (this.isLocked) {
            await this.windowService.setIgnoreMouseEvents(true, {forward: true});
            return;
        }

        await this.windowService.setIgnoreMouseEvents(false);
    }

    private async handleControlMouseEnter(): Promise<void> {
        if (this.isLocked) {
            await this.windowService.setIgnoreMouseEvents(false);
        }
    }

    private async handleControlMouseLeave(): Promise<void> {
        if (this.isLocked) {
            await this.windowService.setIgnoreMouseEvents(true, {forward: true});
        }
    }

    private async applyLockState(): Promise<void> {
        this.updateLockPresentation();
        await this.applyMousePassthrough();
    }

    private updateLockPresentation(): void {
        this.elements.container.classList.toggle('locked', this.isLocked);
        this.elements.lockBtn.classList.toggle('locked', this.isLocked);
        this.elements.lockBtn.title = t(this.isLocked ? 'lyrics:unlock' : 'lyrics:lock');
        this.elements.lockIcon.style.display = this.isLocked ? 'block' : 'none';
        this.elements.unlockIcon.style.display = this.isLocked ? 'none' : 'block';
    }
}
