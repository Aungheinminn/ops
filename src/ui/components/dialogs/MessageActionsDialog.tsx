import type { KeyEvent, MouseEvent } from '@opentui/core';
import { createSignal, onMount } from 'solid-js';
import { Colors } from '../../../core/types.js';

interface MessageActionsDialogProps {
  onCopy: () => void;
  onRevert: () => void;
  onFork: () => void;
  onCancel: () => void;
}

export function MessageActionsDialog(props: MessageActionsDialogProps) {
  let boxRef: { focus(): void } | undefined;
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const actions = [
    { label: 'Copy', key: 'C', onSelect: props.onCopy },
    { label: 'Revert', key: 'R', onSelect: props.onRevert },
    { label: 'Fork', key: 'F', onSelect: props.onFork },
  ];

  onMount(() => {
    setTimeout(() => boxRef?.focus(), 0);
  });

  const moveSelection = (direction: number) => {
    const total = actions.length;
    if (total === 0) return;
    let next = selectedIndex() + direction;
    if (next < 0) next = total - 1;
    if (next >= total) next = 0;
    setSelectedIndex(next);
  };

  const handleSelect = (index: number) => {
    const action = actions[index];
    if (action) action.onSelect();
  };

  const handleKey = (e: KeyEvent) => {
    const name = e.name?.toLowerCase();

    if (name === 'escape') {
      props.onCancel();
      e.preventDefault();
      return;
    }

    if (name === 'up') {
      moveSelection(-1);
      e.preventDefault();
      return;
    }

    if (name === 'down') {
      moveSelection(1);
      e.preventDefault();
      return;
    }

    if (name === 'return') {
      handleSelect(selectedIndex());
      e.preventDefault();
      return;
    }

    if (name === 'c') {
      props.onCopy();
      e.preventDefault();
      return;
    }

    if (name === 'r') {
      props.onRevert();
      e.preventDefault();
      return;
    }

    if (name === 'f') {
      props.onFork();
      e.preventDefault();
      return;
    }
  };

  const handleMouseUp = (index: number) => (event: MouseEvent) => {
    if (event.button !== 0) return;
    handleSelect(index);
  };

  return (
    <box
      ref={(r) => { boxRef = r as { focus(): void }; }}
      height={11}
      width={40}
      border={true}
      borderStyle="rounded"
      borderColor={Colors.primary}
      backgroundColor="#1e1e2e"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
      focusable={true}
      onKeyDown={handleKey}
    >
      <text>
        <span style={{ bold: true, fg: Colors.primary }}>Prompt Actions</span>
      </text>

      <box height={1} />

      <box flexDirection="column" gap={1}>
        {actions.map((action, index) => {
          const isSelected = () => selectedIndex() === index;
          return (
            <box
              flexDirection="row"
              gap={2}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isSelected() ? Colors.primaryDark : undefined}
              onMouseUp={handleMouseUp(index)}
            >
              <text>
                <span style={{
                  bold: true,
                  fg: isSelected() ? Colors.white : Colors.light,
                }}>
                  {action.label}
                </span>
              </text>
              <text>
                <span style={{ fg: isSelected() ? Colors.white : Colors.muted }}>
                  ({action.key})
                </span>
              </text>
            </box>
          );
        })}
      </box>

      <box flexGrow={1} />

      <text>
        <span style={{ fg: Colors.muted }}>Esc to close</span>
      </text>
    </box>
  );
}

export default MessageActionsDialog;
