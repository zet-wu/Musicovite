import {promises as fs} from 'node:fs';
import {dirname} from 'node:path';
import {createTranslator, isPreference, resolveLocale} from '../../i18n/generated/runtime';
import type {LocalePreference, LocaleState} from '../../i18n/generated/runtime';

export class LocaleService {
    private state: LocaleState = {preference: 'system', resolvedLocale: 'zh-CN', revision: 0};
    private pending: Promise<unknown> = Promise.resolve();
    private listeners = new Set<(state: LocaleState) => void>();
    readonly translator = createTranslator();
    constructor(private readonly filePath: string, private readonly systemLanguages: () => string[]) {}

    async initialize(): Promise<void> {
        let preference: LocalePreference = 'system';
        let valid = false;
        try {
            const data = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
            if (data.version === 1 && isPreference(data.preference)) {
                preference = data.preference;
                valid = true;
            }
        } catch { /* 缺失或损坏配置使用当前默认契约。 */ }
        this.state = {preference, resolvedLocale: this.resolve(preference), revision: 0};
        await this.translator.changeLanguage(this.state.resolvedLocale);
        if (!valid) {
            try { await this.persist(preference); }
            catch (error) { console.warn('⚠️ 无法保存初始语言设置:', error); }
        }
    }
    getState(): LocaleState { return {...this.state}; }
    subscribe(listener: (state: LocaleState) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    setPreference(value: unknown): Promise<LocaleState> {
        if (!isPreference(value)) return Promise.reject(new Error('LOCALE_INVALID_PREFERENCE'));
        const operation = this.pending.then(async () => {
            // 先原子写盘，再提交内存与广播；失败不会污染后续请求队列。
            await this.persist(value);
            const next = {preference: value, resolvedLocale: this.resolve(value), revision: this.state.revision + 1};
            await this.translator.changeLanguage(next.resolvedLocale);
            this.state = next;
            for (const listener of this.listeners) {
                try { listener(this.getState()); } catch (error) { console.warn('⚠️ 语言订阅失败:', error); }
            }
            return this.getState();
        });
        this.pending = operation.catch(() => {});
        return operation;
    }
    private resolve(preference: LocalePreference) {
        if (preference !== 'system') return preference;
        try { return resolveLocale(this.systemLanguages()); } catch { return 'zh-CN' as const; }
    }
    private async persist(preference: LocalePreference): Promise<void> {
        await fs.mkdir(dirname(this.filePath), {recursive: true});
        const temporary = `${this.filePath}.tmp`;
        await fs.writeFile(temporary, JSON.stringify({version: 1, preference}, null, 2), 'utf8');
        await fs.rename(temporary, this.filePath);
    }
}
