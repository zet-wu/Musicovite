import {setLocalizedText} from '@/shared/i18n';
export interface EmbeddedLyricsDiagnosticsElements {
    testButton: HTMLButtonElement | null;
}

type EmbeddedLyricsDiagnosticsState = 'idle' | 'selecting' | 'checking';

class EmbeddedLyricsDiagnosticsRenderer {
    setState(elements: EmbeddedLyricsDiagnosticsElements, state: EmbeddedLyricsDiagnosticsState): void {
        const button = elements.testButton;
        if (!button) {
            return;
        }

        switch (state) {
            case 'selecting':
                button.disabled = true;
                setLocalizedText(button, 'messages:chooseFile', {}, 'textContent');
                break;
            case 'checking':
                button.disabled = true;
                setLocalizedText(button, 'messages:detecting', {}, 'textContent');
                break;
            case 'idle':
                button.disabled = false;
                setLocalizedText(button, 'app:testEmbeddedLyrics', {}, 'textContent');
                break;
        }
    }
}

export const embeddedLyricsDiagnosticsRenderer = new EmbeddedLyricsDiagnosticsRenderer();
