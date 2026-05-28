const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const { ipcMain } = require('electron');
const { readConfigValue } = require('./config');

const LM_STUDIO_MODEL_KEY = 'Custom (LM Studio)';
const OLLAMA_MODEL_KEY = 'Custom (Ollama)';
const LM_STUDIO_HOST = 'http://127.0.0.1:1234';
const OLLAMA_DEFAULT_HOST = 'http://127.0.0.1:11434';

const MODEL_MAP = {
    "6GB VRAM (E2B Q4_K_P)": {
        modelFile: "Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
        visionFile: "mmproj-Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-f16.gguf"
    },
    "8GB VRAM (E4B Q4_K_P)": {
        modelFile: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
        visionFile: "mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf"
    },
    "10GB+ VRAM (E4B Q8_K_P)": {
        modelFile: "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P.gguf",
        visionFile: "mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf"
    },
    "8GB VRAM (NSFW Q4_K_M)": {
        modelFile: "nsfwvision_v5-Q4_K_M.gguf",
        visionFile: "mmproj-nsfwvision_v5.gguf"
    },
    "12GB VRAM (NSFW Q8_0)": {
        modelFile: "nsfwvision_v5-Q8_0.gguf",
        visionFile: "mmproj-nsfwvision_v5.gguf"
    }
};

