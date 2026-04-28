const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const find = require('find-process');
const archiver = require('archiver');
const http = require('http');
const url = require('url');
const { initLogging } = require('./src/logger');

// --- Global State ---
let mainWindow;
let backendProcess = null;
let currentRunOutputPath = null;
let patreonLogoBase64 = '';
let appIconBase64 = '';
const isDev = !app.isPackaged;

// --- Fixed Paths ---
// In production, resources are in app.getAppPath() + '/resources/app.asar' or unpacked
const getAppPath = () => {
    if (isDev) {
        return __dirname;
    }
    // For packaged app, use app.getAppPath() which points to the correct location
    return app.getAppPath();
};

const projectRoot = isDev ? __dirname : process.resourcesPath;
const appRoot = getAppPath();

// These paths should work in both dev and production
const srcDir = path.join(appRoot, 'src');
const scriptsDir = path.join(projectRoot, 'scripts');
const binRoot = path.join(projectRoot, 'bin');
const assetsRoot = path.join(projectRoot, 'assets');
const configPath = path.join(projectRoot, 'config_koboldcpp.ini');
const lmStudioConfigPath = path.join(projectRoot, 'config_lm_studio.ini');
const qualityPromptPath = path.join(projectRoot, 'quality-prompt-instruction.ini');

// For user data directories, use app execution path
const appExecRoot = isDev ? projectRoot : path.dirname(app.getPath('exe'));

const CAPTION_SCRIPT = path.join(scriptsDir, 'caption_generator_portable.py');
const DOWNLOADER_SCRIPT = path.join(scriptsDir, 'downloader.py');

const PYTHON_EXE = path.join(binRoot, 'python-3.13.12-embed-amd64', 'python.exe');
const MODELS_DIR = path.join(binRoot, 'models');

const INPUT_DIR = path.join(appExecRoot, 'input');
const INPUT_DIR_SINGLE = path.join(INPUT_DIR, 'single');
const INPUT_DIR_BATCH = path.join(INPUT_DIR, 'batch');
const OUTPUT_DIR = path.join(appExecRoot, 'output');

// --- Logging ---
const appLogger = initLogging({ appExecRoot, isDev });
console.log(`Logging to: ${appLogger.logFilePath}`);

// --- Model Definitions ---
const MODEL_MAP = {
    "5GB VRAM (Q2_K)": "llama-joycaption-beta-one-hf-llava.Q2_K.gguf",
    "8GB VRAM (Q4_K_M)": "llama-joycaption-beta-one-hf-llava.Q4_K_M.gguf",
    "10GB VRAM (Q8_0)": "llama-joycaption-beta-one-hf-llava.Q8_0.gguf",
    "20GB VRAM (F16)": "llama-joycaption-beta-one-hf-llava.f16.gguf"
};
const VISION_MODEL_FILE = "llama-joycaption-beta-one-llava-mmproj-model-f16.gguf";

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        frame: false,
        webPreferences: {
            preload: path.join(srcDir, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Add these for better debugging
            webSecurity: false, // Only if needed for file access
            allowRunningInsecureContent: false
        },
        icon: path.join(assetsRoot, 'images', 'icon.png'),
        // Add this to help with debugging
        show: false // Don't show until ready
    });

    // Remove the menu bar
    mainWindow.removeMenu();

    // Show window when ready to prevent white screen
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const levelMap = { 0: 'INFO', 1: 'WARN', 2: 'ERROR', 3: 'DEBUG' };
        const lvl = levelMap[level] || 'INFO';
        console.log(`[Renderer:${lvl}] ${message} (${sourceId}:${line})`);
    });

    // Add error handling for the main window
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', errorDescription, 'at', validatedURL);
    });

    // Load the HTML file
    const htmlPath = path.join(srcDir, 'index.html');
    console.log('Loading HTML from:', htmlPath);
    console.log('HTML file exists:', fs.existsSync(htmlPath));

    mainWindow.loadFile(htmlPath).catch(err => {
        console.error('Error loading HTML file:', err);
    });
}

