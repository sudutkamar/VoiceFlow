/**
 * Shared types for preload domain modules.
 * Each preload factory function returns a partial ElectronAPI-like object.
 */
export type ElectronAPISection = Record<string, (...args: any[]) => any>;
