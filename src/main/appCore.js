const path = require('path');
const fs = require('fs-extra');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { initLogging } = require('../logger');
const { getEffectiveOutputRoot, loadAppSettings, syncSharedCustomPrompt } = require('./config');
const { stopAllBackendProcesses } = require('./generation');

function createAppPaths({ app, rootDir }) {
    const isDev = !app.isPackaged;
    const projectRoot = isDev ? rootDir : process.resourcesPath;
    const appRoot = isDev ? rootDir : app.getAppPath();
    const appExecRoot = isDev ? projectRoot : path.dirname(app.getPath('exe'));

    const srcDir = path.join(appRoot, 'src');
    const scriptsDir = path.join(projectRoot, 'scripts');
    const binRoot = path.join(projectRoot, 'bin');
    const assetsRoot = path.join(projectRoot, 'assets');
    const inputDir = path.join(appExecRoot, 'input');

    return {
        isDev,
        projectRoot,
        appRoot,
        appExecRoot,
        srcDir,
        scriptsDir,
        binRoot,
        assetsRoot,
        configPath: path.join(projectRoot, 'config.ini'),
        captionScript: path.join(scriptsDir, 'caption_generator_portable.py'),
        downloaderScript: path.join(scriptsDir, 'downloader.py'),
        pythonExe: path.join(binRoot, 'python-3.13.14-embed-amd64', 'python.exe'),
        modelsDir: path.join(binRoot, 'models'),
        llamaServerExe: path.join(binRoot, 'llama.cpp-win-vulkan-x64', 'llama-server.exe'),
        inputDir,
        inputDirSingle: path.join(inputDir, 'single'),
        inputDirBatch: path.join(inputDir, 'batch'),
        inputDirQueue: path.join(inputDir, 'queue'),
        defaultOutputDir: path.join(appExecRoot, 'output'),
    };
}

function createAppContext({ app, packageInfo, rootDir }) {
    const paths = createAppPaths({ app, rootDir });
    initLogging(paths.appExecRoot);

    return {
        app,
        packageInfo,
        paths,
        state: {
            mainWindow: null,
            backendProcess: null,
            currentRunOutputPath: null,
            currentBackendJobId: null,
            patreonLogoBase64: '',
            appIconBase64: '',
            settingsPath: null,
            customOutputRoot: null,
            jobOutputPaths: new Map(),
        },
    };
}

function createWindow(ctx) {
    const { paths } = ctx;
    ctx.state.mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        frame: false,
        webPreferences: {
            preload: path.join(paths.srcDir, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
            allowRunningInsecureContent: false
        },
        icon: path.join(paths.assetsRoot, 'images', 'icon.png'),
        show: false
    });

    ctx.state.mainWindow.removeMenu();

    ctx.state.mainWindow.once('ready-to-show', () => {
        ctx.state.mainWindow.show();
        if (paths.isDev) {
            ctx.state.mainWindow.webContents.openDevTools();
        }
    });

    ctx.state.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        if (level === 2) console.error(`[Renderer] ${message} (${sourceId}:${line})`);
    });

    ctx.state.mainWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', errorDescription, 'at', validatedURL);
    });

    const htmlPath = path.join(paths.srcDir, 'index.html');
    ctx.state.mainWindow.loadFile(htmlPath).catch(err => {
        console.error('Error loading HTML file:', err);
    });
}

function registerLifecycle(ctx) {
    app.whenReady().then(() => {
        loadAppSettings(ctx);

        try {
            fs.ensureDirSync(ctx.paths.inputDirSingle);
            fs.ensureDirSync(ctx.paths.inputDirBatch);
            fs.ensureDirSync(ctx.paths.inputDirQueue);
            fs.ensureDirSync(ctx.paths.defaultOutputDir);
            fs.ensureDirSync(getEffectiveOutputRoot(ctx));
            fs.emptyDirSync(ctx.paths.inputDirSingle);
            fs.emptyDirSync(ctx.paths.inputDirBatch);
            fs.emptyDirSync(ctx.paths.inputDirQueue);
        } catch (error) {
            console.error('Error creating directories:', error);
        }

        loadImageAsset(ctx, 'patreon.png', 'patreonLogoBase64', 'Patreon logo');
        loadImageAsset(ctx, 'icon.png', 'appIconBase64', 'App icon');

        ensureConfigExists(ctx.paths.configPath, 'application');
        syncSharedCustomPrompt(ctx);

        createWindow(ctx);
    });

    app.on('window-all-closed', () => {
        app.quit();
    });

    app.on('quit', async () => {
        await stopAllBackendProcesses(ctx);
    });
}

function loadImageAsset(ctx, fileName, stateKey, label) {
    const assetPath = path.join(ctx.paths.assetsRoot, 'images', fileName);
    try {
        if (fs.existsSync(assetPath)) {
            const imageBuffer = fs.readFileSync(assetPath);
            ctx.state[stateKey] = 'data:image/png;base64,' + imageBuffer.toString('base64');
        }
    } catch (e) {
        console.error(`Could not load ${label.toLowerCase()}:`, e);
    }
}

function ensureConfigExists(filePath, name) {
    if (!fs.existsSync(filePath)) {
        console.error(`Missing ${name} configuration at: ${filePath}`);
    }
}

function registerWindowIpc(ctx) {
    ipcMain.on('open-patreon-link', () => {
        shell.openExternal('https://www.patreon.com/MM744');
    });

    ipcMain.handle('get-patreon-logo', () => {
        return ctx.state.patreonLogoBase64;
    });

    ipcMain.on('open-main-link', () => {
        shell.openExternal('https://caption-creator.merserk.com/');
    });

    ipcMain.on('open-online-link', () => {
        shell.openExternal('https://aitools.merserk.com/caption-creator');
    });

    ipcMain.handle('get-app-icon', () => {
        return ctx.state.appIconBase64;
    });

    ipcMain.handle('get-app-info', () => {
        return {
            name: ctx.packageInfo.name,
            productName: ctx.packageInfo.build?.productName || 'Caption Creator',
            version: ctx.packageInfo.version,
            description: ctx.packageInfo.description,
            author: ctx.packageInfo.author,
            license: ctx.packageInfo.license
        };
    });

    ipcMain.on('window-minimize', () => {
        if (ctx.state.mainWindow) ctx.state.mainWindow.minimize();
    });

    ipcMain.on('window-maximize', () => {
        if (ctx.state.mainWindow) {
            if (ctx.state.mainWindow.isMaximized()) {
                ctx.state.mainWindow.unmaximize();
            } else {
                ctx.state.mainWindow.maximize();
            }
        }
    });

    ipcMain.on('window-close', () => {
        if (ctx.state.mainWindow) ctx.state.mainWindow.close();
    });
}

module.exports = {
    createAppContext,
    registerLifecycle,
    registerWindowIpc,
};
