import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Import test setup to ensure proper global environment
import('./test-setup.mjs').catch(() => {
  // If setup fails, continue anyway - it might already be set up
});

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const buildRoot = path.join(projectRoot, '.tests-dist');

const aliasEntries = [
  ['@i18n/', 'i18n/'],
  ['@components/', 'components/'],
  ['@features/', 'features/'],
  ['@pages/', 'pages/'],
  ['@router/', 'router/'],
  ['@services/', 'services/'],
  ['@store/', 'store/'],
  ['@styles/', 'styles/'],
  ['@utils/', 'utils/']
];

const resolveWithExtension = (filePath) => {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      const withIndex = path.join(filePath, 'index.js');
      if (fs.existsSync(withIndex)) {
        return withIndex;
      }
    }
    return filePath;
  }
  if (path.extname(filePath)) {
    return filePath;
  }
  const withJs = `${filePath}.js`;
  if (fs.existsSync(withJs)) {
    return withJs;
  }
  const withIndex = path.join(filePath, 'index.js');
  if (fs.existsSync(withIndex)) {
    return withIndex;
  }
  return filePath;
};

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.endsWith('.css')) {
    const stubPath = pathToFileURL(path.join(projectRoot, 'tests', 'css-stub.mjs'));
    return defaultResolve(stubPath.href, context);
  }
  if (specifier === '@reduxjs/toolkit') {
    const shimPath = pathToFileURL(path.join(projectRoot, 'tests', 'rtk-shim.mjs'));
    return defaultResolve(shimPath.href, context);
  }
  if (specifier === 'vitest') {
    const shimPath = pathToFileURL(path.join(projectRoot, 'tests', 'vitest-shim.mjs'));
    return defaultResolve(shimPath.href, context);
  }
  if (specifier === '@i18n') {
    const targetPath = resolveWithExtension(path.join(buildRoot, 'i18n', 'index.js'));
    const url = pathToFileURL(targetPath);
    return defaultResolve(url.href, context);
  }

  if (specifier.endsWith('.json')) {
    // Resolve the full path to read the actual JSON content
    let filePath;
    try {
      if (specifier.startsWith('/') || specifier.startsWith('file:')) {
         filePath = specifier.startsWith('file:') ? new URL(specifier).pathname : specifier;
      } else if (context.parentURL) {
         filePath = new URL(specifier, context.parentURL).pathname;
      }
    } catch (e) {
      // ignore
    }

    let content = '{}';
    if (filePath && fs.existsSync(filePath)) {
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        console.warn('Failed to read JSON file:', filePath);
      }
    } else {
        // Try to resolve using defaultResolve to handle alias or other resolutions
        try {
            const resolved = await defaultResolve(specifier, context);
            const resolvedPath = new URL(resolved.url).pathname;
            if (fs.existsSync(resolvedPath)) {
                content = fs.readFileSync(resolvedPath, 'utf8');
            }
        } catch(e) {
             // ignore
        }
    }

    const jsonStub = `export default ${content};`;
    // Create a unique stub file based on the specifier to avoid conflicts
    const safeName = specifier.replace(/[^a-zA-Z0-9]/g, '_');
    const jsonStubPath = pathToFileURL(path.join(projectRoot, 'tests', `json-stub-${safeName}.mjs`));
    fs.writeFileSync(jsonStubPath.pathname, jsonStub);
    return defaultResolve(jsonStubPath.href, context);
  }
  
  // Handle MarketDataModal test navigator issue
  if (specifier.includes('MarketDataModal.test.js')) {
    const originalPath = path.join(buildRoot, 'components', 'modals', 'MarketDataModal.test.js');
    if (fs.existsSync(originalPath)) {
      let content = fs.readFileSync(originalPath, 'utf8');
      // Add test setup import at the beginning
      content = 'import "./test-setup.mjs";\n' + content;
      
      // Replace the problematic navigator assignment
      content = content.replace(
        'globalThis.navigator = window.navigator;',
        'if (typeof globalThis.navigator === "undefined") { Object.defineProperty(globalThis, "navigator", { value: window.navigator, writable: true, configurable: true }); }'
      );
      // Fix import paths to use correct relative paths from build root
      content = content.replace(
        "import('../../services/marketBackfillRealtime.js')",
        "import('../.tests-dist/services/marketBackfillRealtime.js')"
      );
      content = content.replace(
        "from '../../store/slices/strategiesSlice';",
        "from '../.tests-dist/store/slices/strategiesSlice.js';"
      );
      content = content.replace(
        "from './MarketDataModal';",
        "from '../.tests-dist/components/modals/MarketDataModal.js';"
      );
      // Write to a temporary file
      const tempPath = path.join(projectRoot, 'tests', 'MarketDataModal.test.patched.js');
      fs.writeFileSync(tempPath, content);
      const url = pathToFileURL(tempPath);
      return defaultResolve(url.href, context);
    }
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!context.parentURL) {
      return defaultResolve(specifier, context);
    }
    const parentPath = path.dirname(new URL(context.parentURL).pathname);
    const candidate = path.join(parentPath, specifier);
    const resolvedPath = resolveWithExtension(candidate);
    if (resolvedPath !== candidate || fs.existsSync(candidate)) {
      const url = pathToFileURL(resolvedPath);
      return defaultResolve(url.href, context);
    }
  }
  for (const [prefix, relative] of aliasEntries) {
    if (specifier.startsWith(prefix)) {
      const remainder = specifier.slice(prefix.length);
      const targetPath = resolveWithExtension(path.join(buildRoot, relative, remainder));
      const url = pathToFileURL(targetPath);
      return defaultResolve(url.href, context);
    }
  }
  return defaultResolve(specifier, context);
}