// --- App Lifecycle ---
app.whenReady().then(() => {
    console.log('App is ready');
    console.log('isDev:', isDev);
    console.log('projectRoot:', projectRoot);
    console.log('srcDir:', srcDir);
    console.log('scriptsDir:', scriptsDir);
    console.log('assetsRoot:', assetsRoot);

    // Ensure directories exist
    try {
        fs.ensureDirSync(INPUT_DIR_SINGLE);
        fs.ensureDirSync(INPUT_DIR_BATCH);
        fs.ensureDirSync(OUTPUT_DIR);
        fs.emptyDirSync(INPUT_DIR_SINGLE);
        fs.emptyDirSync(INPUT_DIR_BATCH);
        console.log('Directories created successfully');
    } catch (error) {
        console.error('Error creating directories:', error);
    }

    // Load Patreon logo
    const patreonLogoPath = path.join(assetsRoot, 'images', 'patreon.png');
    try {
        if (fs.existsSync(patreonLogoPath)) {
            const logoBuffer = fs.readFileSync(patreonLogoPath);
            patreonLogoBase64 = 'data:image/png;base64,' + logoBuffer.toString('base64');
            console.log('Patreon logo loaded successfully');
        } else {
            console.warn('Patreon logo not found at:', patreonLogoPath);
        }
    } catch (e) {
        console.error("Could not load Patreon logo:", e);
    }

    // Load app icon
    const appIconPath = path.join(assetsRoot, 'images', 'icon.png');
    try {
        if (fs.existsSync(appIconPath)) {
            const iconBuffer = fs.readFileSync(appIconPath);
            appIconBase64 = 'data:image/png;base64,' + iconBuffer.toString('base64');
            console.log('App icon loaded successfully');
        } else {
            console.warn('App icon not found at:', appIconPath);
        }
    } catch (e) {
        console.error("Could not load app icon:", e);
    }

    // --- Configuration Management ---
    function ensureConfigExists(filePath, name) {
        if (!fs.existsSync(filePath)) {
            console.error(`[ERROR] Missing ${name} configuration at: ${filePath}`);
        }
    }

    ensureConfigExists(configPath, 'KoboldCpp');
    ensureConfigExists(lmStudioConfigPath, 'LM Studio');
    ensureConfigExists(qualityPromptPath, 'Quality Prompt');

    createWindow();
});

app.on('window-all-closed', () => {
    console.log('All windows closed');
    app.quit();
});

app.on('quit', async () => {
    console.log('App quitting, stopping backend processes');
    await stopAllBackendProcesses();
    appLogger.close();
});

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Replace the existing stopAllBackendProcesses function with this updated version
async function stopAllBackendProcesses() {
    if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
        backendProcess = null;
    }
    try {
        await killKoboldProcesses();
    } catch (e) { console.error("Error killing koboldcpp processes:", e); }
}

