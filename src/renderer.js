let DOMElements;

// --- App State ---
const appState = {
    activeDownloads: new Set(),
    lmStudioConnected: false,
    statusAnimationInterval: null,
    lmStudioHeartbeatInterval: null,
    selectedModelKey: null,
    lmStudioDotCount: 0,
    singleOriginalPath: null,
    batchOriginalPaths: [],
    batchFilenamesText: '',
    singleHasSelection: false,
    batchHasSelection: false,
    isRunning: false,
};

// --- Helper Functions ---
function formatSeconds(seconds) {
    if (seconds === null || seconds === undefined) return '--s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
}

function clearStatusAnimation() {
    if (appState.statusAnimationInterval) {
        clearInterval(appState.statusAnimationInterval);
        appState.statusAnimationInterval = null;
    }
}

function setRunningState(isRunning) {
    appState.isRunning = isRunning;
    DOMElements.startButtons.forEach(btn => btn.style.display = isRunning ? 'none' : 'block');
    DOMElements.stopButtons.forEach(btn => btn.style.display = isRunning ? 'block' : 'none');

    DOMElements.progressBarContainer.style.display = isRunning ? 'block' : 'none';
    if (!isRunning) {
        DOMElements.progressBar.style.width = '0%';
        setTimeout(() => { // Add a delay before hiding the bar
            if (DOMElements.startButtons[0].style.display === 'block') { // ensure it's still stopped
                DOMElements.progressBarContainer.style.display = 'none';
            }
        }, 1500);
    }

    updateStartButtonState();
    toggleInputInteractivity(!isRunning);
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
    const disabled = appState.isRunning || !hasSelection;
    DOMElements.startButtons.forEach(btn => {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.6' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
}

async function handleFileSelection(selection) {
    if (!selection) return;
    const url = typeof selection === 'string' ? selection : selection.url;
    const originalPath = typeof selection === 'string' ? null : selection.originalPath;
    if (url) {
        DOMElements.singleImagePreview.src = url + '?' + new Date().getTime();
        DOMElements.singleImagePreview.style.display = 'block';
        DOMElements.uploadPlaceholder.style.display = 'none';
        appState.singleHasSelection = true;
    }
    if (originalPath) {
        appState.singleOriginalPath = originalPath;
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
        appState.batchOriginalPaths = Array.isArray(result.paths) ? result.paths : [];
        appState.batchFilenamesText = result.filenames || '';
        appState.batchHasSelection = appState.batchOriginalPaths.length > 0;
    }
    updateStartButtonState();
}

function updateCheckboxStates() {
    const isLmStudio = appState.selectedModelKey === 'Custom (LM Studio)';
    DOMElements.lowVramInput.disabled = isLmStudio;
    DOMElements.keepModelLoadedInput.disabled = isLmStudio;
}

// NEW: Updates the status text for all models based on the current selection
function updateModelStatusTexts() {
    const { modelOptionsPanel } = DOMElements;
    if (!modelOptionsPanel) return;

    const modelItems = modelOptionsPanel.querySelectorAll('.model-selector-item:not([data-model-key="Custom (LM Studio)"])');

    modelItems.forEach(item => {
        const modelKey = item.dataset.modelKey;
        const statusEl = item.querySelector('.model-status-text');
        if (!statusEl) return;

        // Reset to its default state first
        if (statusEl.dataset.originalStatus) {
            statusEl.innerHTML = statusEl.dataset.originalStatus;
            statusEl.className = 'model-status-text'; // Reset classes
        }

        // Apply 'current' state if it's the selected model
        if (modelKey === appState.selectedModelKey) {
            statusEl.innerHTML = '(Current)';
            statusEl.classList.add('current');
        }
    });
}

// --- UI Population ---
async function populateModelList() {
    const models = await window.electronAPI.getModelAvailability();
    const { modelOptionsPanel, selectedModelValue } = DOMElements;

    modelOptionsPanel.innerHTML = '';
    let firstAvailableModel = null;

    models.forEach(model => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'model-selector-item';
        itemContainer.dataset.modelKey = model.key;

        const input = document.createElement('input'); // Keep hidden input for state
        input.type = 'radio';
        input.name = 'model';
        input.id = `radio-${model.key.replace(/[\s().]/g, '')}`;
        input.value = model.key;
        input.style.display = 'none';

        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.append(model.key);

        itemContainer.appendChild(input);
        itemContainer.appendChild(label);

        if (model.key === "Custom (LM Studio)") {
            if (!firstAvailableModel) firstAvailableModel = model.key;

            const statusSpan = document.createElement('span');
            statusSpan.id = 'lm-studio-status';
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
                const availableHTML = `(<span class="available-text">Available</span>)`;
                statusText.innerHTML = availableHTML;
                statusText.dataset.originalStatus = availableHTML;
                const deleteButton = document.createElement('button');
                deleteButton.innerHTML = '🗑️';
                deleteButton.className = 'delete-button';
                deleteButton.title = `Delete ${model.key}`;
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleDeleteClick(e);
                });
                itemContainer.appendChild(statusText);
                itemContainer.appendChild(deleteButton);
            } else {
                const notDownloadedText = '(Not Downloaded)';
                statusText.textContent = notDownloadedText;
                statusText.dataset.originalStatus = notDownloadedText;
                const downloadButton = document.createElement('button');
                downloadButton.innerHTML = '📥';
                downloadButton.className = 'download-button';
                downloadButton.title = `Download ${model.key}`;

                if (appState.activeDownloads.has(model.key)) {
                    downloadButton.disabled = true;
                    statusText.textContent = '(Downloading...)';
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

        // Add click listener to the entire item
        itemContainer.addEventListener('click', () => {
            if (input.disabled) return;
            appState.selectedModelKey = model.key;
            selectedModelValue.textContent = model.key;
            document.querySelectorAll('.model-selector-item.is-selected').forEach(el => el.classList.remove('is-selected'));
            itemContainer.classList.add('is-selected');
            DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
            updateCheckboxStates();
            updateModelStatusTexts();
        });
    });

    // Set initial selection
    if (!appState.selectedModelKey) {
        appState.selectedModelKey = firstAvailableModel;
    }
    selectedModelValue.textContent = appState.selectedModelKey || 'No models available';
    if (appState.selectedModelKey) {
        const selectedItem = modelOptionsPanel.querySelector(`.model-selector-item[data-model-key="${appState.selectedModelKey}"]`);
        if (selectedItem) selectedItem.classList.add('is-selected');
    }
    updateCheckboxStates();
    updateModelStatusTexts();
    startLmStudioHeartbeat(); // Start auto-connection management
}

// NEW: Setup for the custom Max Words slider
function setupCustomSlider() {
    const slider = DOMElements.customSlider;
    const min = 1;
    const max = 300;
    let isDragging = false;

    const updateSliderFromEvent = (e) => {
        const rect = slider.container.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent)); // Clamp between 0 and 1
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

    // Initialize
    setSliderValue(parseInt(slider.hiddenInput.value, 10));
}



