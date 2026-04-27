import { Show, Index, createMemo } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { InputMode } from '../../../core/types.js';
import { Colors } from '../../../core/types.js';
import type { KeyEvent, TextareaRenderable, ScrollBoxRenderable } from '@opentui/core';
import { getAutocompleteCommands } from '../../../cli/commands.js';
import { LoadingSpinner } from '../LoadingSpinner.js';

interface InputBarProps {
  onSubmit: (text: string) => void;
  currentModel?: { id: string };
  isLoading?: boolean;
  interruptCount?: number;
}

const SLASH_COMMANDS = getAutocompleteCommands();

export function InputBar(props: InputBarProps) {
  let textarea: TextareaRenderable | undefined;
  let commandScroll: ScrollBoxRenderable | undefined;
  
  const [state, setState] = createStore({
    showCommands: false,
    commandFilter: "",
    selectedCommand: 0,
    isInserting: false,
    mode: "build" as InputMode,
    lineCount: 3,
  });
  
  const filteredCommands = createMemo(() => {
    if (!state.commandFilter) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(cmd =>
      cmd.name.toLowerCase().includes(state.commandFilter.toLowerCase())
    );
  });
  
  const popupHeight = createMemo(() => {
    const count = filteredCommands().length;
    return Math.min(10, Math.max(1, count));
  });
  
  const inputHeight = createMemo(() => {
    const textareaHeight = Math.max(3, Math.min(10, state.lineCount));
    const baseHeight = textareaHeight + 4;
    return state.showCommands ? baseHeight + popupHeight() : baseHeight;
  });
  
  const checkForSlashCommand = () => {
    if (state.isInserting) return;
    
    const text = textarea?.plainText ?? "";
    const cursorOffset = textarea?.cursorOffset ?? 0;
    const lines = text.split('\n').length;
    
    setState("lineCount", Math.min(10, Math.max(1, lines)));
    
    if (text.startsWith("/") && !text.slice(0, cursorOffset).includes(" ")) {
      const filter = text.slice(1, cursorOffset);
      setState({
        showCommands: true,
        commandFilter: filter,
        selectedCommand: 0,
      });
    } else {
      setState("showCommands", false);
    }
  };
  
  const moveSelection = (direction: number) => {
    const commands = filteredCommands();
    if (commands.length === 0) {
      setState("selectedCommand", 0);
      return;
    }
    
    let next = state.selectedCommand + direction;
    if (next < 0) next = commands.length - 1;
    if (next >= commands.length) next = 0;
    
    setState("selectedCommand", next);
    
    if (!commandScroll) return;
    const viewportHeight = Math.min(10, commands.length);
    const scrollBottom = commandScroll.scrollTop + viewportHeight;
    
    if (next < commandScroll.scrollTop) {
      commandScroll.scrollTo(next);
    } else if (next + 1 > scrollBottom) {
      commandScroll.scrollTo(next - viewportHeight + 1);
    }
  };
  
  const insertCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
    const newText = `/${cmd.name} `;
    if (textarea) {
      textarea.setText(newText);
      textarea.cursorOffset = newText.length;
    }
    setState({
      showCommands: false,
      isInserting: false,
    });
  };
  
  const handleSubmit = () => {
    const text = textarea?.plainText ?? "";
    if (text.trim()) {
      props.onSubmit(text);
      try {
        textarea?.setText("");
      } catch {}
      setState({
        showCommands: false,
        lineCount: 3,
      });
    }
  };
  
  const handleKey = (key: KeyEvent) => {
    if (!state.showCommands && key.name === "tab") {
      setState("mode", state.mode === "build" ? "plan" : "build");
      key.preventDefault();
      return;
    }
    
    if (!state.showCommands && key.name === "/" && (textarea?.cursorOffset ?? 0) === 0) {
      setState({
        showCommands: true,
        commandFilter: "",
        selectedCommand: 0,
      });
      return;
    }
    
    if (!state.showCommands) return;
    
    const name = key.name?.toLowerCase();
    
    if (name === "up" || (key.ctrl && name === "p")) {
      moveSelection(-1);
      key.preventDefault();
      return;
    }
    
    if (name === "down" || (key.ctrl && name === "n")) {
      moveSelection(1);
      key.preventDefault();
      return;
    }
    
    if (name === "escape") {
      setState("showCommands", false);
      key.preventDefault();
      return;
    }
    
    if (name === "return" || name === "tab") {
      const commands = filteredCommands();
      const selectedIdx = state.selectedCommand;
      
      if (selectedIdx >= 0 && selectedIdx < commands.length) {
        setState({
          showCommands: false,
          isInserting: true,
        });
        insertCommand(commands[selectedIdx]);
        key.preventDefault();
      } else {
        setState("showCommands", false);
      }
    }
  };
  
  const borderColor = () => state.mode === "plan" ? Colors.plan : Colors.build;
  
  const modeLabel = () => state.mode === "plan" ? "◎ " : "▶ ";
  const modeName = () => state.mode === "plan" ? "Plan " : "Build";
  const modeFg = () => state.mode === "plan" ? Colors.plan : Colors.build;
  
  return (
    <box
      height={inputHeight()}
      border={true}
      borderStyle="rounded"
      borderColor={borderColor()}
      focusedBorderColor={borderColor()}
      flexDirection="column"
      focusable={true}
    >
      <Show when={state.showCommands}>
        <scrollbox
          flexDirection="column"
          height={popupHeight()}
          scrollbarOptions={{ visible: false }}
          ref={(r: ScrollBoxRenderable) => (commandScroll = r)}
        >
          <Index each={filteredCommands()}>
            {(cmd, index) => (
              <box
                height={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={index === state.selectedCommand ? Colors.primary : undefined}
                flexDirection="row"
                gap={2}
              >
                <text flexShrink={0}>
                  <span style={{ bold: true, fg: index === state.selectedCommand ? Colors.white : Colors.primary }}>
                    /{cmd().name}
                  </span>
                </text>
                <text fg={index === state.selectedCommand ? Colors.white : Colors.muted}>
                  {cmd().description}
                </text>
              </box>
            )}
          </Index>
        </scrollbox>
      </Show>
      
      <box flexDirection="row" paddingLeft={1} paddingRight={1} height={state.lineCount}>
        <text flexShrink={0}>
          <span style={{ bold: true, fg: modeFg() }}>
            {modeLabel()}
          </span>
        </text>
        <textarea
          flexGrow={1}
          minHeight={3}
          maxHeight={10}
          placeholder={state.showCommands 
            ? "Type to filter commands, Enter to select" 
            : "Enter to send, Shift+Enter for new line, / for commands"
          }
          textColor={Colors.white}
          focusedTextColor={Colors.white}
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onSubmit={handleSubmit}
          onKeyDown={handleKey}
          onContentChange={checkForSlashCommand}
          ref={(val: TextareaRenderable) => {
            textarea = val;
            setTimeout(() => textarea?.focus(), 0);
          }}
        />
      </box>
      
      <Show when={props.isLoading}>
        <box height={1} paddingLeft={1}>
          <LoadingSpinner 
            isLoading={true} 
            message="Thinking..."
            interruptCount={props.interruptCount}
          />
        </box>
      </Show>
      
      <Show when={!props.isLoading}>
        <box flexGrow={1} minHeight={1} />
      </Show>
      
      <box height={1} paddingLeft={1}>
        <text>
          <span style={{ bold: true, fg: modeFg() }}>
            {modeName()}
          </span>
          <span style={{ fg: Colors.muted }}> (Tab to toggle)</span>
          <Show when={props.currentModel}>
            <span style={{ fg: Colors.muted }}> | Model: </span>
            <span style={{ fg: Colors.primary }}>{props.currentModel?.id}</span>
          </Show>
        </text>
      </box>
    </box>
  );
}
