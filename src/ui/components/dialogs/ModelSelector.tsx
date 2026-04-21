import type { ModelRegistry } from '@mariozechner/pi-coding-agent';
import type { Model } from '@mariozechner/pi-ai';
import { Colors } from '../../../core/types.js';

interface ModelSelectorProps {
  modelRegistry: ModelRegistry;
  currentModel?: Model<any>;
  onSelect: (model: Model<any>) => void;
  onCancel: () => void;
}

export function ModelSelector(props: ModelSelectorProps) {
  return (
    <box
      height={10}
      border={true}
      borderStyle="rounded"
      borderColor={Colors.primary}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        <span style={{ bold: true, fg: Colors.primary }}>
          🤖 Select Model
        </span>
      </text>
      
      <box height={1} />
      
      <text>
        <span style={{ fg: Colors.muted }}>
          Model selection temporarily disabled.
        </span>
      </text>
      
      <box flexGrow={1} />
      
      <text>
        <span style={{ fg: Colors.muted, dim: true }}>
          Press Esc to cancel
        </span>
      </text>
    </box>
  );
}

export default ModelSelector;
