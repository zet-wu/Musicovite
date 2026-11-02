import type {Unsubscribe} from "@api/types/common";

const noop: Unsubscribe = () => {};

type ElectronAPI = Window['electronAPI'];
type ElectronNamespace = keyof ElectronAPI;
type NamespaceAPI<N extends ElectronNamespace> = ElectronAPI[N];
type CallableNamespace = Record<string, (...args: any[]) => any>;

export function getElectronAPI(): ElectronAPI {
    if (!window.electronAPI) {
        throw new Error('electronAPI is not available');
    }

    return window.electronAPI;
}

function getNamespace<N extends ElectronNamespace>(name: N): NamespaceAPI<N> {
    return getElectronAPI()[name];
}

export function hasElectronNamespace<N extends ElectronNamespace>(name: N): boolean {
    return Boolean(window.electronAPI && window.electronAPI[name]);
}

export class ElectronNamespaceAdapter<N extends ElectronNamespace> {
    protected readonly namespace: N;

    constructor(namespace: N) {
        this.namespace = namespace;
    }

    isAvailable(): boolean {
        return hasElectronNamespace(this.namespace);
    }

    get api(): NamespaceAPI<N> {
        const namespaceAPI = getNamespace(this.namespace);
        if (!namespaceAPI) {
            throw new Error(`electronAPI.${this.namespace} is not available`);
        }

        return namespaceAPI;
    }

    call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
        const fn = (this.api as CallableNamespace)[method];
        if (typeof fn !== 'function') {
            throw new Error(`electronAPI.${this.namespace}.${method} is not available`);
        }

        return fn(...args) as Promise<T>;
    }

    on(method: string, handler: (...args: any[]) => void): Unsubscribe {
        // 浏览器预览没有 preload；Electron 环境中的缺失接口是契约错误。
        if (!window.electronAPI) return noop;
        const api = this.api as CallableNamespace;
        if (typeof api[method] !== 'function') throw new Error('electronAPI.' + this.namespace + '.' + method + ' is not available');
        const dispose = api[method](handler);
        if (typeof dispose !== 'function') throw new Error('electronAPI.' + this.namespace + '.' + method + ' must return an unsubscribe function');
        return dispose;
    }
}

export {noop};