// Add this new function
async function killKoboldProcesses() {
    return new Promise((resolve, reject) => {
        const systemRoot = process.env.SystemRoot || 'C:\\Windows';
        const tasklistPath = path.join(systemRoot, 'System32', 'tasklist.exe');

        // Verify tasklist.exe exists to prevent spawn errors
        if (!fs.existsSync(tasklistPath)) {
            return reject(new Error('tasklist.exe not found. Ensure running on Windows.'));
        }

        const proc = spawn(tasklistPath, ['/FO', 'CSV', '/NH'], { shell: false });

        let output = '';
        proc.stdout.on('data', (data) => { output += data.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) return reject(new Error(`tasklist exited with code ${code}`));

            const lines = output.trim().split('\n');
            const pids = [];

            for (const line of lines) {
                const parts = line.split('","');
                const imageName = parts[0] ? parts[0].replace(/^"/, '').toLowerCase() : '';
                if (imageName === 'koboldcpp-launcher.exe') {
                    const pidStr = parts[1] ? parts[1].replace(/"/g, '') : '';
                    const pid = parseInt(pidStr, 10);
                    if (!isNaN(pid)) pids.push(pid);
                }
            }

            pids.forEach(pid => {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (e) { console.error(`Failed to kill PID ${pid}:`, e); }
            });

            resolve();
        });

        proc.on('error', (err) => reject(new Error(`Failed to spawn tasklist: ${err.message}`)));
    });
}

// --- Post-Processing Functions ---


function handleShutdown() {
    mainWindow.webContents.send('status-update', 'Task complete! SHUTTING DOWN PC IN 20 SECONDS.');
    spawn('shutdown', ['/s', '/t', '20'], {
        detached: true,
        stdio: 'ignore',
        shell: false  // Explicitly disable shell to avoid security warning
    }).unref();
}

// --- IPC Handlers ---
ipcMain.handle('start-generation', async (event, options) => {
    await stopAllBackendProcesses();

    const now = new Date();
    const dateStr = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
    const modeStr = options.mode.replace(/ /g, '_');
    const datePath = path.join(OUTPUT_DIR, modeStr, dateStr);
    await fs.ensureDir(datePath);

    const existingRuns = await fs.readdir(datePath);
    const lastRun = existingRuns
        .map(name => parseInt(name, 10))
        .filter(num => !isNaN(num))
        .reduce((max, num) => Math.max(max, num), 0);

    const nextRun = lastRun + 1;
    currentRunOutputPath = path.join(datePath, nextRun.toString());
    await fs.ensureDir(currentRunOutputPath);

    const validExtensions = ['.png', '.jpg', '.jpeg'];
    const inputDir = options.mode === 'Single Image' ? INPUT_DIR_SINGLE : INPUT_DIR_BATCH;
    await fs.ensureDir(inputDir);
    let originalInputFiles = (await fs.readdir(inputDir))
        .filter(f => validExtensions.some(ext => f.toLowerCase().endsWith(ext)))
        .map(f => path.join(inputDir, f));

    originalInputFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (options.mode === 'Single Image' && originalInputFiles.length > 1) {
        originalInputFiles = originalInputFiles.slice(0, 1);
    }

    const outputUrls = [];

    for (let i = 0; i < originalInputFiles.length; i++) {
        const sourcePath = originalInputFiles[i];
        const newFileName = `${i + 1}.png`;
        const outputDestPath = path.join(currentRunOutputPath, newFileName);

        await fs.copy(sourcePath, outputDestPath);
        outputUrls.push(url.pathToFileURL(outputDestPath).href);
    }

    await fs.emptyDir(inputDir);

    for (let i = 0; i < outputUrls.length; i++) {
        const newFileName = `${i + 1}.png`;
        const sourceFromRunPath = path.join(currentRunOutputPath, newFileName);
        const destInInputPath = path.join(inputDir, newFileName);
        await fs.copy(sourceFromRunPath, destInInputPath);
    }

    return outputUrls;
});

ipcMain.on('begin-python-process', (event, options) => {
    if (!currentRunOutputPath) {
        mainWindow.webContents.send('generation-error', 'ERROR: The run output path was not set. Cannot start Python process.');
        return;
    }

    const activeConfigPath = options.desired_model_key === "Custom (LM Studio)" ? lmStudioConfigPath : configPath;

    const inputDir = options.mode === 'Single Image' ? INPUT_DIR_SINGLE : INPUT_DIR_BATCH;
    const args = [
        CAPTION_SCRIPT, inputDir, currentRunOutputPath, activeConfigPath,
        path.join(binRoot, 'koboldcpp', 'koboldcpp-launcher.exe'),
        MODELS_DIR, options.desired_model_key, options.low_vram.toString(), options.gen_type,
        options.trigger_words, options.single_paragraph.toString(), options.max_words.toString(),
        options.prompt_enrichment, options.mode,
    ];

    backendProcess = spawn(PYTHON_EXE, args, { shell: false });

    const eventTypeMap = {
        'status': 'status-update',
        'progress': 'progress-update',
        'error': 'generation-error',
        'image-complete': 'image-complete',
    };

    backendProcess.stdout.on('data', (data) => {
        data.toString().trim().split('\n').forEach(line => {
            try {
                const json = JSON.parse(line);
                const eventName = eventTypeMap[json.type];
                if (eventName) {
                    mainWindow.webContents.send(eventName, json.message || json.data);
                }
            } catch (e) { console.log(`[Python STDOUT]: ${line}`); }
        });
    });

    backendProcess.stderr.on('data', (data) => mainWindow.webContents.send('generation-error', data.toString()));

    backendProcess.on('close', async (code) => {
        if (code === 0) {
            mainWindow.webContents.send('generation-complete');
            if (options.shutdown_pc) handleShutdown();
            else if (!options.keep_model_loaded) await stopAllBackendProcesses();
        } else if (backendProcess) {
            mainWindow.webContents.send('generation-error', `Process exited with non-zero code: ${code}.`);
        }
        backendProcess = null;
    });
});

ipcMain.on('stop-generation', () => {
    stopAllBackendProcesses();
    mainWindow.webContents.send('status-update', 'Operation stopped by user.');
    mainWindow.webContents.send('generation-stopped');
});

ipcMain.handle('get-model-availability', async () => {
    try {
        await fs.ensureDir(MODELS_DIR);
        const modelsInDir = (await fs.readdir(MODELS_DIR)).map(f => f.toLowerCase());
        const availability = Object.entries(MODEL_MAP).map(([key, filename]) => ({
            key, available: modelsInDir.includes(filename.toLowerCase())
        }));
        availability.push({ key: "Custom (LM Studio)", available: true });
        return availability;
    } catch (error) {
        console.error(`ERROR: Could not read models directory at ${MODELS_DIR}.`, error);
        const availability = Object.keys(MODEL_MAP).map(key => ({ key, available: false }));
        availability.push({ key: "Custom (LM Studio)", available: true });
        return availability;
    }
});

ipcMain.handle('delete-model', async (event, modelKey) => {
    const fileToDelete = MODEL_MAP[modelKey];
    if (!fileToDelete) {
        return { success: false, message: `Model key "${modelKey}" not found.` };
    }

    try {
        const mainModelPath = path.join(MODELS_DIR, fileToDelete);
        if (await fs.pathExists(mainModelPath)) {
            await fs.remove(mainModelPath);
        }

        const allModelFiles = Object.values(MODEL_MAP);
        const remainingModels = [];
        const filesInDir = await fs.readdir(MODELS_DIR);

        for (const file of allModelFiles) {
            if (filesInDir.some(dirFile => dirFile.toLowerCase() === file.toLowerCase())) {
                remainingModels.push(file);
            }
        }

        if (remainingModels.length === 0) {
            const visionModelPath = path.join(MODELS_DIR, VISION_MODEL_FILE);
            if (await fs.pathExists(visionModelPath)) {
                await fs.remove(visionModelPath);
            }
        }

        return { success: true };
    } catch (e) {
        console.error(`Error deleting model ${modelKey}:`, e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('check-lm-studio-connection', async () => {
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:1234/api/v1/models', { timeout: 2500 }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: `Server responded with status: ${res.statusCode}` });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ success: false, error: `Could not connect. Is LM Studio running and the server started?` });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Connection timed out.' });
        });
    });
});

