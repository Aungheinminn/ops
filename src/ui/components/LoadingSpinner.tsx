/**
 * Loading Spinner Component
 * Displays animated loading indicator during agent execution
 */

import { Show, createSignal, onCleanup, createEffect } from 'solid-js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface LoadingSpinnerProps {
  isLoading: boolean;
  message?: string;
  interruptCount?: number;
}

export function LoadingSpinner(props: LoadingSpinnerProps) {
  const [frameIndex, setFrameIndex] = createSignal(0);

  createEffect(() => {
    if (!props.isLoading) return;
    
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    onCleanup(() => clearInterval(interval));
  });

  return (
    <box flexDirection="row" gap={1}>
      <text>
        <span style={{ fg: '#fbbf24' }}>
          {SPINNER_FRAMES[frameIndex()]}
        </span>
      </text>
      <text>
        <span style={{ fg: '#6b7280' }}>
          {props.message || 'Thinking...'}
        </span>
      </text>
      <Show when={props.interruptCount && props.interruptCount > 0}>
        <text>
          <span style={{ fg: '#ef4444' }}>
            (press Esc again to interrupt)
          </span>
        </text>
      </Show>
    </box>
  );
}
