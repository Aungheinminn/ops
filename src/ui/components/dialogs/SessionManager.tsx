import { createSignal, createMemo, createEffect, onMount, Show, For } from 'solid-js';
import type { KeyEvent } from '@opentui/core';
import { Colors } from '../../../core/types.js';
import type { SessionListItem } from '../../../core/session/types.js';
import type { SessionMetadata } from '../../../core/storage/types.js';

interface SessionManagerProps {
  sessions: Record<string, SessionListItem>;
  activeId: string | null;
  savedSessions: SessionMetadata[];
  onSelect: (sessionId: string, isActive: boolean) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, newName: string) => void;
  onCancel: () => void;
}

interface SessionGroup {
  date: string;
  sessions: SessionListItem[];
  isActive: boolean;
}

interface SelectOption {
  name: string;
  value: string;
  description: string;
}

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function SessionManager(props: SessionManagerProps) {
  let selectRef: unknown;

  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [deleteConfirmationId, setDeleteConfirmationId] = createSignal<string | null>(null);
  const [frame, setFrame] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal('');

  onMount(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 200);
    return () => clearInterval(interval);
  });

  const allSessions = createMemo(() => Object.values(props.sessions));

  const filteredSessions = createMemo(() => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return allSessions();
    return allSessions().filter(s => s.name.toLowerCase().includes(query));
  });

  const activeSessions = createMemo(() => 
    filteredSessions().filter(s => s.isLoading)
  );
  
  const inactiveSessions = createMemo(() => {
    const activeIds = new Set(Object.keys(props.sessions));
    const inactiveFromStore = filteredSessions().filter(s => !s.isActive && !s.isLoading);
    const query = searchQuery().toLowerCase().trim();
    
    const savedInactive = props.savedSessions
      .filter(s => !activeIds.has(s.id))
      .filter(s => !query || s.name.toLowerCase().includes(query))
      .map(s => ({
        id: s.id,
        name: s.name,
        cwd: s.cwd,
        lastActivity: s.updatedAt,
        messages: [],
        isLoading: false,
        isActive: false,
      } as SessionListItem));
    
    return [...inactiveFromStore, ...savedInactive].sort((a, b) => b.lastActivity - a.lastActivity);
  });

  const activeGroups = createMemo<SessionGroup[]>(() => {
    const groups = new Map<string, SessionListItem[]>();
    
    for (const session of activeSessions()) {
      const key = formatDate(new Date(session.lastActivity));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    
    return Array.from(groups.entries())
      .map(([date, sessions]) => ({
        date,
        sessions: sessions.sort((a, b) => b.lastActivity - a.lastActivity),
        isActive: true,
      }))
      .filter(g => g.sessions.length > 0);
  });

  const inactiveGroups = createMemo<SessionGroup[]>(() => {
    const groups = new Map<string, SessionListItem[]>();
    
    for (const session of inactiveSessions()) {
      const key = formatDate(new Date(session.lastActivity));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    
    return Array.from(groups.entries())
      .map(([date, sessions]) => ({
        date,
        sessions: sessions.sort((a, b) => b.lastActivity - a.lastActivity),
        isActive: false,
      }))
      .filter(g => g.sessions.length > 0);
  });

  const selectOptions = createMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [];
    const maxWidth = 55;
    
    activeGroups().forEach((group) => {
      options.push({ name: group.date, value: `header-${group.date}`, description: '' });
      group.sessions.forEach((session) => {
        const showDeleteConfirm = deleteConfirmationId() === session.id;
        const prefix = showDeleteConfirm ? '[DELETE?] ' : (session.isLoading ? SPINNER_FRAMES[frame()] + ' ' : '');
        const timeStr = formatTime(session.lastActivity);
        const sessionName = `${prefix}${session.name}`;
        const padding = Math.max(1, maxWidth - sessionName.length - timeStr.length);
        const name = sessionName + ' '.repeat(padding) + timeStr;
        options.push({ name, value: session.id, description: '' });
      });
    });

    if (activeGroups().length > 0 && inactiveGroups().length > 0) {
      options.push({ name: '─'.repeat(maxWidth), value: 'divider', description: '' });
    }

    inactiveGroups().forEach((group) => {
      options.push({ name: group.date, value: `header-${group.date}-inactive`, description: '' });
      group.sessions.forEach((session) => {
        const showDeleteConfirm = deleteConfirmationId() === session.id;
        const prefix = showDeleteConfirm ? '[DELETE?] ' : '';
        const timeStr = formatTime(session.lastActivity);
        const sessionName = `${prefix}${session.name}`;
        const padding = Math.max(1, maxWidth - sessionName.length - timeStr.length);
        const name = sessionName + ' '.repeat(padding) + timeStr;
        options.push({ name, value: session.id, description: '' });
      });
    });

    return options;
  });

  const sessionIdFromIndex = (index: number): string | null => {
    const options = selectOptions();
    if (index >= 0 && index < options.length) {
      const value = options[index].value;
      if (!value.startsWith('header-') && value !== 'divider') {
        return value;
      }
    }
    return null;
  };

  const activeSessionIds = createMemo(() => {
    const ids = new Set<string>();
    activeGroups().forEach(g => g.sessions.forEach(s => ids.add(s.id)));
    return ids;
  });

  const handleSelectChange = (index: number) => {
    setSelectedIndex(index);
    setDeleteConfirmationId(null);
  };

  const handleKey = (e: KeyEvent) => {
    const name = e.name?.toLowerCase();
    const ctrl = e.ctrl;

    if (name === 'escape') {
      if (searchQuery()) {
        setSearchQuery('');
        setSelectedIndex(0);
      } else {
        props.onCancel();
      }
      e.preventDefault();
      return;
    }

    if (ctrl && name === 'd') {
      const sessionId = sessionIdFromIndex(selectedIndex());
      if (sessionId) {
        if (deleteConfirmationId() === sessionId) {
          props.onDelete(sessionId);
          setDeleteConfirmationId(null);
        } else {
          setDeleteConfirmationId(sessionId);
        }
      }
      e.preventDefault();
      return;
    }

    if (ctrl && name === 'r') {
      const sessionId = sessionIdFromIndex(selectedIndex());
      if (sessionId) {
        props.onRename(sessionId, '');
      }
      e.preventDefault();
      return;
    }

    if (name === 'return') {
      const sessionId = sessionIdFromIndex(selectedIndex());
      if (sessionId) {
        const isActive = activeSessionIds().has(sessionId);
        props.onSelect(sessionId, isActive);
      }
      e.preventDefault();
      return;
    }

    if (name === 'backspace') {
      if (searchQuery()) {
        setSearchQuery(q => q.slice(0, -1));
        setSelectedIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (name && name.length === 1 && !ctrl && !e.meta) {
      setSearchQuery(q => q + name);
      setSelectedIndex(0);
      setDeleteConfirmationId(null);
      e.preventDefault();
      return;
    }
  };

  return (
    <box
      width="70%"
      minWidth={60}
      maxHeight={30}
      border={true}
      borderStyle="rounded"
      borderColor={Colors.border}
      backgroundColor="#1e1e2e"
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
    >
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text>
          <span style={{ bold: true, fg: Colors.white }}>Sessions</span>
        </text>
        <text>
          <span style={{ fg: Colors.muted }}>esc</span>
        </text>
      </box>

      <box height={1} />

      <Show
        when={searchQuery()}
        fallback={
          <text>
            <span style={{ fg: Colors.muted }}>Type to search sessions</span>
          </text>
        }
      >
        <box flexDirection="row" alignItems="center">
          <text flexShrink={0}>
            <span style={{ fg: Colors.muted }}>Search: </span>
          </text>
          <text>
            <span style={{ fg: Colors.white, bold: true }}>{searchQuery()}</span>
          </text>
        </box>
      </Show>

      <box height={1} />

      <select
        ref={(r) => { 
          selectRef = r;
          setTimeout(() => (r as { focus(): void })?.focus(), 50);
        }}
        flexGrow={1}
        height={16}
        options={selectOptions()}
        selectedIndex={selectedIndex()}
        onChange={handleSelectChange}
        onKeyDown={handleKey}
        backgroundColor="#1e1e2e"
        textColor={Colors.light}
        selectedBackgroundColor="#eebb99"
        selectedTextColor="#000000"
        focusedBackgroundColor={Colors.primaryDark}
        focusedTextColor={Colors.white}
      />

      <box height={1} />

      <box flexDirection="row">
        <text>
          <span style={{ bold: true, fg: Colors.white }}>delete </span>
          <span style={{ fg: Colors.muted }}>ctrl+d</span>
        </text>
        <box width={2} />
        <text>
          <span style={{ bold: true, fg: Colors.white }}>rename </span>
          <span style={{ fg: Colors.muted }}>ctrl+r</span>
        </text>
        <box width={2} />
        <text>
          <span style={{ bold: true, fg: Colors.white }}>search </span>
          <span style={{ fg: Colors.muted }}>type</span>
        </text>
      </box>
    </box>
  );
}

export default SessionManager;
