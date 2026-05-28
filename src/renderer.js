import {
    collectDOMElements,
    createOutputController,
    formatDownloadStatusMessage,
    formatIllustriousClipboardText,
    formatSeconds,
    getQueueJob,
    getQueueJobLabel,
    getQueuedJobModelLabel,
    getDownloadItemDisplayName,
    getModelDisplayName,
    isFinishedQueueStatus,
    normalizeJobPayload,
} from './renderer/ui.js';
import {
    LM_STUDIO_MODEL_KEY,
    OLLAMA_MODEL_KEY,
    appState,
} from './renderer/state.js';

let DOMElements;
let displaySingleTextOutput;
let displayBatchTextOutput;
let handleGalleryClick;
let renderOutputPlaceholders;

function getSelectedGenType() {
    return document.querySelector('#gen-type-switch .switch-option.active')?.dataset.value || 'captions';
}

function isExternalModelKey(modelKey) {
    return modelKey === LM_STUDIO_MODEL_KEY || modelKey === OLLAMA_MODEL_KEY;
}

function getLmStudioModelDisplayName(modelKey) {
    const model = appState.lmStudioModels.find(item => item.key === modelKey);
    return model?.displayName || modelKey || '';
}

function getOllamaModelDisplayName(modelKey) {
    const model = appState.ollamaModels.find(item => item.key === modelKey);
    return model?.displayName || modelKey || '';
}

function getSelectedModelLabel(modelKey = appState.selectedModelKey) {
    if (modelKey === LM_STUDIO_MODEL_KEY && appState.selectedLmStudioModelKey) {
        return `Custom (LM Studio) - ${getLmStudioModelDisplayName(appState.selectedLmStudioModelKey)}`;
    }
    if (modelKey === OLLAMA_MODEL_KEY && appState.selectedOllamaModelKey) {
        return `Custom (Ollama) - ${getOllamaModelDisplayName(appState.selectedOllamaModelKey)}`;
    }
    return getModelDisplayName(modelKey);
}

function clearStatusAnimation() {
    if (appState.statusAnimationInterval) {
        clearInterval(appState.statusAnimationInterval);
        appState.statusAnimationInterval = null;
    }
}

function setRunningState(isRunning) {
    appState.isRunning = isRunning;
    DOMElements.stopButtons.forEach(btn => {
        btn.disabled = !isRunning;
        btn.style.cursor = isRunning ? 'pointer' : 'not-allowed';
    });

    DOMElements.progressBarContainer.style.display = isRunning ? 'block' : 'none';
    if (!isRunning) {
        DOMElements.progressBar.style.width = '0%';
        setTimeout(() => {
            if (!appState.isRunning) {
                DOMElements.progressBarContainer.style.display = 'none';
            }
        }, 1500);
    }

    updateStartButtonState();
}

function toggleInputInteractivity(enabled) {
    const pointerValue = enabled ? 'auto' : 'none';
    const opacityValue = enabled ? '1' : '0.6';
    DOMElements.singleUploadBox.style.pointerEvents = pointerValue;
    DOMElements.batchUploadBox.style.pointerEvents = pointerValue;
    DOMElements.singleUploadBox.style.opacity = opacityValue;
    DOMElements.batchUploadBox.style.opacity = opacityValue;
    DOMElements.modeSwitch.style.pointerEvents = pointerValue;
    DOMElements.genTypeSwitch.style.pointerEvents = pointerValue;
    DOMElements.modeSwitch.style.opacity = opacityValue;
    DOMElements.genTypeSwitch.style.opacity = opacityValue;
}

