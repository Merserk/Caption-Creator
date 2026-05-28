const path = require('path');
const fs = require('fs-extra');
const url = require('url');
const archiver = require('archiver');
const { dialog, ipcMain, shell } = require('electron');
const {
    getEffectiveOutputRoot,
    getOutputFolderPreference,
    getSharedCustomPrompt,
    saveAppSettings,
    saveSharedCustomPrompt,
} = require('./config');
const { getRunOutputPath } = require('./generation');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const INPUT_MANIFEST_FILE = '.caption_creator_input_manifest.json';

function isSupportedImageFile(fileName) {
    return IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

function naturalFileNameSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function getInputManifestPath(inputDir) {
    return path.join(inputDir, INPUT_MANIFEST_FILE);
}

async function writeInputManifest(inputDir, entries) {
    await fs.writeJson(getInputManifestPath(inputDir), entries.map(entry => ({
        stagedName: path.basename(entry.stagedName),
        originalName: path.basename(entry.originalName),
    })), { spaces: 2 });
}

function registerFileIpc(ctx) {
    ipcMain.handle('create-zip-archive', async (_event, jobId) => {
        const runOutputPath = getRunOutputPath(ctx, jobId);
        if (!runOutputPath) return { success: false, message: 'No active run to archive.' };

        const defaultName = path.basename(path.dirname(runOutputPath)) + `_Run_${path.basename(runOutputPath)}.zip`;
        const { filePath } = await dialog.showSaveDialog(ctx.state.mainWindow, { defaultPath: defaultName });
        if (!filePath) return { success: false, message: 'Save cancelled.' };

        try {
            const output = fs.createWriteStream(filePath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(output);
            archive.directory(runOutputPath, false);
            await archive.finalize();
            shell.showItemInFolder(filePath);
            return { success: true, message: `Archive saved to ${filePath}` };
        } catch (e) {
            return { success: false, message: `Error creating ZIP: ${e.message}` };
        }
    });

    ipcMain.handle('get-output-folder-preference', () => {
        return getOutputFolderPreference(ctx);
    });

    ipcMain.handle('select-output-folder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(ctx.state.mainWindow, {
            properties: ['openDirectory', 'createDirectory'],
        });
        if (canceled || !filePaths[0]) {
            return getOutputFolderPreference(ctx);
        }

        ctx.state.customOutputRoot = filePaths[0];
        saveAppSettings(ctx);
        return getOutputFolderPreference(ctx);
    });

    ipcMain.handle('clear-output-folder-preference', () => {
        ctx.state.customOutputRoot = null;
        saveAppSettings(ctx);
        return getOutputFolderPreference(ctx);
    });

    ipcMain.handle('get-custom-prompt', () => {
        return { customPrompt: getSharedCustomPrompt(ctx) };
    });

    ipcMain.handle('save-custom-prompt', (_event, customPrompt) => {
        return { customPrompt: saveSharedCustomPrompt(ctx, customPrompt) };
    });

    ipcMain.handle('open-file-dialog', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(ctx.state.mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
        });
        if (canceled) return null;
        return await processSingleFile(ctx, filePaths[0]);
    });

    ipcMain.handle('handle-dropped-file', async (_event, filePath) => {
        return await processSingleFile(ctx, filePath);
    });

    ipcMain.handle('handle-pasted-image', async (_event, imageArrayBuffer) => {
        if (!imageArrayBuffer) {
            console.error('handle-pasted-image: No data received.');
            return null;
        }
        try {
            const imageBuffer = Buffer.from(imageArrayBuffer);

            await fs.ensureDir(ctx.paths.inputDirSingle);
            await fs.emptyDir(ctx.paths.inputDirSingle);
            const fileName = 'pasted_image.png';
            const destPath = path.join(ctx.paths.inputDirSingle, fileName);
            await fs.writeFile(destPath, imageBuffer);
            await writeInputManifest(ctx.paths.inputDirSingle, [{ stagedName: fileName, originalName: fileName }]);
            return url.pathToFileURL(destPath).href;
        } catch (e) {
            console.error('Error handling pasted image:', e);
            return null;
        }
    });

    ipcMain.handle('open-batch-dialog', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(ctx.state.mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
        });
        if (canceled) return null;
        return await processBatchFiles(ctx, filePaths);
    });

    ipcMain.handle('handle-dropped-batch', async (_event, filePaths) => {
        return await processBatchFiles(ctx, filePaths);
    });

    ipcMain.handle('clear-selected-images', async (_event, mode) => {
        const inputDir = mode === 'Batch Processing' ? ctx.paths.inputDirBatch : ctx.paths.inputDirSingle;
        await fs.ensureDir(inputDir);
        await fs.emptyDir(inputDir);
        return { success: true };
    });

    ipcMain.handle('get-output-files', async (_event, jobId) => {
        const runOutputPath = getRunOutputPath(ctx, jobId);
        if (!runOutputPath) return [];
        try {
            const files = await fs.readdir(runOutputPath);
            const imageFiles = files
                .filter(isSupportedImageFile)
                .sort(naturalFileNameSort);
            return imageFiles.map(f => url.pathToFileURL(path.join(runOutputPath, f)).href);
        } catch {
            return [];
        }
    });

    ipcMain.handle('get-text-content', async (_event, imagePath) => {
        const filePath = url.fileURLToPath(imagePath);
        const parsedPath = path.parse(filePath);
        const basePath = path.join(parsedPath.dir, parsedPath.name);
        const textPaths = ['.txt', '.json', '.yaml', '.yml'].map(ext => `${basePath}${ext}`);
        for (const textPath of textPaths) {
            try {
                if (await fs.pathExists(textPath)) {
                    return await fs.readFile(textPath, 'utf-8');
                }
            } catch {}
        }
        return `Text file not found.`;
    });

    ipcMain.on('open-output-folder', () => {
        const pathToOpen = ctx.state.currentRunOutputPath || getEffectiveOutputRoot(ctx);
        shell.openPath(pathToOpen);
    });
}

async function processSingleFile(ctx, filePath) {
    if (!filePath) return null;
    await fs.ensureDir(ctx.paths.inputDirSingle);
    await fs.emptyDir(ctx.paths.inputDirSingle);
    const fileName = path.basename(filePath);
    const destPath = path.join(ctx.paths.inputDirSingle, fileName);
    await fs.copy(filePath, destPath);
    await writeInputManifest(ctx.paths.inputDirSingle, [{ stagedName: fileName, originalName: fileName }]);
    return { url: url.pathToFileURL(destPath).href, originalPath: filePath };
}

async function processBatchFiles(ctx, filePaths) {
    if (!filePaths || filePaths.length === 0) return null;
    await fs.ensureDir(ctx.paths.inputDirBatch);
    await fs.emptyDir(ctx.paths.inputDirBatch);
    const filenames = filePaths.map(fp => path.basename(fp));
    await Promise.all(filePaths.map(fp => fs.copy(fp, path.join(ctx.paths.inputDirBatch, path.basename(fp)))));
    await writeInputManifest(ctx.paths.inputDirBatch, filenames.map(fileName => ({
        stagedName: fileName,
        originalName: fileName,
    })));
    return { count: filenames.length, filenames: filenames.join('\n'), paths: filePaths };
}

module.exports = { registerFileIpc };
