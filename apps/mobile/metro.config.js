// Metro config: lets the app import the Cyprus wire contract straight from
// packages/shared/src (types AND the few runtime enums/helpers) without a build
// step and without making apps/mobile an npm workspace (React 19 vs the site's 18).
//
// packages/shared is written for Node ESM, so its relative imports end in ".js"
// even though the files are ".ts". Metro does not map that, so we do it here,
// only for files that live inside packages/shared.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');
const sharedEntry = path.join(sharedRoot, 'src/index.ts');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName === '@cyprus/shared') {
    return { type: 'sourceFile', filePath: sharedEntry };
  }
  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    context.originModulePath.startsWith(path.join(sharedRoot, 'src'))
  ) {
    return resolve(context, moduleName.slice(0, -3), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