function updateStartButtonState() {
    const mode = document.querySelector('#mode-switch .switch-option.active')?.dataset.value;
    const hasSelection = mode === 'Single Image' ? appState.singleHasSelection : appState.batchHasSelection;
    const disabled = appState.isPreparingQueueJob || !hasSelection;
    DOMElements.startButtons.forEach(btn => {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.6' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
}

function updateGenerationTypeUI() {
    const genType = getSelectedGenType();
    const isCustom = genType === 'custom';
    const isIllustrious = genType === 'illustrious';

    DOMElements.customPromptInput.style.display = isCustom ? 'block' : 'none';
    DOMElements.singleNegativeOutputGroup.hidden = !isIllustrious;
    DOMElements.batchNegativeOutputGroup.hidden = !isIllustrious;
    DOMElements.singleTextOutputLabel.textContent = isIllustrious ? 'Positive Prompt' : 'Generated Text';
    DOMElements.batchTextOutputLabel.textContent = isIllustrious ? 'Selected Image Positive Prompt' : 'Selected Image Text';

    if (!isIllustrious) {
        DOMElements.singleNegativeOutput.value = '';
        DOMElements.batchNegativeOutput.value = '';
    }
}

async function loadCustomPrompt() {
    try {
        const result = await window.electronAPI.getCustomPrompt();
        DOMElements.customPromptInput.value = result?.customPrompt || '';
    } catch (error) {
        console.error('Failed to load custom prompt:', error);
    }
}

async function saveCustomPromptNow() {
    if (appState.customPromptSaveTimer) {
        clearTimeout(appState.customPromptSaveTimer);
        appState.customPromptSaveTimer = null;
    }

    try {
        const result = await window.electronAPI.saveCustomPrompt(DOMElements.customPromptInput.value);
        DOMElements.customPromptInput.value = result?.customPrompt ?? DOMElements.customPromptInput.value;
        return true;
    } catch (error) {
        console.error('Failed to save custom prompt:', error);
        DOMElements.statusOutput.value = `Unable to save Custom prompt: ${error.message || error}`;
        return false;
    }
}

function scheduleCustomPromptSave() {
    if (appState.customPromptSaveTimer) {
        clearTimeout(appState.customPromptSaveTimer);
    }
    appState.customPromptSaveTimer = setTimeout(() => {
        saveCustomPromptNow();
    }, 500);
}

async function handleFileSelection(selection) {
    if (!selection) return;
    const url = typeof selection === 'string' ? selection : selection.url;
    if (url) {
        DOMElements.singleImagePreview.src = url + '?' + new Date().getTime();
        DOMElements.singleImagePreview.style.display = 'block';
        DOMElements.uploadPlaceholder.style.display = 'none';
        appState.singleHasSelection = true;
    }
    updateStartButtonState();
}

function isImageFile(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('image/')) return true;
    const name = (file.name || file.path || '').toLowerCase();
    return /\.(png|jpe?g|webp|gif|bmp|tiff?|heic|heif)$/.test(name);
}

function getDroppedFiles(event) {
    const dt = event?.dataTransfer;
    const files = [];
    if (dt?.files && dt.files.length > 0) {
        files.push(...Array.from(dt.files));
    }
    if (dt?.items && dt.items.length > 0) {
        for (const item of Array.from(dt.items)) {
            if (item.kind === 'file') {
                const f = item.getAsFile();
                if (f) files.push(f);
            }
        }
    }
    return files;
}

function getFilePath(file) {
    if (!file) return '';
    if (file.path) return file.path;
    if (window.electronAPI?.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || '';
    }
    return '';
}

async function handleBatchSelection(result) {
    if (result) {
        DOMElements.statusOutput.value = `Successfully staged ${result.count} files for processing:\n${result.filenames}`;
        appState.batchFilenamesText = result.filenames || '';
        appState.batchHasSelection = Array.isArray(result.paths) && result.paths.length > 0;
    }
    updateStartButtonState();
}

async function resetSelectedImages(mode) {
    await window.electronAPI.clearSelectedImages(mode);

    if (mode === 'Single Image') {
        appState.singleHasSelection = false;
        DOMElements.singleImagePreview.removeAttribute('src');
        DOMElements.singleImagePreview.style.display = 'none';
        DOMElements.uploadPlaceholder.style.display = 'flex';
        DOMElements.statusOutput.value = 'Single image selection reset.';
    } else {
        appState.batchHasSelection = false;
        appState.batchFilenamesText = '';
        DOMElements.statusOutput.value = 'Batch image selection reset.';
    }

    updateStartButtonState();
}

function updateCheckboxStates() {
    const isExternal = isExternalModelKey(appState.selectedModelKey);
    DOMElements.lowVramInput.disabled = isExternal;
}

function updateOutputFolderUI(preference) {
    if (!preference) return;
    appState.outputFolderPreference = preference;
    const hasCustomOutputRoot = !!preference.customOutputRoot;
    const currentName = hasCustomOutputRoot
        ? preference.customOutputRoot.split(/[\\/]/).filter(Boolean).pop()
        : 'Default';
    DOMElements.outputFolderButton.textContent = hasCustomOutputRoot
        ? `Reset output folder (Current - ${currentName})`
        : 'Select output folder (Current - Default)';
}

async function refreshOutputFolderPreference() {
    try {
        const preference = await window.electronAPI.getOutputFolderPreference();
        updateOutputFolderUI(preference);
    } catch (error) {
        console.error('Failed to load output folder preference:', error);
        DOMElements.outputFolderButton.textContent = 'Select output folder (Current - Unavailable)';
    }
}

async function handleOutputFolderButtonClick() {
    DOMElements.outputFolderButton.disabled = true;
    try {
        const currentPreference = appState.outputFolderPreference;
        const nextPreference = currentPreference?.customOutputRoot
            ? await window.electronAPI.clearOutputFolderPreference()
            : await window.electronAPI.selectOutputFolder();
        updateOutputFolderUI(nextPreference);
    } catch (error) {
        console.error('Failed to update output folder preference:', error);
        DOMElements.outputFolderButton.textContent = 'Select output folder (Current - Unavailable)';
    } finally {
        DOMElements.outputFolderButton.disabled = false;
    }
}

function showGenerationStartupStatus(modelKey) {
    clearStatusAnimation();
    const message = isExternalModelKey(modelKey)
        ? 'Connecting to the AI...'
        : 'Starting backend...';
    DOMElements.statusOutput.value = message;
    DOMElements.statusOutput.scrollTop = DOMElements.statusOutput.scrollHeight;
    DOMElements.progressBar.style.width = '0%';

    let dotCount = 1;
    const baseText = message.slice(0, -3);
    appState.statusAnimationInterval = setInterval(() => {
        DOMElements.statusOutput.value = baseText + '.'.repeat(dotCount);
        dotCount = (dotCount % 3) + 1;
    }, 400);
}

function updateQueueButtonLabels() {
    if (!DOMElements?.queueButtons) return;

    const count = appState.generationQueue.length;
    const label = count > 0 ? `Queue (${count})` : 'Queue';
    DOMElements.queueButtons.forEach(button => {
        button.textContent = label;
    });
}

function renderQueueModal() {
    if (!DOMElements?.queueList) return;

    updateQueueButtonLabels();
    DOMElements.queueList.innerHTML = '';
    DOMElements.queueEmptyState.style.display = appState.generationQueue.length === 0 ? 'block' : 'none';
    DOMElements.queueClearFinishedButton.disabled = !appState.generationQueue.some(job => isFinishedQueueStatus(job.status));

    appState.generationQueue.forEach((job, index) => {
        const row = document.createElement('div');
        row.className = 'queue-item';

        const details = document.createElement('div');
        details.className = 'queue-item-details';

        const title = document.createElement('div');
        title.className = 'queue-item-title';
        title.textContent = `${index + 1}. ${job.label}`;
        details.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'queue-item-meta';
        meta.textContent = job.error || getQueuedJobModelLabel(job.options, {
            lmStudio: getLmStudioModelDisplayName,
            ollama: getOllamaModelDisplayName,
        });
        details.appendChild(meta);

        const status = document.createElement('span');
        status.className = `queue-status-chip queue-status-${job.status}`;
        status.textContent = {
            pending: 'Pending',
            running: 'Running',
            completed: 'Completed',
            stopped: 'Stopped',
            failed: 'Failed',
        }[job.status] || job.status;

        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'gr-button-secondary queue-remove-button';
        action.dataset.jobId = job.id;
        action.textContent = 'Remove';
        action.hidden = job.status !== 'pending';

        row.appendChild(details);
        row.appendChild(status);
        row.appendChild(action);
        DOMElements.queueList.appendChild(row);
    });
}

function openQueueModal() {
    renderQueueModal();
    DOMElements.queueModalOverlay.classList.add('is-visible');
}

async function removePendingQueueJob(jobId) {
    const index = appState.generationQueue.findIndex(job => job.id === jobId && job.status === 'pending');
    if (index === -1) return;

    await window.electronAPI.discardPreparedGeneration(jobId);
    appState.generationQueue.splice(index, 1);
    renderQueueModal();
}

async function clearFinishedQueueJobs() {
    const finishedJobs = appState.generationQueue.filter(job => isFinishedQueueStatus(job.status));
    await Promise.all(finishedJobs.map(job => window.electronAPI.discardPreparedGeneration(job.id)));
    appState.generationQueue = appState.generationQueue.filter(job => !isFinishedQueueStatus(job.status));
    renderQueueModal();
}

function stopExternalHeartbeatForJob(job) {
    if (job?.options.desired_model_key === LM_STUDIO_MODEL_KEY) {
        stopLmStudioHeartbeat();
    } else if (job?.options.desired_model_key === OLLAMA_MODEL_KEY) {
        stopOllamaHeartbeat();
    }
}

function startExternalHeartbeatForJob(job) {
    if (job?.options.desired_model_key === LM_STUDIO_MODEL_KEY) {
        startLmStudioHeartbeat();
    } else if (job?.options.desired_model_key === OLLAMA_MODEL_KEY) {
        startOllamaHeartbeat();
    }
}

async function cleanupPreparedJob(jobId) {
    try {
        await window.electronAPI.discardPreparedGeneration(jobId);
    } catch (error) {
        console.error('Failed to discard prepared queue job:', error);
    }
}

async function finishActiveQueueJob(job, status, errorMessage = '') {
    if (!job || appState.activeQueueJobId !== job.id) return;

    job.status = status;
    job.error = errorMessage;
    await cleanupPreparedJob(job.id);
    startExternalHeartbeatForJob(job);
    appState.activeQueueJobId = null;
    setRunningState(false);
    renderQueueModal();
    processNextQueuedJob();
}

async function processNextQueuedJob() {
    if (appState.isRunning || appState.activeQueueJobId) return;

    const nextJob = appState.generationQueue.find(job => job.status === 'pending');
    if (!nextJob) {
        setRunningState(false);
        renderQueueModal();
        return;
    }

    nextJob.status = 'running';
    nextJob.error = '';
    appState.activeQueueJobId = nextJob.id;
    renderQueueModal();
    setRunningState(true);
    stopExternalHeartbeatForJob(nextJob);
    showGenerationStartupStatus(nextJob.options.desired_model_key);

    try {
        const outputFiles = await window.electronAPI.startPreparedGeneration({
            jobId: nextJob.id,
            options: nextJob.options,
        });
        nextJob.outputFiles = outputFiles || [];
        renderOutputPlaceholders(nextJob, nextJob.outputFiles);
    } catch (error) {
        clearStatusAnimation();
        DOMElements.statusOutput.value = `ERROR: \n${error.message || error}`;
        await finishActiveQueueJob(nextJob, 'failed', error.message || String(error));
    }
}

async function buildGenerationOptionsFromCurrentSelection() {
    const selectedGenType = getSelectedGenType();
    if (selectedGenType === 'custom') {
        const saved = await saveCustomPromptNow();
        if (!saved) return null;

        if (!DOMElements.customPromptInput.value.trim()) {
            DOMElements.statusOutput.value = 'Please enter a Custom Prompt before starting.';
            DOMElements.customPromptInput.focus();
            return null;
        }
    }

    if (!appState.selectedModelKey) {
        alert("Please select a model first.");
        return null;
    }

    const currentMode = document.querySelector('#mode-switch .switch-option.active').dataset.value;
    const hasSelection = currentMode === 'Single Image' ? appState.singleHasSelection : appState.batchHasSelection;
    if (!hasSelection) {
        DOMElements.statusOutput.value = currentMode === 'Single Image'
            ? 'Please select a single image before starting.'
            : 'Please select batch images before starting.';
        return null;
    }

    if (appState.selectedModelKey === LM_STUDIO_MODEL_KEY) {
        const result = await window.electronAPI.checkLmStudioConnection();
        if (!result.success) {
            updateLmStudioUI(false);
            alert("Connection to LM Studio lost. Please ensure LM Studio is running and retry connection.");
            return null;
        }
        if (!appState.selectedLmStudioModelKey) {
            alert("Please select an LM Studio model first.");
            DOMElements.modelSelectModalOverlay.classList.add('is-visible');
            await refreshLmStudioModels();
            return null;
        }
    }

    if (appState.selectedModelKey === OLLAMA_MODEL_KEY) {
        const result = await window.electronAPI.checkOllamaConnection();
        if (!result.success) {
            updateOllamaUI(false);
            alert("Connection to Ollama lost. Please ensure Ollama is running and retry connection.");
            return null;
        }
        if (!appState.selectedOllamaModelKey) {
            alert("Please select an Ollama model first.");
            DOMElements.modelSelectModalOverlay.classList.add('is-visible');
            await refreshOllamaModels();
            return null;
        }
    }

    return {
        mode: currentMode,
        gen_type: selectedGenType,
        trigger_words: document.getElementById('trigger-words-input').value,
        prompt_enrichment: document.getElementById('prompt-enrichment-input').value,
        custom_prompt: DOMElements.customPromptInput.value,
        max_words: DOMElements.customSlider.hiddenInput.value,
        single_paragraph: true,
        desired_model_key: appState.selectedModelKey,
        low_vram: DOMElements.lowVramInput.checked,
        preserve_original_names: DOMElements.preserveOriginalNamesInput.checked,
        lm_studio_model_key: appState.selectedLmStudioModelKey,
        ollama_model_key: appState.selectedOllamaModelKey,
    };
}

async function enqueueGenerationFlow() {
    if (appState.isPreparingQueueJob) return;

    const options = await buildGenerationOptionsFromCurrentSelection();
    if (!options) return;

    appState.isPreparingQueueJob = true;
    updateStartButtonState();
    DOMElements.statusOutput.value = 'Adding generation to queue...';

    try {
        const preparedJob = await window.electronAPI.prepareGenerationJob(options);
        const job = {
            id: preparedJob.jobId,
            options,
            label: getQueueJobLabel(options),
            status: 'pending',
            error: '',
            outputFiles: [],
        };

        appState.generationQueue.push(job);
        DOMElements.statusOutput.value = `Queued: ${job.label}`;
        renderQueueModal();
        processNextQueuedJob();
    } catch (error) {
        DOMElements.statusOutput.value = `ERROR: \n${error.message || error}`;
    } finally {
        appState.isPreparingQueueJob = false;
        updateStartButtonState();
    }
}

function updateModelStatusTexts() {
    const { modelOptionsPanel } = DOMElements;
    if (!modelOptionsPanel) return;

    const modelItems = modelOptionsPanel.querySelectorAll('.model-selector-item:not([data-model-key="Custom (LM Studio)"]):not([data-model-key="Custom (Ollama)"])');

    modelItems.forEach(item => {
        const modelKey = item.dataset.modelKey;
        const statusEl = item.querySelector('.model-status-text');
        if (!statusEl) return;

        if (appState.activeDownloads.has(modelKey)) return;

        if (statusEl.dataset.originalStatus !== undefined) {
            statusEl.textContent = statusEl.dataset.originalStatus;
            statusEl.className = 'model-status-text';
        }
    });
}

function formatExternalModelMeta(model) {
    const parts = [];
    if (model.params) parts.push(model.params);
    if (model.quantization) parts.push(model.quantization);
    if (model.loaded) parts.push('Loaded');
    return parts.join(' | ');
}

function updateSelectedModelValue() {
    DOMElements.selectedModelValue.textContent = appState.selectedModelKey
        ? getSelectedModelLabel(appState.selectedModelKey)
        : 'No models available';
}

function updateLmStudioStatusText() {
    const statusSpan = document.getElementById('lm-studio-status');
    if (!statusSpan) return;

    if (appState.lmStudioConnected) {
        statusSpan.textContent = appState.selectedLmStudioModelKey
            ? `Selected: ${getLmStudioModelDisplayName(appState.selectedLmStudioModelKey)}`
            : 'Connected';
        statusSpan.className = 'model-status-text connected';
        return;
    }

    appState.lmStudioDotCount = (appState.lmStudioDotCount % 3) + 1;
    const dots = '.'.repeat(appState.lmStudioDotCount);
    statusSpan.innerHTML = `Searching<span class="searching-dots">${dots}</span>`;
    statusSpan.className = 'model-status-text searching';
}

function updateOllamaStatusText() {
    const statusSpan = document.getElementById('ollama-status');
    if (!statusSpan) return;

    if (appState.ollamaConnected) {
        statusSpan.textContent = appState.selectedOllamaModelKey
            ? `Selected: ${getOllamaModelDisplayName(appState.selectedOllamaModelKey)}`
            : 'Connected';
        statusSpan.className = 'model-status-text connected';
        return;
    }

    appState.ollamaDotCount = (appState.ollamaDotCount % 3) + 1;
    const dots = '.'.repeat(appState.ollamaDotCount);
    statusSpan.innerHTML = `Searching<span class="searching-dots">${dots}</span>`;
    statusSpan.className = 'model-status-text searching';
}

function getExternalPanelConfig(kind) {
    if (kind === 'ollama') {
        return {
            selectedBackendKey: OLLAMA_MODEL_KEY,
            title: 'Ollama Models',
            connected: appState.ollamaConnected,
            models: appState.ollamaModels,
            selectedModelKey: appState.selectedOllamaModelKey,
            loadingModelKey: appState.ollamaLoadingModelKey,
            ejectingModelKey: appState.ollamaEjectingModelKey,
            error: appState.ollamaModelError,
            emptyText: 'No vision models found in Ollama.',
            onSelect: handleOllamaModelSelect,
            onEject: handleOllamaModelEject,
        };
    }

    return {
        selectedBackendKey: LM_STUDIO_MODEL_KEY,
        title: 'LM Studio Models',
        connected: appState.lmStudioConnected,
        models: appState.lmStudioModels,
        selectedModelKey: appState.selectedLmStudioModelKey,
        loadingModelKey: appState.lmStudioLoadingModelKey,
        ejectingModelKey: appState.lmStudioEjectingModelKey,
        error: appState.lmStudioModelError,
        emptyText: 'No vision models found in LM Studio.',
        onSelect: handleLmStudioModelSelect,
        onEject: handleLmStudioModelEject,
    };
}

function renderExternalModelPanel(kind) {
    const config = getExternalPanelConfig(kind);
    const { lmStudioModelPanel, lmStudioModelList, lmStudioModelPanelStatus } = DOMElements;
    if (!lmStudioModelPanel || !lmStudioModelList) return;

    const panelTitle = document.getElementById('external-model-panel-title');
    if (panelTitle) panelTitle.textContent = config.title;

    const shouldShow = appState.selectedModelKey === config.selectedBackendKey && config.connected;
    lmStudioModelPanel.hidden = !shouldShow;
    if (!shouldShow) {
        lmStudioModelList.innerHTML = '';
        if (lmStudioModelPanelStatus) lmStudioModelPanelStatus.textContent = '';
        return;
    }

    if (lmStudioModelPanelStatus) {
        lmStudioModelPanelStatus.textContent = '';
    }

    lmStudioModelList.innerHTML = '';

    if (config.error) {
        const error = document.createElement('div');
        error.className = 'lm-studio-model-empty error';
        error.textContent = config.error;
        lmStudioModelList.appendChild(error);
        return;
    }

    if (config.models.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'lm-studio-model-empty';
        empty.textContent = config.emptyText;
        lmStudioModelList.appendChild(empty);
        return;
    }

    config.models.forEach(model => {
        const item = document.createElement('div');
        item.className = 'lm-studio-model-item';
        item.dataset.modelKey = model.key;
        if (model.key === config.selectedModelKey) {
            item.classList.add('is-selected');
        }
        if (model.key === config.loadingModelKey) {
            item.classList.add('is-loading');
        }
        if (model.key === config.ejectingModelKey) {
            item.classList.add('is-loading');
        }

        const content = document.createElement('div');
        content.className = 'lm-studio-model-item-content';

        const title = document.createElement('span');
        title.className = 'lm-studio-model-name';
        title.textContent = model.displayName;

        const meta = document.createElement('span');
        meta.className = 'lm-studio-model-meta';
        meta.textContent = formatExternalModelMeta(model) || model.key;

        content.appendChild(title);
        content.appendChild(meta);

        const actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'lm-studio-model-action-button';
        actionButton.disabled = !!config.loadingModelKey || !!config.ejectingModelKey;
        if (model.key === config.loadingModelKey) {
            actionButton.textContent = 'Loading...';
            actionButton.disabled = true;
        } else if (model.key === config.ejectingModelKey) {
            actionButton.textContent = 'Ejecting...';
            actionButton.disabled = true;
        } else if (model.key === config.selectedModelKey) {
            actionButton.textContent = 'Eject';
            actionButton.classList.add('eject');
            actionButton.addEventListener('click', () => config.onEject(model));
        } else {
            actionButton.textContent = 'Select';
            actionButton.addEventListener('click', () => config.onSelect(model.key));
        }

        item.appendChild(content);
        item.appendChild(actionButton);
        lmStudioModelList.appendChild(item);
    });
}

function renderLmStudioModelPanel() {
    renderExternalModelPanel('lmStudio');
}

function renderOllamaModelPanel() {
    renderExternalModelPanel('ollama');
}

async function refreshLmStudioModels() {
    if (!appState.lmStudioConnected || !window.electronAPI?.getLmStudioModels) {
        renderLmStudioModelPanel();
        return;
    }

    appState.lmStudioModelError = '';
    const result = await window.electronAPI.getLmStudioModels();
    if (!result.success) {
        appState.lmStudioModels = [];
        appState.lmStudioModelError = result.error || 'Could not load LM Studio models.';
    } else {
        appState.lmStudioModels = result.models || [];
        if (
            appState.selectedLmStudioModelKey
            && !appState.lmStudioModels.some(model => model.key === appState.selectedLmStudioModelKey)
        ) {
            appState.selectedLmStudioModelKey = null;
        }
    }

    updateLmStudioStatusText();
    updateSelectedModelValue();
    renderLmStudioModelPanel();
}

async function handleLmStudioModelSelect(modelKey) {
    if (!modelKey || appState.lmStudioLoadingModelKey || appState.lmStudioEjectingModelKey) return;

    appState.selectedModelKey = LM_STUDIO_MODEL_KEY;
    appState.lmStudioLoadingModelKey = modelKey;
    appState.lmStudioModelError = '';
    updateSelectedModelValue();
    updateLmStudioStatusText();
    renderLmStudioModelPanel();

    const result = await window.electronAPI.loadLmStudioModel(modelKey);
    appState.lmStudioLoadingModelKey = null;

    if (!result.success) {
        appState.lmStudioModelError = result.error || 'Could not load selected LM Studio model.';
        renderLmStudioModelPanel();
        return;
    }

    appState.selectedLmStudioModelKey = modelKey;
    DOMElements.statusOutput.value = `LM Studio model loaded: ${getLmStudioModelDisplayName(modelKey)}`;
    await refreshLmStudioModels();
}

async function handleLmStudioModelEject(model) {
    if (!model?.key || appState.lmStudioLoadingModelKey || appState.lmStudioEjectingModelKey) return;

    appState.lmStudioEjectingModelKey = model.key;
    appState.lmStudioModelError = '';
    renderLmStudioModelPanel();

    const result = await window.electronAPI.unloadLmStudioModel({
        modelKey: model.key,
        instanceIds: model.loadedInstanceIds || [],
    });
    appState.lmStudioEjectingModelKey = null;

    if (!result.success) {
        appState.lmStudioModelError = result.error || 'Could not eject selected LM Studio model.';
        renderLmStudioModelPanel();
        return;
    }

    if (appState.selectedLmStudioModelKey === model.key) {
        appState.selectedLmStudioModelKey = null;
    }
    DOMElements.statusOutput.value = `LM Studio model ejected: ${model.displayName}`;
    await refreshLmStudioModels();
}

async function refreshOllamaModels() {
    if (!appState.ollamaConnected || !window.electronAPI?.getOllamaModels) {
        renderOllamaModelPanel();
        return;
    }

    appState.ollamaModelError = '';
    const result = await window.electronAPI.getOllamaModels();
    if (!result.success) {
        appState.ollamaModels = [];
        appState.ollamaModelError = result.error || 'Could not load Ollama models.';
    } else {
        appState.ollamaModels = result.models || [];
        if (
            appState.selectedOllamaModelKey
            && !appState.ollamaModels.some(model => model.key === appState.selectedOllamaModelKey)
        ) {
            appState.selectedOllamaModelKey = null;
        }
    }

    updateOllamaStatusText();
    updateSelectedModelValue();
    renderOllamaModelPanel();
}

async function handleOllamaModelSelect(modelKey) {
    if (!modelKey || appState.ollamaLoadingModelKey || appState.ollamaEjectingModelKey) return;

    appState.selectedModelKey = OLLAMA_MODEL_KEY;
    appState.ollamaLoadingModelKey = modelKey;
    appState.ollamaModelError = '';
    updateSelectedModelValue();
    updateOllamaStatusText();
    renderOllamaModelPanel();

    const result = await window.electronAPI.loadOllamaModel(modelKey);
    appState.ollamaLoadingModelKey = null;

    if (!result.success) {
        appState.ollamaModelError = result.error || 'Could not load selected Ollama model.';
        renderOllamaModelPanel();
        return;
    }

    appState.selectedOllamaModelKey = modelKey;
    DOMElements.statusOutput.value = `Ollama model loaded: ${getOllamaModelDisplayName(modelKey)}`;
    await refreshOllamaModels();
}

async function handleOllamaModelEject(model) {
    if (!model?.key || appState.ollamaLoadingModelKey || appState.ollamaEjectingModelKey) return;

    appState.ollamaEjectingModelKey = model.key;
    appState.ollamaModelError = '';
    renderOllamaModelPanel();

    const result = await window.electronAPI.unloadOllamaModel(model.key);
    appState.ollamaEjectingModelKey = null;

    if (!result.success) {
        appState.ollamaModelError = result.error || 'Could not eject selected Ollama model.';
        renderOllamaModelPanel();
        return;
    }

    if (appState.selectedOllamaModelKey === model.key) {
        appState.selectedOllamaModelKey = null;
    }
    DOMElements.statusOutput.value = `Ollama model ejected: ${model.displayName}`;
    await refreshOllamaModels();
}

// --- UI Population ---
async function populateModelList() {
    const models = await window.electronAPI.getModelAvailability();
    const { modelOptionsPanel } = DOMElements;

    modelOptionsPanel.innerHTML = '';
    let firstAvailableModel = null;

    models.forEach(model => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'model-selector-item';
        itemContainer.dataset.modelKey = model.key;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'model';
        input.id = `radio-${model.key.replace(/[\s().]/g, '')}`;
        input.value = model.key;
        input.style.display = 'none';

        const label = document.createElement('label');
        label.htmlFor = input.id;
        const displayName = getModelDisplayName(model.key);
        label.append(displayName);

        itemContainer.appendChild(input);
        itemContainer.appendChild(label);

        if (isExternalModelKey(model.key)) {
            if (!firstAvailableModel) firstAvailableModel = model.key;

            const statusSpan = document.createElement('span');
            statusSpan.id = model.key === LM_STUDIO_MODEL_KEY ? 'lm-studio-status' : 'ollama-status';
            statusSpan.className = 'model-status-text';
            itemContainer.appendChild(statusSpan);
        } else {
            input.disabled = !model.available;
            if (model.available && !firstAvailableModel) {
                firstAvailableModel = model.key;
            }

            const statusText = document.createElement('span');
            statusText.className = 'model-status-text';
            statusText.id = `status-${model.key.replace(/[\s().]/g, '')}`;

            if (model.available) {
                statusText.textContent = '';
                statusText.dataset.originalStatus = '';
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Delete';
                deleteButton.setAttribute('aria-label', `Delete ${displayName}`);
                deleteButton.className = 'delete-button';
                deleteButton.title = `Delete ${displayName}`;
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleDeleteClick(e);
                });
                itemContainer.appendChild(statusText);
                itemContainer.appendChild(deleteButton);
            } else {
                statusText.textContent = '';
                statusText.dataset.originalStatus = '';
                const downloadButton = document.createElement('button');
                downloadButton.textContent = 'Download';
                downloadButton.setAttribute('aria-label', `Download ${displayName}`);
                downloadButton.className = 'download-button';
                downloadButton.title = `Download ${displayName}`;

                if (appState.activeDownloads.has(model.key)) {
                    downloadButton.disabled = true;
                    downloadButton.textContent = 'Downloading...';
                    statusText.textContent = 'Downloading...';
                } else {
                    downloadButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleDownloadClick(e);
                    });
                }
                itemContainer.appendChild(statusText);
                itemContainer.appendChild(downloadButton);
            }

            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-container-inline';
            progressContainer.id = `progress-${model.key.replace(/[\s().]/g, '')}`;
            progressContainer.innerHTML = `<div class="progress-bar-inline"></div>`;
            itemContainer.appendChild(progressContainer);
        }

        modelOptionsPanel.appendChild(itemContainer);

        itemContainer.addEventListener('click', () => {
            if (input.disabled) return;
            const isLmStudio = model.key === LM_STUDIO_MODEL_KEY;
            const isOllama = model.key === OLLAMA_MODEL_KEY;
            appState.selectedModelKey = model.key;
            updateSelectedModelValue();
            document.querySelectorAll('.model-selector-item.is-selected').forEach(el => el.classList.remove('is-selected'));
            itemContainer.classList.add('is-selected');
            if (isLmStudio) {
                renderLmStudioModelPanel();
                if (appState.lmStudioConnected) {
                    refreshLmStudioModels();
                } else {
                    DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
                }
            } else if (isOllama) {
                renderOllamaModelPanel();
                if (appState.ollamaConnected) {
                    refreshOllamaModels();
                } else {
                    DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
                }
            } else {
                DOMElements.lmStudioModelPanel.hidden = true;
                DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
            }
            updateCheckboxStates();
            updateModelStatusTexts();
        });
    });

    if (!appState.selectedModelKey) {
        appState.selectedModelKey = firstAvailableModel;
    }
    updateSelectedModelValue();
    if (appState.selectedModelKey) {
        const selectedItem = modelOptionsPanel.querySelector(`.model-selector-item[data-model-key="${appState.selectedModelKey}"]`);
        if (selectedItem) selectedItem.classList.add('is-selected');
    }
    updateCheckboxStates();
    updateModelStatusTexts();
    startLmStudioHeartbeat();
    startOllamaHeartbeat();
}

