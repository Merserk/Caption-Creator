const path = require('path');
const fs = require('fs-extra');

function formatTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function safeToString(value) {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function initLogging({ appExecRoot, isDev }) {
    const logsDir = path.join(appExecRoot, 'logs');
    fs.ensureDirSync(logsDir);

    const start = new Date();
    const ts = formatTimestamp(start).replace(/[: ]/g, '-');
    const fileName = `caption_creator_${ts}_${process.pid}.log`;
    const logFilePath = path.join(logsDir, fileName);

    const stream = fs.createWriteStream(logFilePath, { flags: 'a' });

    const writeLine = (level, args) => {
        const line = `[${formatTimestamp()}] [${level}] ${args.map(safeToString).join(' ')}\n`;
        try {
            stream.write(line);
        } catch {
            // If logging fails, do not crash the app.
        }
    };

    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
    };

    console.log = (...args) => {
        writeLine('INFO', args);
        originalConsole.log(...args);
    };
    console.info = (...args) => {
        writeLine('INFO', args);
        originalConsole.info(...args);
    };
    console.warn = (...args) => {
        writeLine('WARN', args);
        originalConsole.warn(...args);
    };
    console.error = (...args) => {
        writeLine('ERROR', args);
        originalConsole.error(...args);
    };
    console.debug = (...args) => {
        writeLine('DEBUG', args);
        originalConsole.debug(...args);
    };

    process.on('uncaughtException', (err) => {
        writeLine('FATAL', [err]);
        originalConsole.error('Uncaught Exception:', err);
    });
    process.on('unhandledRejection', (reason) => {
        writeLine('ERROR', ['Unhandled Rejection:', reason]);
        originalConsole.error('Unhandled Rejection:', reason);
    });

    writeLine('INFO', ['--- App start ---']);
    writeLine('INFO', [`Env: ${isDev ? 'dev' : 'prod'}`]);
    writeLine('INFO', [`Exec root: ${appExecRoot}`]);

    const close = () => {
        writeLine('INFO', ['--- App end ---']);
        try {
            stream.end();
        } catch {
            // Ignore close errors.
        }
    };

    return {
        logFilePath,
        close,
    };
}

module.exports = { initLogging };
