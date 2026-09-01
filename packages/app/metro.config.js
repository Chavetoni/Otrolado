// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace: Metro has to watch the repo root and know about both
// node_modules trees, or workspace packages neither resolve nor hot-reload.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

/**
 * Map extensionful relative imports onto their TypeScript sources.
 *
 * @otrolado/shared is consumed straight from source and is also imported by
 * the Node API, so its internal imports carry the `.js` extension that Node's
 * ESM resolver requires — while the files on disk are `.ts`. Metro does not
 * apply that mapping, so `export * from './types.js'` fails to resolve.
 *
 * Rewriting to the extensionless specifier lets Metro's normal `sourceExts`
 * search find the `.ts` file. Falls through untouched if that finds nothing,
 * so genuine `.js` files still resolve normally.
 */
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // Not a TypeScript source — fall through to the default resolver.
    }
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