function setupCustomSlider() {
    const slider = DOMElements.customSlider;
    const min = 1;
    const max = 300;
    let isDragging = false;

    const updateSliderFromEvent = (e) => {
        const rect = slider.container.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        const value = Math.round(min + percent * (max - min));
        setSliderValue(value);
    };

    const setSliderValue = (value) => {
        const percent = (value - min) / (max - min);
        slider.fill.style.width = `${percent * 100}%`;
        slider.valueText.textContent = value;
        slider.hiddenInput.value = value;
    };

    slider.container.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.body.classList.add('is-dragging');
        updateSliderFromEvent(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateSliderFromEvent(e);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.classList.remove('is-dragging');
        }
    });

    setSliderValue(parseInt(slider.hiddenInput.value, 10));
}



// --- Event Listeners ---
window.addEventListener('DOMContentLoaded', async () => {
    DOMElements = collectDOMElements();
    ({
        displaySingleTextOutput,
        displayBatchTextOutput,
        handleGalleryClick,
        renderOutputPlaceholders,
    } = createOutputController({
        appState,
        getDOMElements: () => DOMElements,
        getSelectedGenType,
    }));

    const logoSrc = await window.electronAPI.getPatreonLogo();
    if (logoSrc) DOMElements.aboutPatreonIcon.src = logoSrc;
    else DOMElements.aboutPatreonIcon.style.display = 'none';

    const iconSrc = await window.electronAPI.getAppIcon();
    if (iconSrc) {
        DOMElements.appIcon.src = iconSrc;
        DOMElements.aboutAppIcon.src = iconSrc;
        DOMElements.appIcon.addEventListener('click', () => window.electronAPI.openMainLink());
    } else {
        DOMElements.appIcon.style.display = 'none';
        DOMElements.aboutAppIcon.style.display = 'none';
    }

    const appInfo = await window.electronAPI.getAppInfo();
    if (appInfo) {
        DOMElements.aboutAppName.textContent = appInfo.productName || 'Caption Creator';
        DOMElements.aboutAppVersion.textContent = appInfo.version || 'Unknown';
        DOMElements.aboutAppAuthor.textContent = appInfo.author || 'Merserk';
    }

    // --- Custom Titlebar Controls ---
    document.getElementById('titlebar-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('titlebar-maximize').addEventListener('click', () => window.electronAPI.maximizeWindow());
    document.getElementById('titlebar-close').addEventListener('click', () => window.electronAPI.closeWindow());

    await populateModelList();
    setupCustomSlider();
    await refreshOutputFolderPreference();
    await loadCustomPrompt();
    updateGenerationTypeUI();

    const setupModalDismissal = (overlay, closeButton) => {
        closeButton.addEventListener('click', () => {
            overlay.classList.remove('is-visible');
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('is-visible');
            }
        });
    };

    DOMElements.configurationButton.addEventListener('click', () => {
        DOMElements.configurationModalOverlay.classList.add('is-visible');
    });
    setupModalDismissal(DOMElements.configurationModalOverlay, DOMElements.configurationModalCloseButton);
    setupModalDismissal(DOMElements.queueModalOverlay, DOMElements.queueModalCloseButton);
    DOMElements.queueButtons.forEach(btn => btn.addEventListener('click', openQueueModal));
    DOMElements.queueClearFinishedButton.addEventListener('click', clearFinishedQueueJobs);
    DOMElements.queueList.addEventListener('click', async (event) => {
        const removeButton = event.target.closest('.queue-remove-button');
        if (!removeButton) return;
        await removePendingQueueJob(removeButton.dataset.jobId);
    });
    DOMElements.outputFolderButton.addEventListener('click', handleOutputFolderButtonClick);
    DOMElements.customPromptInput.addEventListener('input', scheduleCustomPromptSave);

    DOMElements.aboutButton.addEventListener('click', () => {
        DOMElements.aboutModalOverlay.classList.add('is-visible');
    });
    setupModalDismissal(DOMElements.aboutModalOverlay, DOMElements.aboutModalCloseButton);
    DOMElements.aboutWebsiteButton.addEventListener('click', () => window.electronAPI.openMainLink());
    DOMElements.aboutOnlineButton.addEventListener('click', () => window.electronAPI.openOnlineLink());
    DOMElements.aboutPatreonButton.addEventListener('click', () => window.electronAPI.openPatreonLink());

    // --- Model Modal Event Listeners ---
    DOMElements.modelSelectButton.addEventListener('click', () => {
        DOMElements.modelSelectModalOverlay.classList.add('is-visible');
        if (appState.selectedModelKey === LM_STUDIO_MODEL_KEY) {
            renderLmStudioModelPanel();
        } else if (appState.selectedModelKey === OLLAMA_MODEL_KEY) {
            renderOllamaModelPanel();
        } else {
            DOMElements.lmStudioModelPanel.hidden = true;
        }
        if (appState.selectedModelKey === LM_STUDIO_MODEL_KEY && appState.lmStudioConnected) {
            refreshLmStudioModels();
        } else if (appState.selectedModelKey === OLLAMA_MODEL_KEY && appState.ollamaConnected) {
            refreshOllamaModels();
        }
    });
    DOMElements.modelModalCloseButton.addEventListener('click', () => {
        DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
    });
    DOMElements.modelSelectModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOMElements.modelSelectModalOverlay) {
            DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
        }
    });



    function updateSwitchGlider(container, activeOption) {
        const glider = container.querySelector('.switch-glider');
        if (!glider || !activeOption) return;

        glider.style.width = `${activeOption.offsetWidth}px`;
        glider.style.height = `${activeOption.offsetHeight}px`;
        glider.style.left = `${activeOption.offsetLeft}px`;
        glider.style.top = `${activeOption.offsetTop}px`;
    }

    function setupSwitches() {
        document.querySelectorAll('.switch-container').forEach(container => {
            const initialActive = container.querySelector('.switch-option.active');
            updateSwitchGlider(container, initialActive);

            container.addEventListener('click', async (e) => {
                const clickedOption = e.target.closest('.switch-option');
                if (!clickedOption || clickedOption.classList.contains('active')) return;

                updateSwitchGlider(container, clickedOption);

                container.querySelector('.switch-option.active')?.classList.remove('active');
                clickedOption.classList.add('active');

                if (container.id === 'mode-switch') {
                    const isSingleMode = clickedOption.dataset.value === 'Single Image';
                    DOMElements.singleUploadBox.style.display = isSingleMode ? 'flex' : 'none';
                    DOMElements.batchUploadBox.style.display = isSingleMode ? 'none' : 'flex';

                    DOMElements.singleImageOutput.style.display = isSingleMode ? 'block' : 'none';
                    DOMElements.batchGalleryOutput.style.display = isSingleMode ? 'none' : 'grid';

                    DOMElements.singleTextGroup.style.display = isSingleMode ? 'block' : 'none';
                    DOMElements.batchTextGroup.style.display = isSingleMode ? 'none' : 'block';

                    if (isSingleMode) {
                        DOMElements.statusOutput.value = appState.singleHasSelection
                            ? 'Single Image mode selected. Using previously selected image.'
                            : 'Single Image mode selected. Please choose an image.';
                    } else {
                        DOMElements.statusOutput.value = appState.batchHasSelection
                            ? `Batch Processing mode selected. Using previously staged files:\n${appState.batchFilenamesText}`
                            : 'Batch Processing mode selected. Please choose batch images.';
                    }

                    updateStartButtonState();
                } else if (container.id === 'gen-type-switch') {
                    updateGenerationTypeUI();
                }
            });
        });
    }
    setupSwitches();
    updateStartButtonState();
    updateQueueButtonLabels();

    window.addEventListener('dragover', (event) => {
        event.preventDefault();
    });
    window.addEventListener('drop', (event) => {
        event.preventDefault();
    });

    window.addEventListener('resize', () => {
        document.querySelectorAll('.switch-container').forEach(container => {
            const activeOption = container.querySelector('.switch-option.active');
            updateSwitchGlider(container, activeOption);
        });
    });

    const uploadBox = DOMElements.singleUploadBox;
    uploadBox.addEventListener('click', async () => {
        const newPath = await window.electronAPI.openFileDialog();
        await handleFileSelection(newPath);
    });
    uploadBox.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadBox.classList.add('drag-over');
    });
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });
    uploadBox.addEventListener('drop', async (event) => {
        event.preventDefault();
        uploadBox.classList.remove('drag-over');
        const files = getDroppedFiles(event);
        const imageFile = files.find(isImageFile);
        if (imageFile) {
            const filePath = getFilePath(imageFile);
            const newPath = await window.electronAPI.handleDroppedFile(filePath);
            await handleFileSelection(newPath);
        }
    });
    uploadBox.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        await resetSelectedImages('Single Image');
    });

    DOMElements.batchUploadBox.addEventListener('click', async () => {
        const result = await window.electronAPI.openBatchDialog();
        await handleBatchSelection(result);
    });
    DOMElements.batchUploadBox.addEventListener('dragover', (event) => { event.preventDefault(); DOMElements.batchUploadBox.classList.add('drag-over'); });
    DOMElements.batchUploadBox.addEventListener('dragleave', () => { DOMElements.batchUploadBox.classList.remove('drag-over'); });
    DOMElements.batchUploadBox.addEventListener('drop', async (event) => {
        event.preventDefault();
        DOMElements.batchUploadBox.classList.remove('drag-over');
        const imagePaths = Array.from(new Set(
            getDroppedFiles(event)
                .filter(isImageFile)
                .map(f => getFilePath(f))
                .filter(Boolean)
        ));
        if (imagePaths.length > 0) {
            const result = await window.electronAPI.handleDroppedBatch(imagePaths);
            await handleBatchSelection(result);
        }
    });
    DOMElements.batchUploadBox.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        await resetSelectedImages('Batch Processing');
    });

    DOMElements.startButtons.forEach(btn => btn.addEventListener('click', enqueueGenerationFlow));
    DOMElements.stopButtons.forEach(btn => btn.addEventListener('click', () => window.electronAPI.stopGeneration()));

    DOMElements.copyButton.addEventListener('click', () => {
        const copyText = appState.singleOutputGenType === 'illustrious'
            ? formatIllustriousClipboardText(DOMElements.singleTextOutput.value, DOMElements.singleNegativeOutput.value)
            : DOMElements.singleTextOutput.value;
        navigator.clipboard.writeText(copyText);
        DOMElements.copyButton.textContent = 'Copied!';
        DOMElements.copyButton.classList.add('copied-success');
        setTimeout(() => { DOMElements.copyButton.textContent = 'Copy to Clipboard'; DOMElements.copyButton.classList.remove('copied-success'); }, 2000);
    });
    DOMElements.copyButtonBatch.addEventListener('click', () => {
        const copyText = appState.batchOutputGenType === 'illustrious'
            ? formatIllustriousClipboardText(DOMElements.batchTextOutput.value, DOMElements.batchNegativeOutput.value)
            : DOMElements.batchTextOutput.value;
        navigator.clipboard.writeText(copyText);
        DOMElements.copyButtonBatch.textContent = 'Copied!';
        DOMElements.copyButtonBatch.classList.add('copied-success');
        setTimeout(() => { DOMElements.copyButtonBatch.textContent = 'Copy to Clipboard'; DOMElements.copyButtonBatch.classList.remove('copied-success'); }, 2000);
    });
    DOMElements.downloadZipButton.addEventListener('click', async () => {
        DOMElements.statusOutput.value = 'Creating ZIP archive...';
        const result = await window.electronAPI.createZipArchive(appState.latestOutputJobId);
        DOMElements.statusOutput.value = result.message;
    });
    DOMElements.openFolderSingle.addEventListener('click', () => window.electronAPI.openOutputFolder());
    DOMElements.openFolderBatch.addEventListener('click', () => window.electronAPI.openOutputFolder());

    window.addEventListener('paste', async (event) => {
        const isSingleMode = document.querySelector('#mode-switch .switch-option.active').dataset.value === 'Single Image';
        if (!isSingleMode) {
            return;
        }

        const items = event.clipboardData.items;
        let imageFile = null;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                imageFile = item.getAsFile();
                break;
            }
        }

        if (imageFile) {
            event.preventDefault();

            try {
                const arrayBuffer = await imageFile.arrayBuffer();
                const newPath = await window.electronAPI.handlePastedImage(arrayBuffer);

                if (newPath) {
                    await handleFileSelection(newPath);
                }
            } catch (error) {
                console.error('Failed to handle pasted image:', error);
            }
        }
    });
});


