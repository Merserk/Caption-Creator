const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const url = require('url');
const { ipcMain } = require('electron');
const { getEffectiveOutputRoot } = require('./config');

const LM_STUDIO_MODEL_KEY = 'Custom (LM Studio)';
const OLLAMA_MODEL_KEY = 'Custom (Ollama)';
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const INPUT_MANIFEST_FILE = '.caption_creator_input_manifest.json';

/**
 * @typedef {Object} GenerationOptions
 * @property {'Single Image'|'Batch Processing'} mode
 * @property {string} gen_type
 * @property {string} desired_model_key
 * @property {boolean} low_vram
 * @property {boolean} single_paragraph
 * @property {string|number} max_words
 */

function createJobId() {
    return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function stopAllBackendProcesses(ctx) {
    const { state } = ctx;
    if (state.backendProcess && !state.backendProcess.killed) {
        state.backendProcess.kill('SIGKILL');
        state.backendProcess = null;
    }
    state.currentBackendJobId = null;
    try {
        await killKoboldProcesses();
    } catch (e) {
        console.error("Error killing koboldcpp processes:", e);
    }
}

async function killKoboldProcesses() {
    return new Promise((resolve, reject) => {
        const systemRoot = process.env.SystemRoot || 'C:\\Windows';
        const tasklistPath = path.join(systemRoot, 'System32', 'tasklist.exe');

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
                    if (!Number.isNaN(pid)) pids.push(pid);
                }
            }

            pids.forEach(pid => {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (e) {
                    console.error(`Failed to kill PID ${pid}:`, e);
                }
            });

            resolve();
        });

        proc.on('error', (err) => reject(new Error(`Failed to spawn tasklist: ${err.message}`)));
    });
}