ipcMain.handle('download-model', async (event, modelKey) => {
    return new Promise((resolve, reject) => {
        const downloaderProcess = spawn(PYTHON_EXE, [DOWNLOADER_SCRIPT, modelKey, MODELS_DIR], { shell: false });

        downloaderProcess.stdout.on('data', (data) => {
            data.toString().trim().split('\n').forEach(line => {
                try {
                    const json = JSON.parse(line);
                    json.data.modelKey = modelKey;
                    mainWindow.webContents.send(`download-${json.type}`, json.data);
                } catch (e) {
                    console.log(`[Downloader STDOUT]: ${line}`);
                }
            });
        });

        downloaderProcess.stderr.on('data', (data) => {
            const message = data.toString();
            console.error(`[Downloader STDERR]: ${message}`);
            mainWindow.webContents.send('download-error', { modelKey, message });
        });

        downloaderProcess.on('close', (code) => {
            if (code === 0) {
                mainWindow.webContents.send('download-complete', { modelKey });
                resolve({ success: true });
            } else {
                const message = `Downloader exited with code ${code}.`;
                mainWindow.webContents.send('download-error', { modelKey, message });
                reject(new Error(message));
            }
        });
    });
});

ipcMain.handle('create-zip-archive', async () => {
    if (!currentRunOutputPath) return { success: false, message: 'No active run to archive.' };

    const defaultName = path.basename(path.dirname(currentRunOutputPath)) + `_Run_${path.basename(currentRunOutputPath)}.zip`;

    const { filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
    if (!filePath) return { success: false, message: 'Save cancelled.' };

    try {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);
        archive.directory(currentRunOutputPath, false);
        await archive.finalize();
        shell.showItemInFolder(filePath);
        return { success: true, message: `Archive saved to ${filePath}` };
    } catch (e) { return { success: false, message: `Error creating ZIP: ${e.message}` }; }
});