async function startGenerationFlow() {
    return enqueueGenerationFlow();
}

// --- IPC Event Handlers (from Main) ---
window.electronAPI.onStatusUpdate(payload => {
    const { jobId, message } = normalizeJobPayload(payload, appState);
    if (jobId && appState.activeQueueJobId && jobId !== appState.activeQueueJobId) return;

    clearStatusAnimation();
    DOMElements.statusOutput.value = message;
    DOMElements.statusOutput.scrollTop = DOMElements.statusOutput.scrollHeight;

    if (message.includes("Starting backend")) DOMElements.progressBar.style.width = '0%';
    if (message.includes("Connecting to the AI")) DOMElements.progressBar.style.width = '0%';
    if (message.includes("Connection successful")) DOMElements.progressBar.style.width = '10%';
    if (message.includes("Task complete!")) DOMElements.progressBar.style.width = '100%';

    if (message.endsWith('...')) {
        let dotCount = 1;
        const baseText = message.slice(0, -3);
        appState.statusAnimationInterval = setInterval(() => {
            DOMElements.statusOutput.value = baseText + '.'.repeat(dotCount);
            dotCount = (dotCount % 3) + 1;
        }, 400);
    }
});

window.electronAPI.onProgressUpdate(payload => {
    const { jobId, data } = normalizeJobPayload(payload, appState);
    if (jobId && appState.activeQueueJobId && jobId !== appState.activeQueueJobId) return;

    clearStatusAnimation();
    const progressPercentage = 10 + (data.percentage * 0.9);
    DOMElements.progressBar.style.width = `${progressPercentage}%`;
    const statusString = `Processing [${data.current}/${data.total}] (${Math.round(data.percentage)}%) | Time/img: ${data.time_per_img.toFixed(1)}s | Elapsed: ${formatSeconds(data.elapsed)} | ETA: ${formatSeconds(data.eta)}`;
    DOMElements.statusOutput.value = statusString;
});

