/* eslint-disable no-console */
import { HelixLogger } from '../types/index.js';

/**
 * Creates a standard console logger.
 * @returns A fully functional console logger.
 */
export const createDefaultLogger = (): HelixLogger => {
  return {
    debug: (msg, meta) => {
      if (process.env.HELIX_LOG_LEVEL === 'debug') {
        console.debug(`[DEBUG] ${msg}`, meta ?? '');
      }
    },
    info: (msg, meta) => console.info(`[INFO] ${msg}`, meta ?? ''),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
  };
};

/**
 * Creates a no-op logger that suppresses all output.
 * @returns A logger that does nothing.
 */
export const createNoopLogger = (): HelixLogger => {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
};
