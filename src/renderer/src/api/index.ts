/**
 * MusicBox API
 * 统一的 API 导出接口
 */

// api.ts 仅保留兼容重导出；具体 API 实现在 MusicBoxAPI.ts 和 modules/ 中

// 导出 API 实例
import {
    fileAPI,
    networkAPI,
    trayAPI,
    updateAPI,
    userDataAPI,
} from '@api/modules';

export {
    fileAPI,
    networkAPI,
    trayAPI,
    updateAPI,
    userDataAPI,
};

export const MusicBoxAPI = {
    file: fileAPI,
    userdata: userDataAPI,
    tray: trayAPI,
    network: networkAPI,
    update: updateAPI
} as const;

export default MusicBoxAPI;
