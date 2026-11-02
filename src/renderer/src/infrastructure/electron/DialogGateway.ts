import {getElectronAPI} from './ElectronBridge';

type OpenDialogOptions = Record<string, unknown>;

export interface DialogFileResult {
    canceled: boolean;
    filePaths: string[];
    bookmarks?: string[];
}

export interface DialogOpenFileResult {
    success: boolean;
    filePaths: string[];
    canceled: boolean;
}

export interface DialogSaveFileResult {
    success: boolean;
    filePath?: string;
    canceled?: boolean;
    cancelled?: boolean;
}

/**
 * 文件与目录选择对话框的领域入口。
 */
class DialogGateway {
    openDirectory(): Promise<string | null> {
        return getElectronAPI().openDirectory();
    }

    openDirectories(): Promise<string[]> {
        return getElectronAPI().openDirectories();
    }

    openFiles(): Promise<string[]> {
        return getElectronAPI().openFiles();
    }

    selectFolder(): Promise<{filePaths: string[]; canceled: boolean}> {
        return getElectronAPI().selectFolder();
    }

    openImageFile(): Promise<string | null> {
        return getElectronAPI().openImageFile();
    }

    showOpenDialog(options: OpenDialogOptions): Promise<DialogFileResult> {
        return getElectronAPI().dialog.showOpenDialog(options);
    }

    openFile(options: OpenDialogOptions): Promise<DialogOpenFileResult> {
        return getElectronAPI().dialog.openFile(options);
    }

    async saveFile(options: OpenDialogOptions): Promise<DialogSaveFileResult> {
        const result = await getElectronAPI().dialog.saveFile(options);
        const filePath = Array.isArray(result.filePath) ? result.filePath[0] : result.filePath;

        return {
            ...result,
            filePath
        };
    }

}

export const dialogGateway = new DialogGateway();
