import { createSignal, createMemo, Index, createEffect, onMount } from 'solid-js';
import type { ModelRegistry } from '@mariozechner/pi-coding-agent';
import type { Model } from '@mariozechner/pi-ai';
import type { KeyEvent } from '@opentui/core';
import { Colors } from '../../../core/types.js';

interface ModelSelectorProps {
  modelRegistry: ModelRegistry;
  currentModel?: Model<any>;
  onSelect: (model: Model<any>) => void;
  onCancel: () => void;
}

export function ModelSelector(props: ModelSelectorProps) {
  let boxRef: { focus(): void } | undefined;

  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const models = createMemo(() => {
    return props.modelRegistry.getAvailable();
  });

  const selectedModel = createMemo(() => models()[selectedIndex()]);

  onMount(() => {
    setTimeout(() => {
      boxRef?.focus();
    }, 50);
  });

  let scrollboxRef: { scrollTop: number; scrollTo: (line: number) => void } | undefined;

  createEffect(() => {
    const idx = selectedIndex();
    if (scrollboxRef) {
      const viewportHeight = 8;
      const scrollTop = scrollboxRef.scrollTop;
      const scrollBottom = scrollTop + viewportHeight;

      if (idx < scrollTop) {
        scrollboxRef.scrollTo(idx);
      } else if (idx >= scrollBottom) {
        scrollboxRef.scrollTo(idx - viewportHeight + 1);
      }
    }
  });

  const handleSubmit = () => {
    const model = selectedModel();
    if (model) {
      props.onSelect(model);
    }
  };

  const handleKey = (e: KeyEvent) => {
    const name = e.name?.toLowerCase();

    if (name === 'escape') {
      props.onCancel();
      e.preventDefault();
      return;
    }

    if (name === 'up') {
      setSelectedIndex(i => (i > 0 ? i - 1 : models().length - 1));
      e.preventDefault();
    } else if (name === 'down') {
      setSelectedIndex(i => (i < models().length - 1 ? i + 1 : 0));
      e.preventDefault();
    } else if (name === 'return') {
      handleSubmit();
      e.preventDefault();
    }
  };

  return (
    <box
      ref={(r) => { boxRef = r as { focus(): void }; }}
      height={14}
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
          Select Model
        </span>
      </text>

      <box height={1} />

      <text>
        <span style={{ fg: Colors.muted }}>Select a model (use ↑↓ arrows, Enter to confirm):</span>
      </text>

      <box height={1} />

      <scrollbox
        flexDirection="column"
        height={8}
        scrollbarOptions={{ visible: false }}
        ref={(r) => { scrollboxRef = r as { scrollTop: number; scrollTo: (line: number) => void }; }}
      >
        <Index each={models()}>
          {(model, index) => (
            <box
              height={1}
              paddingLeft={1}
              backgroundColor={selectedIndex() === index ? Colors.primaryDark : undefined}
            >
              <text>
                <span style={{
                  fg: selectedIndex() === index ? Colors.white : Colors.light,
                  bold: selectedIndex() === index
                }}>
                  {selectedIndex() === index ? '→ ' : '  '}
                  {model().id}
                </span>
                {props.currentModel?.id === model().id && (
                  <span style={{ fg: Colors.success }}> ●</span>
                )}
              </text>
            </box>
          )}
        </Index>
      </scrollbox>

      <box height={1} />

      <text>
        <span style={{ fg: Colors.muted, dim: true }}>
          Press Esc to cancel
        </span>
      </text>
    </box>
  );
}

export default ModelSelector;
