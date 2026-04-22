import { createSignal, createMemo, Index, Show } from 'solid-js';
import type { SettingsManager } from '@mariozechner/pi-coding-agent';
import type { KeyEvent } from '@opentui/core';
import { Colors } from '../../../core/types.js';

interface SettingsDialogProps {
  settingsManager: SettingsManager;
  onComplete: () => void;
  onCancel: () => void;
}

type SettingsCategory = 'general' | 'behavior' | 'display';

interface SettingOption {
  id: string;
  label: string;
  description?: string;
}

const CATEGORIES: { id: SettingsCategory; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'behavior', label: 'Behavior', icon: '🧠' },
  { id: 'display', label: 'Display', icon: '🎨' },
];

const THINKING_LEVELS: SettingOption[] = [
  { id: 'off', label: 'Off', description: 'No thinking blocks' },
  { id: 'minimal', label: 'Minimal', description: 'Minimal thinking' },
  { id: 'low', label: 'Low', description: 'Low thinking effort' },
  { id: 'medium', label: 'Medium', description: 'Balanced thinking (default)' },
  { id: 'high', label: 'High', description: 'High thinking effort' },
  { id: 'xhigh', label: 'X-High', description: 'Maximum thinking effort' },
];

const THEMES: SettingOption[] = [
  { id: 'dark', label: 'Dark', description: 'Dark color scheme' },
  { id: 'light', label: 'Light', description: 'Light color scheme' },
];

const TRANSPORTS: SettingOption[] = [
  { id: 'auto', label: 'Auto', description: 'Automatically select best transport' },
  { id: 'sse', label: 'SSE', description: 'Server-Sent Events' },
  { id: 'websocket', label: 'WebSocket', description: 'WebSocket connection' },
];

const MESSAGE_MODES: SettingOption[] = [
  { id: 'one-at-a-time', label: 'One at a time', description: 'Wait for response before sending next' },
  { id: 'all', label: 'All at once', description: 'Send all queued messages together' },
];

