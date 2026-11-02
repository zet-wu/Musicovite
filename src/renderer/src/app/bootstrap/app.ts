import {initializeLocale} from '@/shared/i18n';
import {createMusicBoxApp} from './createMusicBoxApp';
import type {MusicBoxApp as ExtensionMusicBoxApp} from '@extensions/core/types';

await initializeLocale();

const musicBoxApp = createMusicBoxApp() as unknown as ExtensionMusicBoxApp;

export {musicBoxApp as app};