// --- Event Listeners ---
window.addEventListener('DOMContentLoaded', async () => {
    DOMElements = {
        batchUploadColumn: document.getElementById('batch-upload-column'),
        singleTextGroup: document.getElementById('single-text-group'),
        batchTextGroup: document.getElementById('batch-text-group'),
        singleUploadBox: document.getElementById('single-upload-box'),
        uploadPlaceholder: document.getElementById('upload-placeholder'),
        singleImagePreview: document.getElementById('single-image-preview'),
        batchUploadBox: document.getElementById('batch-upload-box'),
        startButtons: document.querySelectorAll('.start-button'),
        stopButtons: document.querySelectorAll('.stop-button'),
        statusOutput: document.getElementById('status-output'),
        progressBar: document.getElementById('progress-bar'),
        progressBarContainer: document.getElementById('progress-bar-container'),
        singleImageOutput: document.getElementById('single-image-output'),
        singleTextOutput: document.getElementById('single-text-output'),
        batchGalleryOutput: document.getElementById('batch-gallery-output'),
        batchTextOutput: document.getElementById('batch-text-output'),
        copyButton: document.getElementById('copy-button'),
        copyButtonBatch: document.getElementById('copy-button-batch'),
        openFolderSingle: document.getElementById('open-folder-button-single'),
        openFolderBatch: document.getElementById('open-folder-button-batch'),
        downloadZipButton: document.getElementById('download-zip-button'),
        lowVramInput: document.getElementById('low-vram-input'),
        keepModelLoadedInput: document.getElementById('keep-model-loaded-input'),
        patreonLogo: document.getElementById('patreon-logo'),
        appIcon: document.getElementById('app-icon'),
        // Model selection elements
        modelSelectGroup: document.getElementById('model-select-group'),
        modelSelectButton: document.getElementById('model-select-button'),
        // REMOVED: modelButtonIcon is no longer in the HTML
        selectedModelValue: document.getElementById('selected-model-value'),
        modelSelectModalOverlay: document.getElementById('model-select-modal-overlay'),
        modelModalCloseButton: document.getElementById('model-modal-close-button'),
        modelOptionsPanel: document.getElementById('model-options-panel'),
        repeatsInput: document.getElementById('repeats-input'),
        modeSwitch: document.getElementById('mode-switch'),
        genTypeSwitch: document.getElementById('gen-type-switch'),
        // Custom slider elements
        customSlider: {
            container: document.getElementById('custom-slider-container'),
            fill: document.getElementById('custom-slider-fill'),
            valueText: document.getElementById('custom-slider-value'),
            maxText: document.getElementById('custom-slider-max'),
            hiddenInput: document.getElementById('max-words-value'),
        },
    };

    // Set logo source and click listener
    const logoSrc = await window.electronAPI.getPatreonLogo();
    if (logoSrc) DOMElements.patreonLogo.src = logoSrc;
    else DOMElements.patreonLogo.style.display = 'none';
    DOMElements.patreonLogo.addEventListener('click', () => window.electronAPI.openPatreonLink());

    // Set app icon sources
    const iconSrc = await window.electronAPI.getAppIcon();
    if (iconSrc) {
        DOMElements.appIcon.src = iconSrc;
        DOMElements.appIcon.addEventListener('click', () => window.electronAPI.openMainLink());
        // REMOVED: Logic for modelButtonIcon
    } else {
        DOMElements.appIcon.style.display = 'none';
        // REMOVED: Logic for modelButtonIcon
    }

    // --- Custom Titlebar Controls ---
    document.getElementById('titlebar-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('titlebar-maximize').addEventListener('click', () => window.electronAPI.maximizeWindow());
    document.getElementById('titlebar-close').addEventListener('click', () => window.electronAPI.closeWindow());
    document.getElementById('titlebar-online').addEventListener('click', () => window.electronAPI.openOnlineLink());

    await populateModelList();
    setupCustomSlider();

    // --- Model Modal Event Listeners ---
    DOMElements.modelSelectButton.addEventListener('click', () => {
        DOMElements.modelSelectModalOverlay.classList.add('is-visible');
    });
    DOMElements.modelModalCloseButton.addEventListener('click', () => {
        DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
    });
    DOMElements.modelSelectModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOMElements.modelSelectModalOverlay) {
            DOMElements.modelSelectModalOverlay.classList.remove('is-visible');
        }
    });



    // Setup switch components
    function setupSwitches() {
        document.querySelectorAll('.switch-container').forEach(container => {
            const glider = container.querySelector('.switch-glider');
            const initialActive = container.querySelector('.switch-option.active');

            // Set initial position of glider
            if (glider && initialActive) {
                glider.style.width = `${initialActive.offsetWidth}px`;
                glider.style.left = `${initialActive.offsetLeft}px`;
            }

            container.addEventListener('click', async (e) => {
                const clickedOption = e.target.closest('.switch-option');
                if (!clickedOption || clickedOption.classList.contains('active')) return;

                // Move glider
                if (glider) {
                    glider.style.width = `${clickedOption.offsetWidth}px`;
                    glider.style.left = `${clickedOption.offsetLeft}px`;
                }

                // Update active class
                container.querySelector('.switch-option.active')?.classList.remove('active');
                clickedOption.classList.add('active');

                // Handle mode-specific UI changes
                if (container.id === 'mode-switch') {
                    if (appState.isRunning) {
                        DOMElements.statusOutput.value = 'Please wait until the current process finishes.';
                        return;
                    }
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
                }
            });
        });
    }
    setupSwitches();
    updateStartButtonState();

    // Prevent the browser/electron default "navigate to file" behavior on drop.
    window.addEventListener('dragover', (event) => {
        event.preventDefault();
    });
    window.addEventListener('drop', (event) => {
        event.preventDefault();
    });

    window.addEventListener('resize', () => {
        // Also reset glider position on resize to handle layout changes
        document.querySelectorAll('.switch-container').forEach(container => {
            const glider = container.querySelector('.switch-glider');
            const activeOption = container.querySelector('.switch-option.active');
            if (glider && activeOption) {
                glider.style.width = `${activeOption.offsetWidth}px`;
                glider.style.left = `${activeOption.offsetLeft}px`;
            }
        });
    });

    const uploadBox = DOMElements.singleUploadBox;
    uploadBox.addEventListener('click', async () => {
        if (appState.isRunning) {
            DOMElements.statusOutput.value = 'Please wait until the current process finishes.';
            return;
        }
        const newPath = await window.electronAPI.openFileDialog();
        await handleFileSelection(newPath);
    });
    uploadBox.addEventListener('dragover', (event) => {
        if (appState.isRunning) return;
        event.preventDefault();
        uploadBox.classList.add('drag-over');
    });
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });
    uploadBox.addEventListener('drop', async (event) => {
        if (appState.isRunning) return;
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

    DOMElements.batchUploadBox.addEventListener('click', async () => {
        if (appState.isRunning) {
            DOMElements.statusOutput.value = 'Please wait until the current process finishes.';
            return;
        }
        const result = await window.electronAPI.openBatchDialog();
        await handleBatchSelection(result);
    });
    DOMElements.batchUploadBox.addEventListener('dragover', (event) => { if (appState.isRunning) return; event.preventDefault(); DOMElements.batchUploadBox.classList.add('drag-over'); });
    DOMElements.batchUploadBox.addEventListener('dragleave', () => { DOMElements.batchUploadBox.classList.remove('drag-over'); });
    DOMElements.batchUploadBox.addEventListener('drop', async (event) => {
        if (appState.isRunning) return;
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

    DOMElements.startButtons.forEach(btn => btn.addEventListener('click', startGenerationFlow));
    DOMElements.stopButtons.forEach(btn => btn.addEventListener('click', () => window.electronAPI.stopGeneration()));

    DOMElements.copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(DOMElements.singleTextOutput.value);
        DOMElements.copyButton.textContent = 'Copied!';
        DOMElements.copyButton.classList.add('copied-success');
        setTimeout(() => { DOMElements.copyButton.textContent = 'Copy to Clipboard'; DOMElements.copyButton.classList.remove('copied-success'); }, 2000);
    });
    DOMElements.copyButtonBatch.addEventListener('click', () => {
        navigator.clipboard.writeText(DOMElements.batchTextOutput.value);
        DOMElements.copyButtonBatch.textContent = 'Copied!';
        DOMElements.copyButtonBatch.classList.add('copied-success');
        setTimeout(() => { DOMElements.copyButtonBatch.textContent = 'Copy to Clipboard'; DOMElements.copyButtonBatch.classList.remove('copied-success'); }, 2000);
    });
    DOMElements.downloadZipButton.addEventListener('click', async () => {
        DOMElements.statusOutput.value = 'Creating ZIP archive...';
        const result = await window.electronAPI.createZipArchive();
        DOMElements.statusOutput.value = result.message;
    });
    DOMElements.openFolderSingle.addEventListener('click', () => window.electronAPI.openOutputFolder());
    DOMElements.openFolderBatch.addEventListener('click', () => window.electronAPI.openOutputFolder());

    // --- **CORRECTED**: Add listener for pasting images with Ctrl+V ---
    window.addEventListener('paste', async (event) => {
        // Only allow pasting in 'Single Image' mode.
        const isSingleMode = document.querySelector('#mode-switch .switch-option.active').dataset.value === 'Single Image';
        if (!isSingleMode) {
            return;
        }

        const items = event.clipboardData.items;
        let imageFile = null;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                imageFile = item.getAsFile();
                break; // Found an image, stop searching
            }
        }

        if (imageFile) {
            event.preventDefault(); // Prevent the browser's default paste behavior.

            try {
                // Read the file object from the clipboard into a standard ArrayBuffer.
                const arrayBuffer = await imageFile.arrayBuffer();

                // Send the ArrayBuffer directly to the main process.
                // DO NOT use Node.js `Buffer` here.
                const newPath = await window.electronAPI.handlePastedImage(arrayBuffer);

                // Use the existing function to update the UI with the new image.
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
    if (!appState.selectedModelKey) {
        alert("Please select a model first.");
        return;
    }
    const currentMode = document.querySelector('#mode-switch .switch-option.active').dataset.value;
    const hasSelection = currentMode === 'Single Image' ? appState.singleHasSelection : appState.batchHasSelection;
    if (!hasSelection) {
        DOMElements.statusOutput.value = currentMode === 'Single Image'
            ? 'Please select a single image before starting.'
            : 'Please select batch images before starting.';
        return;
    }

    if (appState.selectedModelKey === 'Custom (LM Studio)') {
        const result = await window.electronAPI.checkLmStudioConnection();
        if (!result.success) {
            updateLmStudioUI(false, result.error);
            alert("Connection to LM Studio lost. Please ensure LM Studio is running and retry connection.");
            return;
        }
        stopLmStudioHeartbeat(); // Stop polling during active generation to prevent VRAM fragmentation
    }

    setRunningState(true);

    const options = {
        mode: currentMode,
        gen_type: document.querySelector('#gen-type-switch .switch-option.active').dataset.value,
        trigger_words: document.getElementById('trigger-words-input').value,
        prompt_enrichment: document.getElementById('prompt-enrichment-input').value,
        max_words: DOMElements.customSlider.hiddenInput.value,
        single_paragraph: true,
        desired_model_key: appState.selectedModelKey,
        low_vram: DOMElements.lowVramInput.checked,
        keep_model_loaded: DOMElements.keepModelLoadedInput.checked,
        shutdown_pc: document.getElementById('shutdown-pc-input').checked,
    };

    const outputFiles = await window.electronAPI.startGeneration(options);

    if (options.mode === 'Batch Processing') {
        DOMElements.singleImageOutput.style.display = 'none';
        DOMElements.batchGalleryOutput.style.display = 'grid';
        DOMElements.batchGalleryOutput.innerHTML = '';
        if (outputFiles) {
            outputFiles.forEach(fileUrl => {
                const img = document.createElement('img');
                img.src = fileUrl + '?' + new Date().getTime();
                img.dataset.filepath = fileUrl;
                img.classList.add('blurred');
                img.addEventListener('click', handleGalleryClick);
                DOMElements.batchGalleryOutput.appendChild(img);
            });
        }
    } else { // Single Image mode
        DOMElements.batchGalleryOutput.style.display = 'none';
        DOMElements.singleImageOutput.style.display = 'block';
        if (outputFiles && outputFiles.length > 0) {
            DOMElements.singleImageOutput.src = outputFiles[0] + '?' + new Date().getTime();
            DOMElements.singleImageOutput.classList.add('blurred');
        } else {
            DOMElements.singleImageOutput.src = '';
            DOMElements.singleImageOutput.classList.remove('blurred');
        }
    }

    window.electronAPI.beginPythonProcess(options);
}

// --- IPC Event Handlers (from Main) ---
window.electronAPI.onStatusUpdate(message => {
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

window.electronAPI.onProgressUpdate(data => {
    clearStatusAnimation();
    const progressPercentage = 10 + (data.percentage * 0.9);
    DOMElements.progressBar.style.width = `${progressPercentage}%`;
    const statusString = `Processing [${data.current}/${data.total}] (${Math.round(data.percentage)}%) | Time/img: ${data.time_per_img.toFixed(1)}s | Elapsed: ${formatSeconds(data.elapsed)} | ETA: ${formatSeconds(data.eta)}`;
    DOMElements.statusOutput.value = statusString;
});

window.electronAPI.onImageComplete(data => {
    const imageToUnblur = DOMElements.batchGalleryOutput.querySelector(`img:nth-child(${data.index})`);
    if (imageToUnblur) {
        imageToUnblur.classList.remove('blurred');
        if (data.index === 1) {
            imageToUnblur.click();
        }
    }
});

window.electronAPI.onGenerationComplete(async () => {
    clearStatusAnimation();
    const mode = document.querySelector('#mode-switch .switch-option.active').dataset.value;

    if (mode === 'Single Image') {
        DOMElements.statusOutput.value = 'Task complete!';
        const outputFiles = await window.electronAPI.getOutputFiles();
        if (outputFiles.length > 0) {
            DOMElements.singleImageOutput.classList.remove('blurred');
            DOMElements.singleImageOutput.src = outputFiles[0] + '?' + new Date().getTime();
            const textContent = await window.electronAPI.getTextContent(outputFiles[0]);
            DOMElements.singleTextOutput.value = textContent.trim();
        }
    } else {
        DOMElements.statusOutput.value = 'Task complete!';
    }

    if (appState.selectedModelKey === 'Custom (LM Studio)') {
        startLmStudioHeartbeat(); // Resume polling after generation
    }

    setRunningState(false);
    setTimeout(() => {
        DOMElements.statusOutput.value += "\nReady for the next task.";
        DOMElements.statusOutput.scrollTop = DOMElements.statusOutput.scrollHeight;
    }, 1000);
});

window.electronAPI.onGenerationError(message => {
    clearStatusAnimation();
    DOMElements.statusOutput.value = `ERROR: \n${message}`;
    setRunningState(false);
    if (appState.selectedModelKey === 'Custom (LM Studio)') {
        startLmStudioHeartbeat(); // Resume polling after error
    }
});

window.electronAPI.onGenerationStopped(() => {
    clearStatusAnimation();
    setRunningState(false);
    DOMElements.statusOutput.value += '\nStop requested by user...';
    if (appState.selectedModelKey === 'Custom (LM Studio)') {
        startLmStudioHeartbeat(); // Resume polling after stop
    }
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
    if (statusEl) statusEl.textContent = '(Starting...)';

    try {
        await window.electronAPI.downloadModel(modelKey);
    } catch (e) {
        console.error(`Download invocation failed for ${modelKey}`, e);
    }
}

async function handleDeleteClick(event) {
    const button = event.currentTarget;
    const modelKey = button.closest('.model-selector-item').dataset.modelKey;

    const confirmed = confirm(`Are you sure you want to delete the model "${modelKey}"?\nThis action cannot be undone.`);

    if (confirmed) {
        DOMElements.statusOutput.value = `Deleting ${modelKey}...`;
        const result = await window.electronAPI.deleteModel(modelKey);
        if (result.success) {
            DOMElements.statusOutput.value = `Successfully deleted ${modelKey}.`;
            if (appState.selectedModelKey === modelKey) {
                appState.selectedModelKey = null; // Invalidate selection
            }
        } else {
            DOMElements.statusOutput.value = `Error deleting ${modelKey}: ${result.message}`;
        }
        await populateModelList(); // Refresh the list
    }
}

window.electronAPI.onDownloadStatus(data => {
    const statusEl = document.getElementById(`status-${data.modelKey.replace(/[\s().]/g, '')}`);
    if (statusEl) statusEl.textContent = `(${data.message})`;
    DOMElements.statusOutput.value = `[${data.modelKey}] ${data.message}`;
});

window.electronAPI.onDownloadProgress(data => {
    clearStatusAnimation();
    const progressContainer = document.getElementById(`progress-${data.modelKey.replace(/[\s().]/g, '')}`);
    const progressBar = progressContainer.querySelector('.progress-bar-inline');
    const statusEl = document.getElementById(`status-${data.modelKey.replace(/[\s().]/g, '')}`);

    if (progressBar) {
        progressContainer.style.display = 'block';
        progressBar.style.width = `${data.percentage}%`;
    }
    if (statusEl) {
        statusEl.textContent = `(Downloading ${Math.round(data.percentage)}%)`;
    }

    const speed = data.speed_mbps.toFixed(2);
    const downloaded = data.downloaded_mb.toFixed(1);
    const total = data.total_mb.toFixed(1);
    const eta = formatSeconds(data.eta_s);

    const statusString = `${data.model_name} | ${Math.round(data.percentage)}% | ${speed} MB/s | ${downloaded}/${total} MB | ETA: ${eta}`;
    DOMElements.statusOutput.value = statusString;
});

window.electronAPI.onDownloadComplete(async (data) => {
    DOMElements.statusOutput.value = `Download complete for ${data.modelKey}! Ready to use.`;
    appState.activeDownloads.delete(data.modelKey);
    appState.selectedModelKey = data.modelKey; // Automatically select the newly downloaded model
    await populateModelList();
});

window.electronAPI.onDownloadError(async (data) => {
    DOMElements.statusOutput.value = `ERROR downloading ${data.modelKey}: \n${data.message}`;
    appState.activeDownloads.delete(data.modelKey);
    await populateModelList();
});


// REMOVED: handleLmStudioConnectClick is now handled by startLmStudioHeartbeat auto-check

function updateLmStudioUI(connected, error = null) {
    const statusSpan = document.getElementById('lm-studio-status');
    if (!statusSpan) return;

    if (connected) {
        appState.lmStudioConnected = true;
        statusSpan.textContent = '✓ Connected';
        statusSpan.className = 'model-status-text connected';
    } else {
        appState.lmStudioConnected = false;
        // Cycle dots (1 -> 2 -> 3 -> 1)
        appState.lmStudioDotCount = (appState.lmStudioDotCount % 3) + 1;
        const dots = '.'.repeat(appState.lmStudioDotCount);
        statusSpan.innerHTML = `• Searching<span class="searching-dots">${dots}</span>`;
        statusSpan.className = 'model-status-text searching';
        if (error) {
             // Only log to status output if it's a real selection attempt or meaningful error
             // (We don't want to spam the log every 1s)
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
        updateLmStudioUI(result.success, result.error);
        
        const nextInterval = appState.lmStudioConnected ? 5000 : 1000;
        appState.lmStudioHeartbeatInterval = setTimeout(check, nextInterval);
    };

    check();
}

function stopLmStudioHeartbeat() {
    if (appState.lmStudioHeartbeatInterval) {
        clearTimeout(appState.lmStudioHeartbeatInterval);
        appState.lmStudioHeartbeatInterval = null;
    }
}

async function handleGalleryClick(event) {
    document.querySelectorAll('.gallery img.selected').forEach(img => img.classList.remove('selected'));
    const img = event.target;
    img.classList.add('selected');
    const textContent = await window.electronAPI.getTextContent(img.dataset.filepath);
    DOMElements.batchTextOutput.value = textContent.trim();
}