window.electronAPI.onImageComplete(payload => {
    const { jobId, data } = normalizeJobPayload(payload, appState);
    if (jobId && appState.activeQueueJobId && jobId !== appState.activeQueueJobId) return;

    const imageToUnblur = DOMElements.batchGalleryOutput.querySelector(`img:nth-child(${data.index})`);
    if (imageToUnblur) {
        imageToUnblur.classList.remove('blurred');
        if (data.index === 1) {
            imageToUnblur.click();
        }
    }
});

window.electronAPI.onGenerationComplete(async (payload) => {
    const { jobId } = normalizeJobPayload(payload, appState);
    const job = getQueueJob(appState, jobId);
    if (!job || appState.activeQueueJobId !== job.id) return;

    clearStatusAnimation();

    if (job.options.mode === 'Single Image') {
        DOMElements.statusOutput.value = `Task complete! ${job.label}`;
        const outputFiles = await window.electronAPI.getOutputFiles(job.id);
        if (outputFiles.length > 0) {
            DOMElements.singleImageOutput.classList.remove('blurred');
            DOMElements.singleImageOutput.src = outputFiles[0] + '?' + new Date().getTime();
            const textContent = await window.electronAPI.getTextContent(outputFiles[0]);
            displaySingleTextOutput(textContent, job.options.gen_type);
        }
    } else {
        DOMElements.statusOutput.value = `Task complete! ${job.label}`;
    }

    await finishActiveQueueJob(job, 'completed');
});

