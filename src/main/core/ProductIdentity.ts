import {app} from 'electron';
import * as path from 'path';
import {mkdirSync} from 'fs';

export function initializeProductIdentity(): void {
    app.setName('Musicovite');
    const profile = path.join(app.getPath('appData'), 'Musicovite');
    mkdirSync(profile, {recursive: true});
    app.setPath('userData', profile);
    app.setPath('sessionData', profile);
    if (process.platform === 'win32') app.setAppUserModelId('com.musicovite.app');
}

export function brandingPath(...parts: string[]): string {
    return path.join(app.getAppPath(), 'build', 'branding', ...parts);
}
