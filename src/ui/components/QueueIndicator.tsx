import { Show, createSignal, onMount, onCleanup, createMemo } from 'solid-js';
import { Colors } from '../../core/types.js';
import type { QueueState } from '../../core/session/types.js';

interface QueueIndicatorProps {
  queueState: QueueState;
  mode?: 'plan' | 'build';
  isStreaming?: boolean;
}

export function QueueIndicator(props: QueueIndicatorProps) {
  const [frameIndex, setFrameIndex] = createSignal(0);
  const hasQueuedMessages = () => props.queueState.totalCount > 0;
  const steeringCount = () => props.queueState.steering.length;
  const followUpCount = () => props.queueState.followUp.length;

  const modeColor = createMemo(() => {
    return props.mode === 'plan' ? Colors.plan : Colors.build;
  });

  const dots = createMemo(() => {
    const idx = frameIndex();
    const dots = ['·', '·', '·', '·', '·', '·', '·', '·'];
    dots[idx % 8] = '●';
    return dots.join('');
  });

  onMount(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % 8;
      setFrameIndex(index);
    }, 200);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <Show when={hasQueuedMessages() || props.isStreaming}>
      <box
        height={1}
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        gap={2}
      >
        <Show when={props.isStreaming}>
          <text>
            <span style={{ fg: modeColor() }}>{dots()}</span>
          </text>
        </Show>

        <Show when={hasQueuedMessages()}>
          <text>
            <span style={{ fg: modeColor(), bold: true }}>
              Queued ({props.queueState.totalCount})
            </span>
          </text>

          <Show when={steeringCount() > 0}>
            <text>
              <span style={{ fg: modeColor() }}>
                steer:{steeringCount()}
              </span>
            </text>
          </Show>

          <Show when={followUpCount() > 0}>
            <text>
              <span style={{ fg: modeColor() }}>
                follow:{followUpCount()}
              </span>
            </text>
          </Show>

          <text>
            <span style={{ fg: Colors.muted, italic: true }}>
              (New messages will be queued)
            </span>
          </text>
        </Show>
      </box>
    </Show>
  );
}