window.electronAPI.onGenerationError(async (payload) => {
    const { jobId, message } = normalizeJobPayload(payload, appState);
    const job = getQueueJob(appState, jobId);
    if (!job || appState.activeQueueJobId !== job.id) return;

    clearStatusAnimation();
    DOMElements.statusOutput.value = `ERROR: \n${message}`;
    await finishActiveQueueJob(job, 'failed', message);
});

window.electronAPI.onGenerationStopped(async (payload) => {
    const { jobId } = normalizeJobPayload(payload, appState);
    const job = getQueueJob(appState, jobId);
    if (!job || appState.activeQueueJobId !== job.id) return;

    clearStatusAnimation();
    DOMElements.statusOutput.value += '\nStop requested by user...';
    await finishActiveQueueJob(job, 'stopped');
});

// --- Download & Delete Handlers ---
async function handleDownloadClick(event) {
    const button = event.currentTarget;
    const itemContainer = button.closest('.model-selector-item');
    const modelKey = itemContainer.dataset.modelKey;

    button.style.display = 'none';
    const progressContainer = itemContainer.querySelector('.progress-container-inline');
    if (progressContainer) {
        progressContainer.style.display = 'block';
    }

    button.disabled = true;
    appState.activeDownloads.add(modelKey);

    const statusEl = document.getElementById(`status-${modelKey.replace(/[\s().]/g, '')}`);
    if (statusEl) statusEl.textContent = 'Starting...';

    try {
        await window.electronAPI.downloadModel(modelKey);
    } catch (e) {
        console.error(`Download invocation failed for ${modelKey}`, e);
    }
}

