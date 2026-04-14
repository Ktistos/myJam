import '@testing-library/jest-dom';
import { vi } from 'vitest';

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
  });
}

if (!globalThis.ClipboardEvent) {
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {};
}

if (!globalThis.DataTransfer) {
  globalThis.DataTransfer = class DataTransfer {
    data = {};

    setData(type, value) {
      this.data[type] = String(value);
    }

    getData(type) {
      return this.data[type] || '';
    }

    clearData(type) {
      if (type) {
        delete this.data[type];
        return;
      }
      this.data = {};
    }
  };
}
