import {AmllLyricsView} from '@/features/lyrics/ui/AmllLyricsView';
import {LyricsNormalizer} from '@/features/lyrics/format/LyricsNormalizer';
import {lyricsGateway} from '@/infrastructure/electron';
import {LyricsSourcePicker, type LyricsDocumentAppliedDetail} from '@/features/lyrics/ui/LyricsSourcePicker';
import {lyricsProviderRegistry} from '@/features/lyrics/service/defaultLyricsServices';
import type {LyricsBinding} from '@/features/lyrics/domain/types';

const fixture = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:tts="http://www.w3.org/ns/ttml#styling"><head><metadata><ttm:agent xml:id="a" type="person"/><ttm:agent xml:id="b" type="person"/><ttm:agent xml:id="c" type="person"/></metadata></head><body><div>
<p begin="0s" end="4s" ttm:agent="b"><span begin="0s" end="2s">Right </span><span begin="2s" end="4s">singer</span><span ttm:role="x-bg" ttm:agent="a" begin="1s" end="3s">Left background</span></p>
<p begin="4s" end="9s" ttm:agent="a c"><span begin="4s" end="6s">Center </span><span> </span><span begin="6s" end="9s">chorus</span><span ttm:role="x-translation">合唱居中</span><span ttm:role="x-roman">Chorus romanization</span></p>
<p begin="9s" end="14s" ttm:agent="a"><span begin="9s" end="11s" tts:ruby="container"><span tts:ruby="base">注音</span><span tts:ruby="textContainer"><span tts:ruby="text" begin="9s" end="11s">よみ</span></span></span><span begin="11s" end="14s"> A long line with enough words to wrap across the player and preserve left alignment.</span></p>
<p begin="14s" end="18s" ttm:agent="b">Right singer again</p>
</div></body></tt>`;
let position = 0;
let playing = false;
let last = performance.now();
const status = document.querySelector<HTMLOutputElement>('#status')!;
const view = new AmllLyricsView({container: document.querySelector<HTMLElement>('#lyrics')!, isVisible: () => true, seek: async time => {
    position = time;
    view.handlePlaybackPositionChanged(position, true);
}});
const normalizer = new LyricsNormalizer();
function load(text: string) {
    const document = normalizer.fromTtml(text, {source: {kind: 'local', path: 'fixture.ttml'}});
    position = 0;
    view.setDocument(document);
    view.setPlaying(playing);
}
load(fixture);
// 隔离夹具只替换 IPC 端口，不写用户绑定、不发起在线请求。
let saved: {ttml: string; binding: LyricsBinding} | undefined;
lyricsGateway.getEmbedded = async () => ({success: true, candidates: [
    {candidateId: 'stpp:9', type: 'STPP', description: '损坏轨道', text: '', error: '多 sample 不支持'},
    {candidateId: 'stpp:7', type: 'STPP', description: '合唱', format: 'ttml', text: fixture},
    {candidateId: 'tag:lrc', type: 'LRC', description: '逐词兼容标签', text: '[00:01]A [00:02]B[00:03]'}
]});
lyricsGateway.readCanonical = async () => saved ? {success: true, ...saved} : {success: false};
lyricsGateway.getBinding = async () => ({success: true, binding: saved?.binding});
lyricsGateway.saveCanonical = async (trackId, ttml, source, selectionMode) => {
    const binding: LyricsBinding = {trackId, source, selectionMode, updatedAt: Date.now(), canonicalTtmlPath: 'fixture.ttml'};
    saved = {ttml, binding};
    return {success: true, binding};
};
lyricsGateway.clearBinding = async () => {saved = undefined; return {success: true};};
lyricsProviderRegistry.list = () => [];
const picker = new LyricsSourcePicker();
document.querySelector('#picker')!.addEventListener('click', () => void picker.open({fileId: 'fixture', filePath: 'fixture.m4a', title: '合成候选', artist: 'Fixture'}));
window.addEventListener('lyrics:document-applied', event => {
    view.setDocument((event as CustomEvent<LyricsDocumentAppliedDetail>).detail.document, position);
});
document.querySelector('#play')!.addEventListener('click', () => {playing = !playing; view.setPlaying(playing);});
document.querySelector('#seek')!.addEventListener('click', () => {position = 5; view.handlePlaybackPositionChanged(position, true);});
document.querySelector('#theme')!.addEventListener('click', () => document.body.classList.toggle('light'));
document.querySelector<HTMLInputElement>('#file')!.addEventListener('change', async event => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) load(await file.text());
});
function tick(now: number) {
    if (playing) {position += (now - last) / 1000; view.handlePlaybackPositionChanged(position);}
    last = now;
    status.textContent = `${playing ? '播放' : '暂停'} ${position.toFixed(2)}s`;
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