async function processSingleFile(filePath) {
    if (!filePath) return null;
    await fs.ensureDir(INPUT_DIR_SINGLE);
    await fs.emptyDir(INPUT_DIR_SINGLE);
    const destPath = path.join(INPUT_DIR_SINGLE, path.basename(filePath));
    await fs.copy(filePath, destPath);
    return { url: url.pathToFileURL(destPath).href, originalPath: filePath };
}

ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (canceled) return null;
    return await processSingleFile(filePaths[0]);
});

ipcMain.handle('clear-input-dir', async (_event, mode) => {
    try {
        if (mode === 'Single Image') {
            await fs.emptyDir(INPUT_DIR_SINGLE);
        } else if (mode === 'Batch Processing') {
            await fs.emptyDir(INPUT_DIR_BATCH);
        } else {
            await fs.emptyDir(INPUT_DIR_SINGLE);
            await fs.emptyDir(INPUT_DIR_BATCH);
        }
        return { success: true };
    } catch (e) {
        console.error('Error clearing input directory:', e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('handle-dropped-file', async (event, filePath) => {
    return await processSingleFile(filePath);
});

ipcMain.handle('handle-pasted-image', async (event, imageArrayBuffer) => {
    if (!imageArrayBuffer) {
        console.error('handle-pasted-image: No data received.');
        return null;
    }
    try {
        // The renderer sends an ArrayBuffer. The main process receives it
        // and must convert it to a Node.js Buffer to save it.
        const imageBuffer = Buffer.from(imageArrayBuffer);

        await fs.ensureDir(INPUT_DIR_SINGLE);
        await fs.emptyDir(INPUT_DIR_SINGLE);
        const destPath = path.join(INPUT_DIR_SINGLE, 'pasted_image.png');
        await fs.writeFile(destPath, imageBuffer);
        // Return the file URL so the renderer can display it
        return url.pathToFileURL(destPath).href;
    } catch (e) {
        console.error('Error handling pasted image:', e);
        return null;
    }
});

async function processBatchFiles(filePaths) {
    if (!filePaths || filePaths.length === 0) return null;
    await fs.ensureDir(INPUT_DIR_BATCH);
    await fs.emptyDir(INPUT_DIR_BATCH);
    const filenames = filePaths.map(fp => path.basename(fp));
    await Promise.all(filePaths.map(fp => fs.copy(fp, path.join(INPUT_DIR_BATCH, path.basename(fp)))));
    return { count: filenames.length, filenames: filenames.join('\n'), paths: filePaths };
}

ipcMain.handle('open-batch-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (canceled) return null;
    return await processBatchFiles(filePaths);
});

ipcMain.handle('handle-dropped-batch', async (event, filePaths) => {
    return await processBatchFiles(filePaths);
});

ipcMain.handle('get-output-files', async () => {
    if (!currentRunOutputPath) return [];
    try {
        const files = await fs.readdir(currentRunOutputPath);
        const imageFiles = files.filter(f => f.toLowerCase().endsWith('.png')).sort((a, b) => parseInt(a) - parseInt(b));
        return imageFiles.map(f => url.pathToFileURL(path.join(currentRunOutputPath, f)).href);
    } catch { return []; }
});

ipcMain.handle('get-text-content', async (event, imagePath) => {
    const filePath = url.fileURLToPath(imagePath);
    const textPath = filePath.replace(/\.png$/i, '.txt');
    try { return await fs.readFile(textPath, 'utf-8'); } catch { return `Text file not found.`; }
});

ipcMain.on('open-output-folder', () => {
    const pathToOpen = currentRunOutputPath || OUTPUT_DIR;
    shell.openPath(pathToOpen);
});

ipcMain.on('open-patreon-link', () => {
    shell.openExternal('https://www.patreon.com/MM744');
});

ipcMain.handle('get-patreon-logo', () => {
    return patreonLogoBase64;
});

ipcMain.on('open-main-link', () => {
    shell.openExternal('https://caption-creator.merserk.com/');
});

ipcMain.on('open-online-link', () => {
    shell.openExternal('https://aitools.merserk.com/caption-creator');
});

ipcMain.handle('get-app-icon', () => {
    return appIconBase64;
});

// --- Window Control IPC Handlers ---
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});