function getLmStudioHeaders(extraHeaders = {}) {
    const headers = {
        Accept: 'application/json',
        ...extraHeaders,
    };
    const token = process.env.LM_STUDIO_API_KEY || process.env.LM_API_TOKEN;
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function requestLmStudioJson(method, endpoint, body = null, timeoutMs = 30000) {
    return requestJson(`${LM_STUDIO_HOST}${endpoint}`, method, body, timeoutMs, getLmStudioHeaders, 'LM Studio');
}

function readLmStudioContextLength(ctx) {
    const value = parseInt(readConfigValue(ctx.paths.configPath, 'lm_studio', 'context_length', '0'), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function getOllamaBaseUrl(ctx) {
    return (readConfigValue(ctx.paths.configPath, 'ollama', 'base_url', OLLAMA_DEFAULT_HOST) || OLLAMA_DEFAULT_HOST).replace(/\/+$/, '');
}

function getOllamaHeaders(extraHeaders = {}) {
    const headers = {
        Accept: 'application/json',
        ...extraHeaders,
    };
    const token = process.env.OLLAMA_API_KEY;
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function requestOllamaJson(ctx, method, endpoint, body = null, timeoutMs = 30000) {
    return requestJson(`${getOllamaBaseUrl(ctx)}${endpoint}`, method, body, timeoutMs, getOllamaHeaders, 'Ollama');
}

function requestJson(requestUrl, method, body, timeoutMs, headersFactory, serviceName) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = headersFactory(payload ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        } : {});

        const req = http.request(requestUrl, {
            method,
            timeout: timeoutMs,
            headers,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed = {};
                if (data.trim()) {
                    try {
                        parsed = JSON.parse(data);
                    } catch (e) {
                        return reject(new Error(`${serviceName} returned invalid JSON: ${e.message}`));
                    }
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(parsed);
                    return;
                }

                const error = parsed.error;
                const message = typeof error === 'string'
                    ? error
                    : error?.message || parsed.message || data.trim() || `Server responded with status: ${res.statusCode}`;
                reject(new Error(message));
            });
        });

        req.on('error', () => {
            reject(new Error(serviceName === 'LM Studio'
                ? 'Could not connect. Is LM Studio running and the server started?'
                : 'Could not connect. Is Ollama running?'));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Connection timed out.'));
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

function normalizeOllamaModel(model, detailsPayload, runningModelNames) {
    const modelName = model.model || model.name || '';
    const details = detailsPayload.details || model.details || {};
    return {
        key: modelName,
        displayName: modelName,
        publisher: '',
        architecture: details.family || details.format || '',
        params: details.parameter_size || '',
        quantization: details.quantization_level || '',
        sizeBytes: model.size || 0,
        maxContextLength: detailsPayload.model_info?.['qwen3vl.context_length'] || detailsPayload.model_info?.['general.context_length'] || 0,
        loaded: runningModelNames.has(modelName),
        loadedInstanceIds: [],
        vision: (detailsPayload.capabilities || []).includes('vision'),
    };
}

function getOllamaKeepAlive(ctx, load = true) {
    if (!load) return 0;
    const value = readConfigValue(ctx.paths.configPath, 'ollama', 'keep_alive', '-1');
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
}

function readOllamaContextLength(ctx) {
    const value = parseInt(readConfigValue(ctx.paths.configPath, 'ollama', 'context_length', '0'), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeLmStudioModel(model) {
    const loadedInstances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
    const quantization = model.quantization || {};
    return {
        key: model.key || model.id || '',
        displayName: model.display_name || model.name || model.key || model.id || 'Unnamed model',
        publisher: model.publisher || '',
        architecture: model.architecture || '',
        params: model.params_string || '',
        quantization: quantization.name || '',
        sizeBytes: model.size_bytes || 0,
        maxContextLength: model.max_context_length || 0,
        loaded: loadedInstances.length > 0,
        loadedInstanceIds: loadedInstances.map(instance => instance.id).filter(Boolean),
        vision: !!model.capabilities?.vision,
    };
}

function registerModelIpc(ctx) {
    ipcMain.handle('get-model-availability', async () => {
        try {
            await fs.ensureDir(ctx.paths.modelsDir);
            const modelsInDir = (await fs.readdir(ctx.paths.modelsDir)).map(f => f.toLowerCase());
            const availability = Object.entries(MODEL_MAP).map(([key, files]) => ({
                key,
                available: modelsInDir.includes(files.modelFile.toLowerCase())
                    && modelsInDir.includes(files.visionFile.toLowerCase())
            }));
            availability.push({ key: LM_STUDIO_MODEL_KEY, available: true });
            availability.push({ key: OLLAMA_MODEL_KEY, available: true });
            return availability;
        } catch (error) {
            console.error(`ERROR: Could not read models directory at ${ctx.paths.modelsDir}.`, error);
            const availability = Object.keys(MODEL_MAP).map(key => ({ key, available: false }));
            availability.push({ key: LM_STUDIO_MODEL_KEY, available: true });
            availability.push({ key: OLLAMA_MODEL_KEY, available: true });
            return availability;
        }
    });

    ipcMain.handle('delete-model', async (_event, modelKey) => {
        const modelFiles = MODEL_MAP[modelKey];
        if (!modelFiles) {
            return { success: false, message: `Model key "${modelKey}" not found.` };
        }

        try {
            const mainModelPath = path.join(ctx.paths.modelsDir, modelFiles.modelFile);
            if (await fs.pathExists(mainModelPath)) {
                await fs.remove(mainModelPath);
            }

            const remainingVisionFiles = new Set();
            const filesInDir = await fs.readdir(ctx.paths.modelsDir);

            for (const files of Object.values(MODEL_MAP)) {
                if (
                    files.modelFile !== modelFiles.modelFile
                    && filesInDir.some(dirFile => dirFile.toLowerCase() === files.modelFile.toLowerCase())
                ) {
                    remainingVisionFiles.add(files.visionFile.toLowerCase());
                }
            }

            if (!remainingVisionFiles.has(modelFiles.visionFile.toLowerCase())) {
                const visionModelPath = path.join(ctx.paths.modelsDir, modelFiles.visionFile);
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
        try {
            await requestLmStudioJson('GET', '/api/v1/models', null, 2500);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-lm-studio-models', async () => {
        try {
            const payload = await requestLmStudioJson('GET', '/api/v1/models', null, 5000);
            const models = Array.isArray(payload.models) ? payload.models : [];
            const visionModels = models
                .filter(model => model.type === 'llm' && model.capabilities?.vision)
                .map(normalizeLmStudioModel)
                .filter(model => model.key);
            return { success: true, models: visionModels };
        } catch (e) {
            return { success: false, error: e.message, models: [] };
        }
    });

    ipcMain.handle('load-lm-studio-model', async (_event, modelKey) => {
        if (!modelKey || typeof modelKey !== 'string') {
            return { success: false, error: 'No LM Studio model was selected.' };
        }

        const body = {
            model: modelKey,
            echo_load_config: true,
        };
        const contextLength = readLmStudioContextLength(ctx);
        if (contextLength) {
            body.context_length = contextLength;
        }

        try {
            const payload = await requestLmStudioJson('POST', '/api/v1/models/load', body, 120000);
            return { success: true, data: payload };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('unload-lm-studio-model', async (_event, options = {}) => {
        const modelKey = options.modelKey;
        let instanceIds = Array.isArray(options.instanceIds)
            ? options.instanceIds.filter(id => typeof id === 'string' && id.trim())
            : [];

        if (instanceIds.length === 0 && modelKey) {
            try {
                const payload = await requestLmStudioJson('GET', '/api/v1/models', null, 5000);
                const models = Array.isArray(payload.models) ? payload.models : [];
                const model = models.find(item => (item.key || item.id) === modelKey);
                instanceIds = (model?.loaded_instances || [])
                    .map(instance => instance.id)
                    .filter(Boolean);
            } catch (e) {
                return { success: false, error: e.message };
            }
        }

        if (instanceIds.length === 0) {
            return { success: false, error: 'Selected LM Studio model has no loaded instances to eject.' };
        }

        try {
            const unloaded = [];
            for (const instanceId of instanceIds) {
                const payload = await requestLmStudioJson('POST', '/api/v1/models/unload', {
                    instance_id: instanceId,
                }, 30000);
                unloaded.push(payload.instance_id || instanceId);
            }
            return { success: true, unloaded };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('check-ollama-connection', async () => {
        try {
            await requestOllamaJson(ctx, 'GET', '/api/tags', null, 2500);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-ollama-models', async () => {
        try {
            const tagsPayload = await requestOllamaJson(ctx, 'GET', '/api/tags', null, 5000);
            const psPayload = await requestOllamaJson(ctx, 'GET', '/api/ps', null, 5000).catch(() => ({ models: [] }));
            const runningModelNames = new Set((psPayload.models || []).map(model => model.model || model.name).filter(Boolean));
            const models = Array.isArray(tagsPayload.models) ? tagsPayload.models : [];
            const visionModels = [];

            for (const model of models) {
                const modelName = model.model || model.name;
                if (!modelName) continue;
                try {
                    const detailsPayload = await requestOllamaJson(ctx, 'POST', '/api/show', { model: modelName }, 10000);
                    const normalized = normalizeOllamaModel(model, detailsPayload, runningModelNames);
                    if (normalized.vision) {
                        visionModels.push(normalized);
                    }
                } catch (e) {
                    console.warn(`Could not inspect Ollama model ${modelName}:`, e.message);
                }
            }

            return { success: true, models: visionModels };
        } catch (e) {
            return { success: false, error: e.message, models: [] };
        }
    });

    ipcMain.handle('load-ollama-model', async (_event, modelKey) => {
        if (!modelKey || typeof modelKey !== 'string') {
            return { success: false, error: 'No Ollama model was selected.' };
        }

        const body = {
            model: modelKey,
            prompt: '',
            stream: false,
            keep_alive: getOllamaKeepAlive(ctx, true),
        };
        const contextLength = readOllamaContextLength(ctx);
        if (contextLength) {
            body.options = { num_ctx: contextLength };
        }

        try {
            const payload = await requestOllamaJson(ctx, 'POST', '/api/generate', body, 120000);
            return { success: true, data: payload };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('unload-ollama-model', async (_event, modelKey) => {
        if (!modelKey || typeof modelKey !== 'string') {
            return { success: false, error: 'No Ollama model was selected.' };
        }

        try {
            const payload = await requestOllamaJson(ctx, 'POST', '/api/generate', {
                model: modelKey,
                prompt: '',
                stream: false,
                keep_alive: getOllamaKeepAlive(ctx, false),
            }, 30000);
            return { success: true, data: payload };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('download-model', async (_event, modelKey) => {
        return new Promise((resolve, reject) => {
            let detailedErrorMessage = null;
            const downloaderProcess = spawn(ctx.paths.pythonExe, [ctx.paths.downloaderScript, modelKey, ctx.paths.modelsDir], { shell: false });

            downloaderProcess.stdout.on('data', (data) => {
                data.toString().trim().split('\n').forEach(line => {
                    try {
                        const json = JSON.parse(line);
                        if (json.type === 'error' && json.data?.message) {
                            detailedErrorMessage = json.data.message;
                        }
                        json.data.modelKey = modelKey;
                        ctx.state.mainWindow.webContents.send(`download-${json.type}`, json.data);
                    } catch (e) {
                        console.log(`[Downloader STDOUT]: ${line}`);
                    }
                });
            });

            downloaderProcess.stderr.on('data', (data) => {
                const message = data.toString();
                console.error(`[Downloader STDERR]: ${message}`);
                ctx.state.mainWindow.webContents.send('download-error', { modelKey, message });
            });

            downloaderProcess.on('close', (code) => {
                if (code === 0) {
                    ctx.state.mainWindow.webContents.send('download-complete', { modelKey });
                    resolve({ success: true });
                } else {
                    const message = detailedErrorMessage || `Downloader exited with code ${code}.`;
                    if (!detailedErrorMessage) {
                        ctx.state.mainWindow.webContents.send('download-error', { modelKey, message });
                    }
                    reject(new Error(message));
                }
            });
        });
    });
}

module.exports = { registerModelIpc };