async function handleDeleteClick(event) {
    const button = event.currentTarget;
    const modelKey = button.closest('.model-selector-item').dataset.modelKey;

    const displayName = getModelDisplayName(modelKey);
    const confirmed = confirm(`Are you sure you want to delete the model "${displayName}"?\nThis action cannot be undone.`);

    if (confirmed) {
        DOMElements.statusOutput.value = `Deleting ${displayName}...`;
        const result = await window.electronAPI.deleteModel(modelKey);
        if (result.success) {
            DOMElements.statusOutput.value = `Successfully deleted ${displayName}.`;
            if (appState.selectedModelKey === modelKey) {
                appState.selectedModelKey = null;
            }
        } else {
            DOMElements.statusOutput.value = `Error deleting ${displayName}: ${result.message}`;
        }
        await populateModelList();
    }
}

window.electronAPI.onDownloadStatus(data => {
    const statusEl = document.getElementById(`status-${data.modelKey.replace(/[\s().]/g, '')}`);
    const title = getDownloadItemDisplayName(data);
    const message = formatDownloadStatusMessage(data);

    if (statusEl) statusEl.textContent = message;
    DOMElements.statusOutput.value = `[${title}] ${message}`;
});

window.electronAPI.onDownloadProgress(data => {
    clearStatusAnimation();
    const progressContainer = document.getElementById(`progress-${data.modelKey.replace(/[\s().]/g, '')}`);
    const progressBar = progressContainer?.querySelector('.progress-bar-inline');
    const statusEl = document.getElementById(`status-${data.modelKey.replace(/[\s().]/g, '')}`);

    if (progressBar) {
        progressContainer.style.display = 'block';
        progressBar.style.width = `${data.percentage}%`;
    }
    if (statusEl) {
        statusEl.textContent = `Downloading ${Math.round(data.percentage)}%`;
    }

    const speed = data.speed_mbps.toFixed(2);
    const downloaded = data.downloaded_mb.toFixed(1);
    const total = data.total_mb.toFixed(1);
    const eta = formatSeconds(data.eta_s);
    const title = getDownloadItemDisplayName(data);

    DOMElements.statusOutput.value = `${title} | ${Math.round(data.percentage)}% | ${speed} MB/s | ${downloaded}/${total} MB | ETA: ${eta}`;
});

