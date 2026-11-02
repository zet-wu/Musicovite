import {MusicBoxApp} from '@/app/runtime/MusicBoxApp';
import {bindApplicationRuntime} from './bindApplicationRuntime';

export function createMusicBoxApp(): MusicBoxApp {
    bindApplicationRuntime();
    return new MusicBoxApp();
}
