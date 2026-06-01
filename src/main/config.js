const path = require('path');
const fs = require('fs-extra');

function getEffectiveOutputRoot(ctx) {
    return ctx.state.customOutputRoot || ctx.paths.defaultOutputDir;
}

function getOutputFolderPreference(ctx) {
    return {
        customOutputRoot: ctx.state.customOutputRoot,
        defaultOutputRoot: ctx.paths.defaultOutputDir,
        effectiveOutputRoot: getEffectiveOutputRoot(ctx),
    };
}

function loadAppSettings(ctx) {
    const { app, state } = ctx;
    state.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    try {
        if (!fs.existsSync(state.settingsPath)) return;
        const settings = fs.readJsonSync(state.settingsPath);
        state.customOutputRoot = typeof settings.customOutputRoot === 'string' && settings.customOutputRoot.trim()
            ? settings.customOutputRoot
            : null;
    } catch (error) {
        state.customOutputRoot = null;
        console.error('Error loading settings:', error);
    }
}

function saveAppSettings(ctx) {
    const { app, state } = ctx;
    if (!state.settingsPath) {
        state.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    }
    fs.ensureDirSync(path.dirname(state.settingsPath));
    fs.writeJsonSync(state.settingsPath, { customOutputRoot: state.customOutputRoot }, { spaces: 2 });
}

function getPromptConfigPaths(ctx) {
    return [ctx.paths.configPath];
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readConfigValue(filePath, sectionName, key, fallback = null) {
    try {
        const configText = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = configText.split('\n');
        const sectionRegex = /^\s*\[([^\]]+)\]\s*$/;
        const keyRegex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`, 'i');
        let inSection = false;

        for (const line of lines) {
            const sectionMatch = line.match(sectionRegex);
            if (sectionMatch) {
                inSection = sectionMatch[1].trim().toLowerCase() === String(sectionName || '').toLowerCase();
                continue;
            }
            if (!inSection) continue;

            const keyMatch = line.match(keyRegex);
            if (keyMatch) {
                return keyMatch[1].trim();
            }
        }
    } catch (e) {
        // Fall through to fallback below.
    }
    return fallback;
}

function formatIniValueLines(key, value) {
    const normalized = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    return lines.map((line, index) => index === 0 ? `${key} = ${line}` : `    ${line}`);
}

function setPromptConfigValueText(configText, key, value) {
    const normalizedText = String(configText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');
    const sectionRegex = /^\s*\[([^\]]+)\]\s*$/;
    const keyRegex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, 'i');
    let promptsStart = -1;
    let promptsEnd = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(sectionRegex);
        if (match && match[1].trim().toLowerCase() === 'prompts') {
            promptsStart = i;
            for (let j = i + 1; j < lines.length; j++) {
                if (sectionRegex.test(lines[j])) {
                    promptsEnd = j;
                    break;
                }
            }
            break;
        }
    }

    const replacement = formatIniValueLines(key, value);
    if (promptsStart === -1) {
        return [`[prompts]`, ...replacement, '', normalizedText].join('\n').trimEnd() + '\n';
    }

    for (let i = promptsStart + 1; i < promptsEnd; i++) {
        if (!keyRegex.test(lines[i])) continue;
        let removeEnd = i + 1;
        while (removeEnd < promptsEnd && /^\s+/.test(lines[removeEnd]) && !sectionRegex.test(lines[removeEnd])) {
            removeEnd++;
        }
        lines.splice(i, removeEnd - i, ...replacement);
        return lines.join('\n');
    }

    lines.splice(promptsEnd, 0, ...replacement);
    return lines.join('\n');
}

function readPromptConfigValue(filePath, key, fallback = '') {
    try {
        const configText = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = configText.split('\n');
        const sectionRegex = /^\s*\[([^\]]+)\]\s*$/;
        const keyRegex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.*)$`, 'i');
        let inPrompts = false;

        for (let i = 0; i < lines.length; i++) {
            const sectionMatch = lines[i].match(sectionRegex);
            if (sectionMatch) {
                inPrompts = sectionMatch[1].trim().toLowerCase() === 'prompts';
                continue;
            }
            if (!inPrompts) continue;

            const keyMatch = lines[i].match(keyRegex);
            if (!keyMatch) continue;

            const valueLines = [keyMatch[1]];
            for (let j = i + 1; j < lines.length; j++) {
                if (sectionRegex.test(lines[j]) || /^\S/.test(lines[j])) break;
                valueLines.push(lines[j].replace(/^\s+/, ''));
            }
            return valueLines.join('\n').trim();
        }
    } catch {}
    return fallback;
}

function writePromptConfigValue(filePath, key, value) {
    if (!fs.existsSync(filePath)) return;
    const configText = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, setPromptConfigValueText(configText, key, value), 'utf8');
}

function getSharedCustomPrompt(ctx) {
    return readPromptConfigValue(ctx.paths.configPath, 'custom', '');
}

function saveSharedCustomPrompt(ctx, customPrompt) {
    const prompt = String(customPrompt || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    writePromptConfigValue(ctx.paths.configPath, 'custom', prompt);
    return prompt;
}

function syncSharedCustomPrompt(ctx) {
    const prompt = getSharedCustomPrompt(ctx);
    if (prompt) {
        saveSharedCustomPrompt(ctx, prompt);
    }
}

module.exports = {
    getEffectiveOutputRoot,
    getOutputFolderPreference,
    getPromptConfigPaths,
    getSharedCustomPrompt,
    loadAppSettings,
    readConfigValue,
    saveAppSettings,
    saveSharedCustomPrompt,
    syncSharedCustomPrompt,
};
