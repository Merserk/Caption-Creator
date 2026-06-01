import {
    ILLUSTRIOUS_DELIMITER,
    MODEL_DISPLAY_NAMES,
} from './state.js';

export function collectDOMElements() {
    return {
        singleTextGroup: document.getElementById('single-text-group'),
        batchTextGroup: document.getElementById('batch-text-group'),
        singleUploadBox: document.getElementById('single-upload-box'),
        uploadPlaceholder: document.getElementById('upload-placeholder'),
        singleImagePreview: document.getElementById('single-image-preview'),
        batchUploadBox: document.getElementById('batch-upload-box'),
        batchUploadPlaceholder: document.getElementById('batch-upload-placeholder'),
        batchUploadPreviewGrid: document.getElementById('batch-upload-preview-grid'),
        startButtons: document.querySelectorAll('.start-button'),
        stopButtons: document.querySelectorAll('.stop-button'),
        queueButtons: document.querySelectorAll('.queue-button'),
        queueModalOverlay: document.getElementById('queue-modal-overlay'),
        queueModalCloseButton: document.getElementById('queue-modal-close-button'),
        queueList: document.getElementById('queue-list'),
        queueEmptyState: document.getElementById('queue-empty-state'),
        queueClearFinishedButton: document.getElementById('queue-clear-finished-button'),
        statusOutput: document.getElementById('status-output'),
        progressBar: document.getElementById('progress-bar'),
        progressBarContainer: document.getElementById('progress-bar-container'),
        singleImageOutput: document.getElementById('single-image-output'),
        singleTextOutput: document.getElementById('single-text-output'),
        singleTextOutputLabel: document.getElementById('single-text-output-label'),
        singleNegativeOutputGroup: document.getElementById('single-negative-output-group'),
        singleNegativeOutput: document.getElementById('single-negative-output'),
        batchGalleryOutput: document.getElementById('batch-gallery-output'),
        batchTextOutput: document.getElementById('batch-text-output'),
        batchTextOutputLabel: document.getElementById('batch-text-output-label'),
        batchNegativeOutputGroup: document.getElementById('batch-negative-output-group'),
        batchNegativeOutput: document.getElementById('batch-negative-output'),
        copyButton: document.getElementById('copy-button'),
        copyButtonBatch: document.getElementById('copy-button-batch'),
        openFolderSingle: document.getElementById('open-folder-button-single'),
        openFolderBatch: document.getElementById('open-folder-button-batch'),
        downloadZipButton: document.getElementById('download-zip-button'),
        lowVramInput: document.getElementById('low-vram-input'),
        preserveOriginalNamesInput: document.getElementById('preserve-original-names-input'),
        outputFolderButton: document.getElementById('output-folder-button'),
        configurationButton: document.getElementById('configuration-button'),
        configurationModalOverlay: document.getElementById('configuration-modal-overlay'),
        configurationModalCloseButton: document.getElementById('configuration-modal-close-button'),
        aboutButton: document.getElementById('about-button'),
        aboutModalOverlay: document.getElementById('about-modal-overlay'),
        aboutModalCloseButton: document.getElementById('about-modal-close-button'),
        aboutAppIcon: document.getElementById('about-app-icon'),
        aboutAppName: document.getElementById('about-app-name'),
        aboutAppVersion: document.getElementById('about-app-version'),
        aboutAppAuthor: document.getElementById('about-app-author'),
        aboutWebsiteButton: document.getElementById('about-website-button'),
        aboutOnlineButton: document.getElementById('about-online-button'),
        aboutPatreonButton: document.getElementById('about-patreon-button'),
        aboutPatreonIcon: document.getElementById('about-patreon-icon'),
        modelSelectButton: document.getElementById('model-select-button'),
        selectedModelValue: document.getElementById('selected-model-value'),
        modelSelectModalOverlay: document.getElementById('model-select-modal-overlay'),
        modelModalCloseButton: document.getElementById('model-modal-close-button'),
        modelOptionsPanel: document.getElementById('model-options-panel'),
        modelOptionsList: document.getElementById('model-options-list'),
        lmStudioModelPanel: document.getElementById('lm-studio-model-panel'),
        lmStudioModelList: document.getElementById('lm-studio-model-list'),
        lmStudioModelPanelStatus: document.getElementById('lm-studio-model-panel-status'),
        modeSwitch: document.getElementById('mode-switch'),
        genTypeSwitch: document.getElementById('gen-type-switch'),
        customPromptInput: document.getElementById('custom-prompt-input'),
        customSlider: {
            container: document.getElementById('custom-slider-container'),
            fill: document.getElementById('custom-slider-fill'),
            valueText: document.getElementById('custom-slider-value'),
            hiddenInput: document.getElementById('max-words-value'),
        },
    };
}

