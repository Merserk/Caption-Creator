const path = require('path');
const fs = require('fs-extra');

function stringify(value) {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function initLogging(appExecRoot) {
    const logFile = path.join(appExecRoot, 'logs', 'errors.log');
    const originalError = console.error.bind(console);
    let firstError = true;

    console.error = (...args) => {
        const message = args.map(stringify).join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (message) {
            try {
                fs.ensureDirSync(path.dirname(logFile));
                fs[firstError ? 'writeFileSync' : 'appendFileSync'](
                    logFile,
                    `[${new Date().toISOString()}] ${message}\n`
                );
                firstError = false;
            } catch {}
        }
        originalError(...args);
    };

    process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));
    process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
}

module.exports = { initLogging };