export function SettingsDialog(props: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = createSignal<SettingsCategory>('general');
  const [selectedIndices, setSelectedIndices] = createSignal<Record<string, number>>({});
  const [savedSettings, setSavedSettings] = createSignal<Set<string>>(new Set());

  const currentSettings = createMemo(() => ({
    thinkingLevel: props.settingsManager.getDefaultThinkingLevel() || 'medium',
    theme: props.settingsManager.getTheme() || 'dark',
    transport: props.settingsManager.getTransport() || 'auto',
    steeringMode: props.settingsManager.getSteeringMode() || 'one-at-a-time',
    followUpMode: props.settingsManager.getFollowUpMode() || 'one-at-a-time',
  }));

  const getOptionIndex = (options: SettingOption[], currentId: string): number => {
    const idx = options.findIndex(o => o.id === currentId);
    return idx >= 0 ? idx : 0;
  };

  const handleSelect = (settingKey: string, options: SettingOption[], index: number) => {
    const option = options[index];
    if (!option) return;

    switch (settingKey) {
      case 'thinkingLevel':
        props.settingsManager.setDefaultThinkingLevel(option.id as any);
        break;
      case 'theme':
        props.settingsManager.setTheme(option.id);
        break;
      case 'transport':
        props.settingsManager.setTransport(option.id as any);
        break;
      case 'steeringMode':
        props.settingsManager.setSteeringMode(option.id as any);
        break;
      case 'followUpMode':
        props.settingsManager.setFollowUpMode(option.id as any);
        break;
    }

    setSavedSettings(prev => new Set([...prev, settingKey]));
    setSelectedIndices(prev => ({ ...prev, [settingKey]: index }));
  };

  const handleKey = (e: KeyEvent) => {
    const name = e.name?.toLowerCase();

    if (name === 'escape') {
      props.onCancel();
      e.preventDefault();
      return;
    }

    if (name === 'return') {
      props.onComplete();
      e.preventDefault();
      return;
    }

    if (name === 'tab') {
      const currentIdx = CATEGORIES.findIndex(c => c.id === activeCategory());
      const nextIdx = (currentIdx + 1) % CATEGORIES.length;
      setActiveCategory(CATEGORIES[nextIdx].id);
      e.preventDefault();
    }
  };

  const renderSetting = (
    label: string,
    key: string,
    options: SettingOption[],
    currentValue: string
  ) => {
    const currentIndex = getOptionIndex(options, currentValue);
    const selectedIdx = selectedIndices()[key] ?? currentIndex;
    const isSaved = savedSettings().has(key);

    return (
      <box flexDirection="column" marginBottom={1}>
        <text>
          <span style={{ bold: true, fg: Colors.white }}>
            {label}
            {isSaved && <span style={{ fg: Colors.success }}> ✓</span>}
          </span>
        </text>

        <box flexDirection="row" gap={2} flexWrap="wrap">
          <Index each={options}>
            {(option, index) => {
              const isSelected = selectedIdx === index;
              return isSelected ? (
                <box
                  border={true}
                  borderStyle="single"
                  borderColor={Colors.primary}
                  backgroundColor={Colors.primaryDark}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text>
                    <span style={{ fg: Colors.white, bold: true }}>
                      {option().label}
                    </span>
                  </text>
                </box>
              ) : (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text>
                    <span style={{ fg: Colors.light }}>
                      {option().label}
                    </span>
                  </text>
                </box>
              );
            }}
          </Index>
        </box>

        <text>
          <span style={{ fg: Colors.muted, dim: true }}>
            {options[selectedIdx]?.description}
          </span>
        </text>
      </box>
    );
  };

  return (
    <box
      height={20}
      border={true}
      borderStyle="rounded"
      borderColor={Colors.primary}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      focusable={true}
      onKeyDown={handleKey}
    >
      <text>
        <span style={{ bold: true, fg: Colors.primary }}>
          ⚙️ Settings
        </span>
      </text>

      <box height={1} />

      <box flexDirection="row" gap={2}>
        <Index each={CATEGORIES}>
          {(category) => {
            const isActive = activeCategory() === category().id;
            return isActive ? (
              <box
                border={true}
                borderStyle="single"
                borderColor={Colors.primary}
                backgroundColor={Colors.primaryDark}
                paddingLeft={1}
                paddingRight={1}
              >
                <text>
                  <span style={{ fg: Colors.white, bold: true }}>
                    {category().icon} {category().label}
                  </span>
                </text>
              </box>
            ) : (
              <box
                paddingLeft={1}
                paddingRight={1}
              >
                <text>
                  <span style={{ fg: Colors.muted }}>
                    {category().icon} {category().label}
                  </span>
                </text>
              </box>
            );
          }}
        </Index>
      </box>

      <box height={1} />

      <box flexDirection="column" flexGrow={1}>
        <Show when={activeCategory() === 'general'}>
          {renderSetting(
            'Thinking Level',
            'thinkingLevel',
            THINKING_LEVELS,
            currentSettings().thinkingLevel
          )}

          {renderSetting(
            'Theme',
            'theme',
            THEMES,
            currentSettings().theme
          )}
        </Show>

        <Show when={activeCategory() === 'behavior'}>
          {renderSetting(
            'Transport',
            'transport',
            TRANSPORTS,
            currentSettings().transport
          )}

          {renderSetting(
            'Steering Mode',
            'steeringMode',
            MESSAGE_MODES,
            currentSettings().steeringMode
          )}

          {renderSetting(
            'Follow-up Mode',
            'followUpMode',
            MESSAGE_MODES,
            currentSettings().followUpMode
          )}
        </Show>

        <Show when={activeCategory() === 'display'}>
          <text>
            <span style={{ fg: Colors.muted }}>
              Display settings will be added in a future update.
            </span>
          </text>
        </Show>
      </box>

      <box flexGrow={1} />

      <box flexDirection="row" gap={2}>
        <text>
          <span style={{ fg: Colors.muted, dim: true }}>
            Tab: switch categories
          </span>
        </text>
        <text>
          <span style={{ fg: Colors.muted, dim: true }}>
            Enter: close
          </span>
        </text>
        <text>
          <span style={{ fg: Colors.muted, dim: true }}>
            Esc: close
          </span>
        </text>
      </box>
    </box>
  );
}

export default SettingsDialog;