export function formatSeconds(seconds) {
    if (seconds === null || seconds === undefined) return '--s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
}

export function splitIllustriousOutput(text) {
    const rawText = (text || '').trim();
    const cleanNegative = (value) => (value || '')
        .replace(/^(NEGATIVE\s+PROMPT\s*:?\s*)/i, '')
        .replace(/^(NEGATIVE\s*:?\s*)/i, '')
        .replace(/\|+$/g, '')
        .trim();
    const delimiterIndex = rawText.indexOf(ILLUSTRIOUS_DELIMITER);
    if (delimiterIndex !== -1) {
        return {
            positive: rawText.slice(0, delimiterIndex).trim(),
            negative: cleanNegative(rawText.slice(delimiterIndex + ILLUSTRIOUS_DELIMITER.length)),
        };
    }

    const fallbackDelimiter = '|||';
    const fallbackIndex = rawText.indexOf(fallbackDelimiter);
    if (fallbackIndex !== -1) {
        return {
            positive: rawText.slice(0, fallbackIndex).trim(),
            negative: cleanNegative(rawText.slice(fallbackIndex + fallbackDelimiter.length)),
        };
    }

    const negativeLabelMatch = rawText.match(/\bNEGATIVE\s+PROMPT\s*:?\s*/i);
    if (negativeLabelMatch?.index > 0) {
        return {
            positive: rawText.slice(0, negativeLabelMatch.index).replace(/\bPOSITIVE\s+PROMPT\s*:?\s*/i, '').trim(),
            negative: cleanNegative(rawText.slice(negativeLabelMatch.index + negativeLabelMatch[0].length)),
        };
    }

    const negativeStarterMatch = rawText.match(/\blowres\s*,\s*bad quality\s*,\s*worst quality\s*,\s*poor quality\b/i);
    if (negativeStarterMatch?.index > 0) {
        return {
            positive: rawText.slice(0, negativeStarterMatch.index).trim(),
            negative: cleanNegative(rawText.slice(negativeStarterMatch.index)),
        };
    }

    return {
        positive: rawText,
        negative: '',
    };
}

export function formatIllustriousClipboardText(positive, negative) {
    return `Positive Prompt:\n${positive || ''}\n\nNegative Prompt:\n${negative || ''}`.trim();
}

export function getModelDisplayName(modelKey) {
    return MODEL_DISPLAY_NAMES[modelKey] || modelKey || '';
}

export function getDownloadItemDisplayName(data = {}) {
    const modelName = (data.model_name || '').toLowerCase();
    const message = (data.message || '').toLowerCase();

    if (modelName.includes('vision projector') || message.includes('vision projector') || message.includes('mmproj-')) {
        return 'Vision Projector';
    }

    return getModelDisplayName(data.modelKey);
}

export function formatDownloadStatusMessage(data = {}) {
    const itemName = getDownloadItemDisplayName(data);
    return String(data.message || '')
        .replace(/mmproj-Gemma-4-[^\s]+?\.gguf/gi, 'Vision Projector')
        .replace(/Gemma-4-[^\s]+?\.gguf/gi, itemName);
}

export function getGenerationTypeLabel(genType) {
    const option = document.querySelector(`#gen-type-switch .switch-option[data-value="${genType}"]`);
    return option?.textContent?.trim() || genType || 'Generation';
}

export function getQueueJobLabel(options) {
    return `${options.mode}; ${getGenerationTypeLabel(options.gen_type)}`;
}

export function getQueuedJobModelLabel(options, externalModelDisplayNames) {
    if (options.desired_model_key === 'Custom (LM Studio)' && options.lm_studio_model_key) {
        return `Custom (LM Studio) - ${externalModelDisplayNames.lmStudio(options.lm_studio_model_key)}`;
    }
    if (options.desired_model_key === 'Custom (Ollama)' && options.ollama_model_key) {
        return `Custom (Ollama) - ${externalModelDisplayNames.ollama(options.ollama_model_key)}`;
    }
    return getModelDisplayName(options.desired_model_key);
}

