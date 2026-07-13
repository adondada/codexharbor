import type { CodexHarborApi } from '../shared';

declare global {
  interface Window {
    codexBridge: CodexHarborApi;
  }
}

export {};
