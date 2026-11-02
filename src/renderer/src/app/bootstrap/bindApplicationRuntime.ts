import {api} from '@api/MusicBoxAPI';
import {appEventService} from '@/features/events/service/AppEventService';
import {playbackApiAdapter} from '@/features/playback/service/PlaybackApiAdapter';
import {playbackUiStateService} from '@/features/playback/service/PlaybackUiStateService';

// 复用事件端口，使重复创建应用时的绑定保持幂等。
const eventBus = {
    on: api.on.bind(api),
    off: api.off.bind(api),
    emit: api.emit.bind(api)
};

export function bindApplicationRuntime(): void {
    appEventService.bindEventBus(eventBus);
    playbackApiAdapter.bindRuntime(api);
    playbackUiStateService.syncStateFromRuntime();
}