function sanitizeJobId(jobId) {
    return String(jobId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getPreparedJobRoot(ctx, jobId) {
    return path.join(ctx.paths.inputDirQueue, sanitizeJobId(jobId));
}

function getPreparedJobInputDir(ctx, jobId) {
    return path.join(getPreparedJobRoot(ctx, jobId), 'input');
}

function getPreparedJobRuntimeInputDir(ctx, jobId) {
    return path.join(getPreparedJobRoot(ctx, jobId), 'runtime-input');
}

function isSupportedImageFile(fileName) {
    return IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

function naturalFileNameSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function getInputManifestPath(inputDir) {
    return path.join(inputDir, INPUT_MANIFEST_FILE);
}

async function readInputManifest(inputDir) {
    try {
        const entries = await fs.readJson(getInputManifestPath(inputDir));
        if (!Array.isArray(entries)) return new Map();
        return new Map(entries
            .filter(entry => entry?.stagedName && entry?.originalName)
            .map(entry => [path.basename(entry.stagedName), path.basename(entry.originalName)]));
    } catch {
        return new Map();
    }
}

async function writeInputManifest(inputDir, entries) {
    await fs.writeJson(getInputManifestPath(inputDir), entries.map(entry => ({
        stagedName: path.basename(entry.stagedName),
        originalName: path.basename(entry.originalName),
    })), { spaces: 2 });
}

async function createRunOutputPath(ctx, mode) {
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
    const modeStr = mode.replace(/ /g, '_');
    const outputRoot = getEffectiveOutputRoot(ctx);
    await fs.ensureDir(outputRoot);

    const datePath = path.join(outputRoot, modeStr, dateStr);
    await fs.ensureDir(datePath);

    const existingRuns = await fs.readdir(datePath);
    const lastRun = existingRuns
        .map(name => parseInt(name, 10))
        .filter(num => !Number.isNaN(num))
        .reduce((max, num) => Math.max(max, num), 0);

    const runOutputPath = path.join(datePath, (lastRun + 1).toString());
    await fs.ensureDir(runOutputPath);
    return runOutputPath;
}

async function buildPreparedRuntimeFiles(ctx, jobId, options, runOutputPath) {
    const snapshotInputDir = getPreparedJobInputDir(ctx, jobId);
    const runtimeInputDir = getPreparedJobRuntimeInputDir(ctx, jobId);
    await fs.ensureDir(runtimeInputDir);
    await fs.emptyDir(runtimeInputDir);

    let originalInputFiles = (await fs.readdir(snapshotInputDir))
        .filter(isSupportedImageFile)
        .map(f => path.join(snapshotInputDir, f));

    originalInputFiles.sort((a, b) => naturalFileNameSort(path.basename(a), path.basename(b)));

    if (options.mode === 'Single Image' && originalInputFiles.length > 1) {
        originalInputFiles = originalInputFiles.slice(0, 1);
    }

    if (originalInputFiles.length === 0) {
        throw new Error('No images found for this queued generation.');
    }

    const outputUrls = [];
    const nextManifestEntries = [];
    const inputManifest = await readInputManifest(snapshotInputDir);
    const preserveOriginalNames = options.preserve_original_names === true;

    for (let i = 0; i < originalInputFiles.length; i++) {
        const sourcePath = originalInputFiles[i];
        const sourceFileName = path.basename(sourcePath);
        const originalFileName = inputManifest.get(sourceFileName) || sourceFileName;
        const newFileName = preserveOriginalNames ? originalFileName : `${i + 1}.png`;
        const outputDestPath = path.join(runOutputPath, newFileName);
        const runtimeDestPath = path.join(runtimeInputDir, newFileName);

        await fs.copy(sourcePath, outputDestPath);
        await fs.copy(sourcePath, runtimeDestPath);
        outputUrls.push(url.pathToFileURL(outputDestPath).href);
        nextManifestEntries.push({ stagedName: newFileName, originalName: originalFileName });
    }

    await writeInputManifest(runtimeInputDir, nextManifestEntries);
    return { runtimeInputDir, outputUrls };
}

function getRunOutputPath(ctx, jobId) {
    return jobId && ctx.state.jobOutputPaths.has(jobId)
        ? ctx.state.jobOutputPaths.get(jobId)
        : ctx.state.currentRunOutputPath;
}

function getActiveConfigPath(ctx, desiredModelKey) {
    return ctx.paths.configPath;
}

function buildCaptionArgs(ctx, inputDir, outputDir, options) {
    return [
        ctx.paths.captionScript,
        inputDir,
        outputDir,
        getActiveConfigPath(ctx, options.desired_model_key),
        ctx.paths.koboldLauncherExe,
        ctx.paths.modelsDir,
        options.desired_model_key,
        options.low_vram.toString(),
        options.gen_type,
        options.trigger_words,
        options.single_paragraph.toString(),
        options.max_words.toString(),
        options.prompt_enrichment,
        options.mode,
        options.lm_studio_model_key || '',
        options.ollama_model_key || '',
        options.custom_prompt || '',
    ];
}

function sendToRenderer(ctx, eventName, payload) {
    ctx.state.mainWindow?.webContents.send(eventName, payload);
}

function attachPreparedBackendHandlers(ctx, backendProcess, runJobId) {
    let backendHadDetailedError = false;
    let detailedErrorMessage = '';

    const eventTypeMap = {
        status: 'status-update',
        progress: 'progress-update',
        error: 'generation-error',
        'image-complete': 'image-complete',
    };

    backendProcess.stdout.on('data', (data) => {
        data.toString().trim().split('\n').forEach(line => {
            try {
                const json = JSON.parse(line);
                const eventName = eventTypeMap[json.type];
                if (eventName) {
                    if (json.type === 'error') {
                        backendHadDetailedError = true;
                        detailedErrorMessage = detailedErrorMessage || json.message || json.data || '';
                        return;
                    }
                    const eventPayload = json.type === 'status'
                        ? { jobId: runJobId, message: json.message || json.data || '' }
                        : { jobId: runJobId, ...(json.data || {}) };
                    sendToRenderer(ctx, eventName, eventPayload);
                }
            } catch (e) {
                console.log(`[Python STDOUT]: ${line}`);
            }
        });
    });

    backendProcess.stderr.on('data', (data) => {
        backendHadDetailedError = true;
        detailedErrorMessage = detailedErrorMessage || data.toString();
    });

    backendProcess.on('error', (error) => {
        backendHadDetailedError = true;
        detailedErrorMessage = detailedErrorMessage || error.message;
    });

    backendProcess.on('close', async (code) => {
        const wasStoppedByUser = !ctx.state.backendProcess;
        if (code === 0) {
            ctx.state.backendProcess = null;
            if (ctx.state.currentBackendJobId === runJobId) {
                ctx.state.currentBackendJobId = null;
            }
            try {
                await killKoboldProcesses();
            } catch (e) {
                console.error("Error killing koboldcpp processes:", e);
            }
            sendToRenderer(ctx, 'generation-complete', { jobId: runJobId });
        } else if (!wasStoppedByUser) {
            const message = backendHadDetailedError
                ? detailedErrorMessage || `Process exited with non-zero code: ${code}.`
                : `Process exited with non-zero code: ${code}.`;
            ctx.state.backendProcess = null;
            if (ctx.state.currentBackendJobId === runJobId) {
                ctx.state.currentBackendJobId = null;
            }
            sendToRenderer(ctx, 'generation-error', { jobId: runJobId, message });
        } else {
            if (ctx.state.currentBackendJobId === runJobId) {
                ctx.state.currentBackendJobId = null;
            }
            ctx.state.backendProcess = null;
        }
    });
}

function attachLegacyBackendHandlers(ctx, backendProcess) {
    let backendHadDetailedError = false;

    const eventTypeMap = {
        status: 'status-update',
        progress: 'progress-update',
        error: 'generation-error',
        'image-complete': 'image-complete',
    };

    backendProcess.stdout.on('data', (data) => {
        data.toString().trim().split('\n').forEach(line => {
            try {
                const json = JSON.parse(line);
                const eventName = eventTypeMap[json.type];
                if (eventName) {
                    if (json.type === 'error') backendHadDetailedError = true;
                    sendToRenderer(ctx, eventName, json.message || json.data);
                }
            } catch (e) {
                console.log(`[Python STDOUT]: ${line}`);
            }
        });
    });

    backendProcess.stderr.on('data', (data) => {
        backendHadDetailedError = true;
        sendToRenderer(ctx, 'generation-error', data.toString());
    });

    backendProcess.on('close', async (code) => {
        if (code === 0) {
            sendToRenderer(ctx, 'generation-complete');
            await stopAllBackendProcesses(ctx);
        } else if (ctx.state.backendProcess && !backendHadDetailedError) {
            sendToRenderer(ctx, 'generation-error', `Process exited with non-zero code: ${code}.`);
        }
        ctx.state.backendProcess = null;
    });
}

function registerGenerationIpc(ctx) {
    ipcMain.handle('prepare-generation-job', async (_event, options) => {
        const jobId = createJobId();
        const inputDir = options.mode === 'Single Image' ? ctx.paths.inputDirSingle : ctx.paths.inputDirBatch;
        await fs.ensureDir(inputDir);

        let inputFiles = (await fs.readdir(inputDir))
            .filter(isSupportedImageFile)
            .sort(naturalFileNameSort);

        if (options.mode === 'Single Image' && inputFiles.length > 1) {
            inputFiles = inputFiles.slice(0, 1);
        }

        if (inputFiles.length === 0) {
            throw new Error(options.mode === 'Single Image'
                ? 'Please select a single image before starting.'
                : 'Please select batch images before starting.');
        }

        const snapshotInputDir = getPreparedJobInputDir(ctx, jobId);
        await fs.ensureDir(snapshotInputDir);
        await fs.emptyDir(snapshotInputDir);

        const inputManifest = await readInputManifest(inputDir);
        const nextManifestEntries = [];

        for (const fileName of inputFiles) {
            await fs.copy(path.join(inputDir, fileName), path.join(snapshotInputDir, fileName));
            nextManifestEntries.push({
                stagedName: fileName,
                originalName: inputManifest.get(fileName) || fileName,
            });
        }

        await writeInputManifest(snapshotInputDir, nextManifestEntries);

        return {
            jobId,
            count: inputFiles.length,
            filenames: inputFiles.join('\n'),
        };
    });

    ipcMain.handle('discard-prepared-generation', async (_event, jobId) => {
        if (!jobId) return { success: true };
        await fs.remove(getPreparedJobRoot(ctx, jobId));
        return { success: true };
    });

    ipcMain.handle('start-prepared-generation', async (_event, payload = {}) => {
        const { jobId, options } = payload;
        if (!jobId || !options) {
            throw new Error('Missing queued generation job data.');
        }
        if (ctx.state.backendProcess) {
            throw new Error('A generation is already running.');
        }

        const runOutputPath = await createRunOutputPath(ctx, options.mode);
        ctx.state.currentRunOutputPath = runOutputPath;
        ctx.state.jobOutputPaths.set(jobId, runOutputPath);

        const { runtimeInputDir, outputUrls } = await buildPreparedRuntimeFiles(ctx, jobId, options, runOutputPath);
        const args = buildCaptionArgs(ctx, runtimeInputDir, runOutputPath, options);

        ctx.state.currentBackendJobId = jobId;
        ctx.state.backendProcess = spawn(ctx.paths.pythonExe, args, { shell: false });
        attachPreparedBackendHandlers(ctx, ctx.state.backendProcess, jobId);

        return outputUrls;
    });

    ipcMain.handle('start-generation', async (_event, options) => {
        await stopAllBackendProcesses(ctx);

        const outputRoot = getEffectiveOutputRoot(ctx);
        try {
            await fs.ensureDir(outputRoot);
        } catch (error) {
            const message = `Unable to access selected output folder: ${outputRoot}\n${error.message}`;
            sendToRenderer(ctx, 'generation-error', message);
            return null;
        }

        let runOutputPath;
        try {
            runOutputPath = await createRunOutputPath(ctx, options.mode);
        } catch (error) {
            const modeStr = options.mode.replace(/ /g, '_');
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
            const datePath = path.join(outputRoot, modeStr, dateStr);
            const message = `Unable to create output folder: ${datePath}\n${error.message}`;
            sendToRenderer(ctx, 'generation-error', message);
            return null;
        }

        ctx.state.currentRunOutputPath = runOutputPath;

        const inputDir = options.mode === 'Single Image' ? ctx.paths.inputDirSingle : ctx.paths.inputDirBatch;
        await fs.ensureDir(inputDir);
        let originalInputFiles = (await fs.readdir(inputDir))
            .filter(isSupportedImageFile)
            .map(f => path.join(inputDir, f));

        originalInputFiles.sort((a, b) => naturalFileNameSort(path.basename(a), path.basename(b)));

        if (options.mode === 'Single Image' && originalInputFiles.length > 1) {
            originalInputFiles = originalInputFiles.slice(0, 1);
        }

        const outputUrls = [];
        const stagedFiles = [];
        const nextManifestEntries = [];
        const inputManifest = await readInputManifest(inputDir);
        const preserveOriginalNames = options.preserve_original_names === true;

        for (let i = 0; i < originalInputFiles.length; i++) {
            const sourcePath = originalInputFiles[i];
            const sourceFileName = path.basename(sourcePath);
            const originalFileName = inputManifest.get(sourceFileName) || sourceFileName;
            const newFileName = preserveOriginalNames ? originalFileName : `${i + 1}.png`;
            const outputDestPath = path.join(ctx.state.currentRunOutputPath, newFileName);

            await fs.copy(sourcePath, outputDestPath);
            outputUrls.push(url.pathToFileURL(outputDestPath).href);
            stagedFiles.push(newFileName);
            nextManifestEntries.push({ stagedName: newFileName, originalName: originalFileName });
        }

        await fs.emptyDir(inputDir);

        for (const newFileName of stagedFiles) {
            const sourceFromRunPath = path.join(ctx.state.currentRunOutputPath, newFileName);
            const destInInputPath = path.join(inputDir, newFileName);
            await fs.copy(sourceFromRunPath, destInInputPath);
        }
        await writeInputManifest(inputDir, nextManifestEntries);

        return outputUrls;
    });

    ipcMain.on('begin-python-process', (_event, options) => {
        if (!ctx.state.currentRunOutputPath) {
            sendToRenderer(ctx, 'generation-error', 'ERROR: The run output path was not set. Cannot start Python process.');
            return;
        }

        const inputDir = options.mode === 'Single Image' ? ctx.paths.inputDirSingle : ctx.paths.inputDirBatch;
        const args = buildCaptionArgs(ctx, inputDir, ctx.state.currentRunOutputPath, options);

        ctx.state.backendProcess = spawn(ctx.paths.pythonExe, args, { shell: false });
        attachLegacyBackendHandlers(ctx, ctx.state.backendProcess);
    });

    ipcMain.on('stop-generation', async () => {
        const stoppedJobId = ctx.state.currentBackendJobId;
        await stopAllBackendProcesses(ctx);
        sendToRenderer(ctx, 'status-update', { jobId: stoppedJobId, message: 'Operation stopped by user.' });
        sendToRenderer(ctx, 'generation-stopped', { jobId: stoppedJobId });
    });
}

module.exports = {
    getRunOutputPath,
    registerGenerationIpc,
    stopAllBackendProcesses,
};
