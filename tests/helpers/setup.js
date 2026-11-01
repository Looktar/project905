// Vitest setup file (see vitest.config.js): install the fake browser globals
// before any test file imports game modules.
import { installBrowserStubs } from './browser-stubs.js';

installBrowserStubs();