window.electronAPI.onDownloadComplete(async (data) => {
    const displayName = getModelDisplayName(data.modelKey);
    DOMElements.statusOutput.value = `Download complete for ${displayName}! Ready to use.`;
    appState.activeDownloads.delete(data.modelKey);
    appState.selectedModelKey = data.modelKey;
    await populateModelList();
});

window.electronAPI.onDownloadError(async (data) => {
    const displayName = getModelDisplayName(data.modelKey);
    DOMElements.statusOutput.value = `ERROR downloading ${displayName}: \n${data.message}`;
    appState.activeDownloads.delete(data.modelKey);
    await populateModelList();
});

function updateLmStudioUI(connected) {
    const wasConnected = appState.lmStudioConnected;
    const isSelected = appState.selectedModelKey === LM_STUDIO_MODEL_KEY;

    if (connected) {
        appState.lmStudioConnected = true;
        updateLmStudioStatusText();
        if (isSelected) {
            renderLmStudioModelPanel();
        }
        if (!wasConnected && isSelected) {
            refreshLmStudioModels();
        }
    } else {
        appState.lmStudioConnected = false;
        appState.lmStudioModels = [];
        appState.lmStudioModelError = '';
        appState.lmStudioLoadingModelKey = null;
        appState.lmStudioEjectingModelKey = null;
        updateLmStudioStatusText();
        if (isSelected) {
            renderLmStudioModelPanel();
        }
    }
}

function updateOllamaUI(connected) {
    const wasConnected = appState.ollamaConnected;
    const isSelected = appState.selectedModelKey === OLLAMA_MODEL_KEY;

    if (connected) {
        appState.ollamaConnected = true;
        updateOllamaStatusText();
        if (isSelected) {
            renderOllamaModelPanel();
        }
        if (!wasConnected && isSelected) {
            refreshOllamaModels();
        }
    } else {
        appState.ollamaConnected = false;
        appState.ollamaModels = [];
        appState.ollamaModelError = '';
        appState.ollamaLoadingModelKey = null;
        appState.ollamaEjectingModelKey = null;
        updateOllamaStatusText();
        if (isSelected) {
            renderOllamaModelPanel();
        }
    }
}

function startLmStudioHeartbeat() {
    if (appState.lmStudioHeartbeatInterval) {
        clearTimeout(appState.lmStudioHeartbeatInterval);
        appState.lmStudioHeartbeatInterval = null;
    }

    const check = async () => {
        const result = await window.electronAPI.checkLmStudioConnection();
        updateLmStudioUI(result.success);
        
        const nextInterval = appState.lmStudioConnected ? 5000 : 1000;
        appState.lmStudioHeartbeatInterval = setTimeout(check, nextInterval);
    };

    check();
}

function startOllamaHeartbeat() {
    if (appState.ollamaHeartbeatInterval) {
        clearTimeout(appState.ollamaHeartbeatInterval);
        appState.ollamaHeartbeatInterval = null;
    }

    const check = async () => {
        const result = await window.electronAPI.checkOllamaConnection();
        updateOllamaUI(result.success);

        const nextInterval = appState.ollamaConnected ? 5000 : 1000;
        appState.ollamaHeartbeatInterval = setTimeout(check, nextInterval);
    };

    check();
}

function stopLmStudioHeartbeat() {
    if (appState.lmStudioHeartbeatInterval) {
        clearTimeout(appState.lmStudioHeartbeatInterval);
        appState.lmStudioHeartbeatInterval = null;
    }
}

function stopOllamaHeartbeat() {
    if (appState.ollamaHeartbeatInterval) {
        clearTimeout(appState.ollamaHeartbeatInterval);
        appState.ollamaHeartbeatInterval = null;
    }
}
