const { app } = require('electron');
const packageInfo = require('./package.json');
const {
    createAppContext,
    registerLifecycle,
    registerWindowIpc,
} = require('./src/main/appCore');
const { registerFileIpc } = require('./src/main/files');
const { registerGenerationIpc } = require('./src/main/generation');
const { registerModelIpc } = require('./src/main/models');

const ctx = createAppContext({ app, packageInfo, rootDir: __dirname });

registerGenerationIpc(ctx);
registerModelIpc(ctx);
registerFileIpc(ctx);
registerWindowIpc(ctx);
registerLifecycle(ctx);
