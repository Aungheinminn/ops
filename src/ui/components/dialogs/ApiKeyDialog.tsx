import { createSignal, createMemo, Index, Show, createEffect } from 'solid-js';
import type { AuthStorage } from '@mariozechner/pi-coding-agent';
import type { KeyEvent, TextareaRenderable } from '@opentui/core';
import { Colors } from '../../../core/types.js';

interface ApiKeyDialogProps {
  authStorage: AuthStorage;
  onComplete: (success: boolean) => void;
  onCancel: () => void;
}

// Supported providers for API key authentication
const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', placeholder: 'sk-ant-api03-...' },
  { id: 'openai', name: 'OpenAI (GPT)', placeholder: 'sk-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AIzaSyC...' },
  { id: 'azure', name: 'Azure OpenAI', placeholder: 'https://...' },
  { id: 'groq', name: 'Groq', placeholder: 'gsk_...' },
  { id: 'mistral', name: 'Mistral', placeholder: '...' },
  { id: 'cohere', name: 'Cohere', placeholder: '...' },
  { id: 'xai', name: 'xAI (Grok)', placeholder: 'xai-...' },
  { id: 'opencode', name: 'OpenCode Go', placeholder: 'sk-opencode-...' },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];

export function ApiKeyDialog(props: ApiKeyDialogProps) {
  let boxRef: { focus(): void } | undefined;
  let textareaRef: TextareaRenderable | undefined;
  
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [apiKey, setApiKey] = createSignal('');
  const [error, setError] = createSignal('');
  const [success, setSuccess] = createSignal('');
  const [step, setStep] = createSignal<'provider' | 'key'>('provider');
  
  const selectedProvider = createMemo(() => PROVIDERS[selectedIndex()]);

  // Auto-focus the box when in provider step
  createEffect(() => {
    if (step() === 'provider') {
      setTimeout(() => {
        boxRef?.focus();
      }, 50);
    }
  });

  // Auto-focus textarea when entering key step
  createEffect(() => {
    if (step() === 'key') {
      setTimeout(() => {
        textareaRef?.focus();
      }, 50);
    }
  });

  const handleSubmit = () => {
    if (step() === 'provider') {
      setStep('key');
      return;
    }
    
    // Read the API key from the textarea ref
    const key = textareaRef?.plainText?.trim() ?? apiKey().trim();
    
    if (!key) {
      setError('Please enter an API key');
      return;
    }
    
    // Basic validation
    if (key.length < 10) {
      setError('API key seems too short');
      return;
    }
    
    try {
      // Save to auth storage
      props.authStorage.set(selectedProvider().id, {
        type: 'api_key',
        key: key,
      });
      
      setSuccess(`API key saved for ${selectedProvider().name}`);
      setError('');
      
      // Close after brief delay to show success
      setTimeout(() => {
        props.onComplete(true);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    }
  };
  
  const handleKey = (e: KeyEvent) => {
    const name = e.name?.toLowerCase();
    
    if (name === 'escape') {
      if (step() === 'key') {
        setStep('provider');
        setApiKey('');
        setError('');
        // Clear textarea
        if (textareaRef) {
          textareaRef.setText('');
        }
        e.preventDefault();
        return;
      }
      props.onCancel();
      e.preventDefault();
      return;
    }
    
    if (step() === 'provider') {
      if (name === 'up') {
        setSelectedIndex(i => (i > 0 ? i - 1 : PROVIDERS.length - 1));
        e.preventDefault();
      } else if (name === 'down') {
        setSelectedIndex(i => (i < PROVIDERS.length - 1 ? i + 1 : 0));
        e.preventDefault();
      } else if (name === 'return') {
        handleSubmit();
        e.preventDefault();
      }
    }
  };
  
  return (
    <box
      ref={(r) => { boxRef = r as { focus(): void }; }}
      height={step() === 'provider' ? 16 : 10}
      border={true}
      borderStyle="rounded"
      borderColor={Colors.primary}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      focusable={step() === 'provider'}
      onKeyDown={handleKey}
    >
      <text>
        <span style={{ bold: true, fg: Colors.primary }}>
          🔐 Login with API Key
        </span>
      </text>
      
      <box height={1} />
      
      <Show when={step() === 'provider'}>
        <text>
          <span style={{ fg: Colors.muted }}>Select a provider (use ↑↓ arrows, Enter to confirm):</span>
        </text>
        
        <box height={1} />
        
        <box flexDirection="column">
          <Index each={PROVIDERS}>
            {(provider, index) => (
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
                    {provider().name}
                  </span>
                </text>
              </box>
            )}
          </Index>
        </box>
      </Show>
      
      <Show when={step() === 'key'}>
        <text>
          <span style={{ fg: Colors.muted }}>
            Enter API key for {selectedProvider().name}:
          </span>
        </text>
        
        <box height={1} />
        
        <textarea
          ref={(r) => { textareaRef = r as TextareaRenderable; }}
          placeholder={selectedProvider().placeholder}
          flexGrow={1}
          minHeight={1}
          maxHeight={3}
          keyBindings={[{ name: "return", action: "submit" }]}
          onSubmit={handleSubmit}
          onKeyDown={handleKey}
        />
        
        <box height={1} />
        
        <text>
          <span style={{ fg: Colors.muted, dim: true }}>
            Enter to save, Esc to go back
          </span>
        </text>
      </Show>
      
      {/* Error/Success Messages */}
      <Show when={error()}>
        <text>
          <span style={{ fg: Colors.error }}>
            ❌ {error()}
          </span>
        </text>
      </Show>
      
      <Show when={success()}>
        <text>
          <span style={{ fg: Colors.success }}>
            ✅ {success()}
          </span>
        </text>
      </Show>
      
      <box flexGrow={1} />
      
      <text>
        <span style={{ fg: Colors.muted, dim: true }}>
          Your API key will be stored in ~/.pi/agent/auth.json
        </span>
      </text>
    </box>
  );
}

export default ApiKeyDialog;
