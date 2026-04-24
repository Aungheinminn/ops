import { useKeyboard as useOpenTUIKeyboard } from '@opentui/solid';
import type { KeyEvent } from '@opentui/core';
import type { Accessor } from 'solid-js';

export type { KeyEvent };

export interface KeyboardConfig {
  onNewSession?: () => void;
  onCloseSession?: () => void;
  onSwitchSession?: () => void;
  onRenameSession?: () => void;
  onQuit?: () => void;
  onFocusSidebar?: () => void;
  onEscape?: () => void;
  onEnter?: () => void;
  sidebarFocused?: Accessor<boolean>;
  dialogFocused?: Accessor<boolean>;
  onSidebarNavigate?: (direction: 'up' | 'down') => void;
  onSidebarSelect?: () => void;
  onSidebarDefocus?: () => void;
  onDialogNavigate?: (direction: 'up' | 'down') => void;
}

export function useKeyboard(config: KeyboardConfig): void {
  useOpenTUIKeyboard((e: KeyEvent) => {
    if (e.eventType !== 'press') return;

    if (config.dialogFocused?.() && !e.ctrl) {
      const handled = handleDialogKeys(e, config);
      if (handled) return;
    }

    if (config.sidebarFocused?.() && !e.ctrl) {
      handleSidebarKeys(e, config);
      return;
    }

    if (e.ctrl) {
      handleGlobalKeys(e, config);
    }
  });
}

function handleDialogKeys(e: KeyEvent, config: KeyboardConfig): boolean {
  switch (e.name) {
    case 'escape':
      config.onEscape?.();
      e.preventDefault();
      return true;
    default:
      return false;
  }
}

function handleSidebarKeys(e: KeyEvent, config: KeyboardConfig): void {
  switch (e.name) {
    case 'up':
      config.onSidebarNavigate?.('up');
      e.preventDefault();
      break;
    case 'down':
      config.onSidebarNavigate?.('down');
      e.preventDefault();
      break;
    case 'return':
      config.onSidebarSelect?.();
      e.preventDefault();
      break;
    case 'escape':
      config.onSidebarDefocus?.();
      e.preventDefault();
      break;
    default:
      config.onSidebarDefocus?.();
      break;
  }
}

function handleGlobalKeys(e: KeyEvent, config: KeyboardConfig): void {
  switch (e.name) {
    case 'n':
      config.onNewSession?.();
      break;
    case 'w':
      config.onCloseSession?.();
      break;
    case 'Tab':
      config.onSwitchSession?.();
      break;
    case 'c':
      config.onQuit?.();
      break;
    case 's':
      config.onFocusSidebar?.();
      e.preventDefault();
      break;
    case 'r':
      config.onRenameSession?.();
      e.preventDefault();
      break;
  }
}
