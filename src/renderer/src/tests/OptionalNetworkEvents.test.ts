import {afterEach, expect, it, vi} from 'vitest';
const events = vi.hoisted(() => ({
    onNetworkDriveConnected: vi.fn(), onNetworkDriveDisconnected: vi.fn(),
    onConnected: vi.fn(), onDisconnected: vi.fn(), onError: vi.fn()
}));
vi.mock('../ui/widgets/navigation/NavigationDataService', () => ({navigationDataService: events}));
vi.mock('../features/networkDrive/service', () => ({networkDriveManagementService: events}));
vi.mock('../ui/base/Component', () => ({Component: class {}}));
vi.mock('../utils', () => ({theme: {}}));
vi.mock('../features/appShell/service', () => ({appConfirmationService: {}, appNotificationService: {}}));
vi.mock('../shared/i18n', () => ({t: (key: string) => key, th: (key: string) => key, htmlT: (key: string) => key, setLocalizedText: vi.fn()}));
import {Navigation} from '../ui/widgets/Navigation';
import {NetworkDiskModal} from '../ui/modals/NetworkDiskModal';

afterEach(() => vi.resetAllMocks());

it('网络订阅缺失不阻止导航初始化，释放已注册的监听', () => {
    const dispose = vi.fn();
    events.onNetworkDriveConnected.mockReturnValue(dispose);
    events.onNetworkDriveDisconnected.mockImplementation(() => {throw new Error('missing API');});
    const navigation = Object.assign(Object.create(Navigation.prototype), {
        removeNetworkDriveConnectedListener: null, removeNetworkDriveDisconnectedListener: null
    });
    expect(() => navigation.setupNetworkDriveListeners()).not.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
    expect(navigation.removeNetworkDriveConnectedListener).toBeNull();
});

it('网络弹窗订阅失败只报告该功能错误并保留手动列表加载', () => {
    const dispose = vi.fn();
    events.onConnected.mockReturnValue(dispose);
    events.onDisconnected.mockImplementation(() => {throw new Error('missing API');});
    const modal = Object.assign(Object.create(NetworkDiskModal.prototype), {
        refreshDrivesBtn: null, networkDriveUnsubscribers: [],
        showNotification: vi.fn(), refreshMountedDrivesList: vi.fn()
    });
    expect(() => modal.initializeNetworkDriveManagement()).not.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
    expect(modal.showNotification).toHaveBeenCalledOnce();
    expect(modal.refreshMountedDrivesList).toHaveBeenCalledOnce();
});
