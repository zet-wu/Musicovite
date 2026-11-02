import {describe, expect, it, vi} from 'vitest';

import {AutoScanScheduler} from '../../../main/services/library/AutoScanScheduler';

describe('AutoScanScheduler 音乐库来源扫描', () => {
    it('只有精确文件来源时也会执行启动扫描', async () => {
        const scheduler = new AutoScanScheduler();
        const scanHandler = vi.fn(async () => undefined);
        scheduler.initialize(scanHandler, async () => ({
            sourceCount: 1,
            autoScanEnabled: true,
            scanFrequency: 'on_startup',
            lastScanTime: 0
        }), vi.fn(async () => undefined));

        await scheduler.start();

        expect(scanHandler).toHaveBeenCalledOnce();
    });

    it('没有任何来源时不执行扫描', async () => {
        const scheduler = new AutoScanScheduler();
        const scanHandler = vi.fn(async () => undefined);
        scheduler.initialize(scanHandler, async () => ({
            sourceCount: 0,
            autoScanEnabled: true,
            scanFrequency: 'on_startup',
            lastScanTime: 0
        }), vi.fn(async () => undefined));

        await scheduler.start();

        expect(scanHandler).not.toHaveBeenCalled();
    });
});
