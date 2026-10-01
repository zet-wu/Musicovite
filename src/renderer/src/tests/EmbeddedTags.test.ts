import {expect, it} from 'vitest';
import type {IAudioMetadata} from 'music-metadata';
import {extractAllEmbeddedLyrics} from '../../../main/utils/metadata';

it('保留多标签及损坏项，并使无关标签插入不影响候选身份', () => {
    const tags = [{id: 'USLT', value: {language: 'eng', description: 'A', text: '[00:01]A'}},
        {id: 'USLT', value: {language: 'jpn', description: 'B', text: '[00:01]B'}},
        {id: 'USLT', value: {language: 'eng', description: 'broken', text: ''}}];
    const metadata = {native: {'ID3v2.4': tags}} as unknown as IAudioMetadata;
    const result = extractAllEmbeddedLyrics(metadata);
    expect(result.map(item => item.text)).toEqual(['[00:01]A', '[00:01]B', '']);
    const before = result.map(item => item.candidateId);
    metadata.native['ID3v2.4'].unshift({id: 'TIT2', value: 'Song'});
    expect(extractAllEmbeddedLyrics(metadata).map(item => item.candidateId)).toEqual(before);
});