export function getQueueJob(appState, jobId) {
    return appState.generationQueue.find(job => job.id === jobId);
}

export function normalizeJobPayload(payload, appState) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return {
            jobId: payload.jobId || appState.activeQueueJobId,
            message: payload.message ?? '',
            data: payload,
        };
    }

    return {
        jobId: appState.activeQueueJobId,
        message: payload ?? '',
        data: {},
    };
}

export function isFinishedQueueStatus(status) {
    return ['completed', 'stopped', 'failed'].includes(status);
}

export function createOutputController({ appState, getDOMElements, getSelectedGenType }) {
    function displaySingleTextOutput(textContent, genType = getSelectedGenType()) {
        const DOMElements = getDOMElements();
        appState.singleOutputGenType = genType;
        const isIllustrious = genType === 'illustrious';
        DOMElements.singleNegativeOutputGroup.hidden = !isIllustrious;
        DOMElements.singleTextOutputLabel.textContent = isIllustrious ? 'Positive Prompt' : 'Generated Text';
        if (isIllustrious) {
            const { positive, negative } = splitIllustriousOutput(textContent);
            DOMElements.singleTextOutput.value = positive;
            DOMElements.singleNegativeOutput.value = negative;
            return;
        }

        DOMElements.singleTextOutput.value = (textContent || '').trim();
        DOMElements.singleNegativeOutput.value = '';
    }

    function displayBatchTextOutput(textContent, genType = getSelectedGenType()) {
        const DOMElements = getDOMElements();
        appState.batchOutputGenType = genType;
        const isIllustrious = genType === 'illustrious';
        DOMElements.batchNegativeOutputGroup.hidden = !isIllustrious;
        DOMElements.batchTextOutputLabel.textContent = isIllustrious ? 'Selected Image Positive Prompt' : 'Selected Image Text';
        if (isIllustrious) {
            const { positive, negative } = splitIllustriousOutput(textContent);
            DOMElements.batchTextOutput.value = positive;
            DOMElements.batchNegativeOutput.value = negative;
            return;
        }

        DOMElements.batchTextOutput.value = (textContent || '').trim();
        DOMElements.batchNegativeOutput.value = '';
    }

    function renderOutputPlaceholders(job, outputFiles) {
        const DOMElements = getDOMElements();
        appState.latestOutputJobId = job.id;

        if (job.options.mode === 'Batch Processing') {
            appState.batchOutputGenType = job.options.gen_type;
            DOMElements.singleTextGroup.style.display = 'none';
            DOMElements.batchTextGroup.style.display = 'block';
            DOMElements.singleImageOutput.style.display = 'none';
            DOMElements.batchGalleryOutput.style.display = 'grid';
            DOMElements.batchGalleryOutput.innerHTML = '';
            outputFiles.forEach(fileUrl => {
                const img = document.createElement('img');
                img.src = fileUrl + '?' + new Date().getTime();
                img.dataset.filepath = fileUrl;
                img.dataset.genType = job.options.gen_type;
                img.classList.add('blurred');
                img.addEventListener('click', handleGalleryClick);
                DOMElements.batchGalleryOutput.appendChild(img);
            });
            return;
        }

        appState.singleOutputGenType = job.options.gen_type;
        DOMElements.singleTextGroup.style.display = 'block';
        DOMElements.batchTextGroup.style.display = 'none';
        DOMElements.batchGalleryOutput.style.display = 'none';
        DOMElements.singleImageOutput.style.display = 'block';
        if (outputFiles.length > 0) {
            DOMElements.singleImageOutput.src = outputFiles[0] + '?' + new Date().getTime();
            DOMElements.singleImageOutput.classList.add('blurred');
        } else {
            DOMElements.singleImageOutput.src = '';
            DOMElements.singleImageOutput.classList.remove('blurred');
        }
    }

    async function handleGalleryClick(event) {
        document.querySelectorAll('.gallery img.selected').forEach(img => img.classList.remove('selected'));
        const img = event.target;
        img.classList.add('selected');
        const textContent = await window.electronAPI.getTextContent(img.dataset.filepath);
        displayBatchTextOutput(textContent, img.dataset.genType || appState.batchOutputGenType);
    }

    return {
        displaySingleTextOutput,
        displayBatchTextOutput,
        handleGalleryClick,
        renderOutputPlaceholders,
    };
}
