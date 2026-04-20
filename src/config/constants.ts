export const APP_NAME = 'ops';
export const APP_VERSION = '1.0.0';
export const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
export const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const KEYBINDINGS = {
  NEW_SESSION: 'ctrl+n',
  CLOSE_SESSION: 'ctrl+w',
  SWITCH_SESSION: 'ctrl+tab',
  SWITCH_SESSION_PREV: 'ctrl+shift+tab',
  FOCUS_SESSIONS_SIDEBAR: 'ctrl+s',
  QUIT: 'ctrl+c',
  COMMAND_PALETTE: 'ctrl+p',
  CLEAR: 'ctrl+l',
} as const;
