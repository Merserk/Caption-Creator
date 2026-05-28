export const MODEL_DISPLAY_NAMES = {
    '6GB VRAM (E2B Q4_K_P)': '6GB VRAM AI Model',
    '8GB VRAM (E4B Q4_K_P)': '8GB VRAM AI Model',
    '10GB+ VRAM (E4B Q8_K_P)': '10GB VRAM AI Model',
    '8GB VRAM (NSFW Q4_K_M)': '8GB VRAM AI Model (NSFW)',
    '12GB VRAM (NSFW Q8_0)': '12GB VRAM AI Model (NSFW)',
};

export const LM_STUDIO_MODEL_KEY = 'Custom (LM Studio)';
export const OLLAMA_MODEL_KEY = 'Custom (Ollama)';
export const ILLUSTRIOUS_DELIMITER = '|||NEGATIVE|||';

/**
 * @typedef {Object} QueueJob
 * @property {string} id
 * @property {Object} options
 * @property {'pending'|'running'|'completed'|'stopped'|'failed'} status
 * @property {string} label
 * @property {string} error
 * @property {string[]} outputFiles
 */

export const appState = {
    activeDownloads: new Set(),
    lmStudioConnected: false,
    lmStudioModels: [],
    selectedLmStudioModelKey: null,
    lmStudioLoadingModelKey: null,
    lmStudioEjectingModelKey: null,
    lmStudioModelError: '',
    ollamaConnected: false,
    ollamaModels: [],
    selectedOllamaModelKey: null,
    ollamaLoadingModelKey: null,
    ollamaEjectingModelKey: null,
    ollamaModelError: '',
    ollamaHeartbeatInterval: null,
    ollamaDotCount: 0,
    statusAnimationInterval: null,
    lmStudioHeartbeatInterval: null,
    selectedModelKey: null,
    lmStudioDotCount: 0,
    batchFilenamesText: '',
    singleHasSelection: false,
    batchHasSelection: false,
    isRunning: false,
    isPreparingQueueJob: false,
    activeQueueJobId: null,
    /** @type {QueueJob[]} */
    generationQueue: [],
    latestOutputJobId: null,
    singleOutputGenType: 'captions',
    batchOutputGenType: 'captions',
    outputFolderPreference: null,
    customPromptSaveTimer: null,
};
