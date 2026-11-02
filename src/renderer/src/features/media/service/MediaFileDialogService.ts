import type {DirectoryResult, ImageFileResult} from '@api/types/file';
import {dialogGateway} from '@/infrastructure/electron';

export type OpenDialogResult = {
    canceled: boolean;
    filePaths: string[];
    bookmarks?: string[];
};

export type OpenFileResult = {
    success: boolean;
    filePaths: string[];
    canceled: boolean;
};

export type SaveFileResult = {
    success: boolean;
    filePath?: string;
    canceled?: boolean;
    cancelled?: boolean;
};

export class MediaFileDialogService {
    async openDirectory(): Promise<string | null> {
        return await dialogGateway.openDirectory();
    }

    async openDirectoryDialog(): Promise<string | null> {
        return await this.openDirectory();
    }

    async openDirectories(): Promise<string[]> {
        return await dialogGateway.openDirectories();
    }

    async openFiles(): Promise<string[]> {
        return await dialogGateway.openFiles();
    }

    async selectMusicFolder(): Promise<DirectoryResult> {
        try {
            const result = await dialogGateway.selectFolder();
            if (result && result.filePaths && result.filePaths.length > 0 && !result.canceled) {
                return {path: result.filePaths[0], success: true};
            }

            return {success: false};
        } catch (error) {
            return {success: false, error: getErrorMessage(error)};
        }
    }

    async selectImageFile(): Promise<ImageFileResult> {
        try {
            const imagePath = await dialogGateway.openImageFile();
            if (imagePath) {
                return {path: imagePath, success: true};
            }

            return {success: false};
        } catch (error) {
            return {success: false, error: getErrorMessage(error)};
        }
    }

    async showOpenDialog(options: Record<string, unknown>): Promise<OpenDialogResult> {
        return await dialogGateway.showOpenDialog(options);
    }

    async openFile(options: Record<string, unknown>): Promise<OpenFileResult> {
        return await dialogGateway.openFile(options);
    }

    async saveFile(options: Record<string, unknown>): Promise<SaveFileResult> {
        return await dialogGateway.saveFile(options);
    }

}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export const mediaFileDialogService = new MediaFileDialogService();
