/// <reference types="vite/client" />
import type { OrbisApi } from '../shared/types';

declare global {
  interface Window {
    orbis: OrbisApi;
  }
}

export {};
