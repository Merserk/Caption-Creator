const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Renderer to Main
    startGeneration: (options) => ipcRenderer.invoke('start-generation', options),
    beginPythonProcess: (options) => ipcRenderer.send('begin-python-process', options),
    stopGeneration: () => ipcRenderer.send('stop-generation'),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    handleDroppedFile: (filePath) => ipcRenderer.invoke('handle-dropped-file', filePath),
    handlePastedImage: (arrayBuffer) => ipcRenderer.invoke('handle-pasted-image', arrayBuffer),
    openBatchDialog: () => ipcRenderer.invoke('open-batch-dialog'),
    handleDroppedBatch: (filePaths) => ipcRenderer.invoke('handle-dropped-batch', filePaths),
    clearInputDir: () => ipcRenderer.invoke('clear-input-dir'),
    getOutputFiles: () => ipcRenderer.invoke('get-output-files'),
    getTextContent: (imagePath) => ipcRenderer.invoke('get-text-content', imagePath),
    openOutputFolder: () => ipcRenderer.send('open-output-folder'),
    createZipArchive: () => ipcRenderer.invoke('create-zip-archive'),
    getModelAvailability: () => ipcRenderer.invoke('get-model-availability'),
    downloadModel: (modelKey) => ipcRenderer.invoke('download-model', modelKey),
    checkLmStudioConnection: () => ipcRenderer.invoke('check-lm-studio-connection'),
    deleteModel: (modelKey) => ipcRenderer.invoke('delete-model', modelKey),
    openPatreonLink: () => ipcRenderer.send('open-patreon-link'),
    getPatreonLogo: () => ipcRenderer.invoke('get-patreon-logo'),
    getAppIcon: () => ipcRenderer.invoke('get-app-icon'),
    openMainLink: () => ipcRenderer.send('open-main-link'),
    openOnlineLink: () => ipcRenderer.send('open-online-link'),
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // Main to Renderer
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (_event, value) => callback(value)),
    onImageComplete: (callback) => ipcRenderer.on('image-complete', (_event, value) => callback(value)),
    onGenerationComplete: (callback) => ipcRenderer.on('generation-complete', (_event) => callback()),
    onGenerationError: (callback) => ipcRenderer.on('generation-error', (_event, value) => callback(value)),
    onGenerationStopped: (callback) => ipcRenderer.on('generation-stopped', (_event) => callback()),

    // Download events
    onDownloadStatus: (callback) => ipcRenderer.on('download-status', (_event, value) => callback(value)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
    onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (_event, value) => callback(value)),
    onDownloadError: (callback) => ipcRenderer.on('download-error', (_event, value) => callback(value)),
});
