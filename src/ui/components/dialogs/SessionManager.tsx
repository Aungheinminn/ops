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

interface ListItem {
  type: 'header' | 'session';
  id: string;
  displayText: string;
  timestamp?: string;
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
  let boxRef: { focus(): void } | undefined;
  let scrollboxRef: { scrollTop: number; scrollTo: (line: number) => void } | undefined;

  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [deleteConfirmationId, setDeleteConfirmationId] = createSignal<string | null>(null);
  const [frame, setFrame] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal('');

  onMount(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 200);
    
    
    setTimeout(() => {
      boxRef?.focus();
      
      const items = listItems();
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'session') {
          setSelectedIndex(i);
          break;
        }
      }
    }, 50);
    
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

  const listItems = createMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    
    const allGroups = [...activeGroups(), ...inactiveGroups()];

    allGroups.forEach((group) => {
      
      items.push({
        type: 'header',
        id: `header-${group.date}`,
        displayText: group.date,
      });

      // Add sessions
      group.sessions.forEach((session) => {
        const showDeleteConfirm = deleteConfirmationId() === session.id;
        const prefix = showDeleteConfirm ? '[DELETE?] ' : (session.isLoading ? SPINNER_FRAMES[frame()] + ' ' : '');
        const timeStr = formatTime(session.lastActivity);
        // sessionName without leading spaces (cursor ▶ will add 2 chars in render)
        const sessionName = `${prefix}${session.name}`;

        items.push({
          type: 'session',
          id: session.id,
          displayText: sessionName,
          timestamp: timeStr,
        });
      });
    });

    return items;
  });

  const activeSessionIds = createMemo(() => {
    const ids = new Set<string>();
    activeGroups().forEach(g => g.sessions.forEach(s => ids.add(s.id)));
    return ids;
  });

  // Find next selectable index (skip headers)
  const findNextSelectableIndex = (startIndex: number, direction: 1 | -1): number => {
    const items = listItems();
    let index = startIndex;
    for (let i = 0; i < items.length; i++) {
      index += direction;
      if (index < 0) index = items.length - 1;
      if (index >= items.length) index = 0;
      if (items[index].type === 'session') return index;
    }
    return startIndex;
  };

  // Auto-scroll to keep selected item in view
  createEffect(() => {
    const idx = selectedIndex();
    if (scrollboxRef && idx >= 0) {
      const viewportHeight = 16;
      const scrollTop = scrollboxRef.scrollTop;
      const scrollBottom = scrollTop + viewportHeight - 1;

      // If selected item is above viewport, scroll up (show header if possible)
      if (idx < scrollTop) {
        // Scroll to show the item and its header (if exists)
        const targetScroll = Math.max(0, idx - 1);
        scrollboxRef.scrollTo(targetScroll);
      }
      // If selected item is below viewport, scroll down
      else if (idx > scrollBottom) {
        scrollboxRef.scrollTo(idx - viewportHeight + 1);
      }
    }
  });

  const handleKey = (e: KeyEvent) => {
    const name = e.name?.toLowerCase();
    const ctrl = e.ctrl;
    const items = listItems();

    // Handle up/down to skip headers
    if (name === 'up') {
      const nextIndex = findNextSelectableIndex(selectedIndex(), -1);
      if (nextIndex !== selectedIndex()) {
        setSelectedIndex(nextIndex);
        setDeleteConfirmationId(null);
      }
      e.preventDefault();
      return;
    }

    if (name === 'down') {
      const nextIndex = findNextSelectableIndex(selectedIndex(), 1);
      if (nextIndex !== selectedIndex()) {
        setSelectedIndex(nextIndex);
        setDeleteConfirmationId(null);
      }
      e.preventDefault();
      return;
    }

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
      const item = items[selectedIndex()];
      if (item?.type === 'session') {
        if (deleteConfirmationId() === item.id) {
          props.onDelete(item.id);
          setDeleteConfirmationId(null);
        } else {
          setDeleteConfirmationId(item.id);
        }
      }
      e.preventDefault();
      return;
    }

    if (ctrl && name === 'r') {
      const item = items[selectedIndex()];
      if (item?.type === 'session') {
        props.onRename(item.id, '');
      }
      e.preventDefault();
      return;
    }

    if (name === 'return') {
      const item = items[selectedIndex()];
      if (item?.type === 'session') {
        const isActive = activeSessionIds().has(item.id);
        props.onSelect(item.id, isActive);
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
      ref={(r) => { boxRef = r as { focus(): void }; }}
      width="70%"
      minWidth={60}
      maxHeight={30}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor="#1e1e2e"
      focusable={true}
      onKeyDown={handleKey}
    >
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

      <scrollbox
        flexDirection="column"
        height={16}
        scrollbarOptions={{ visible: false }}
        ref={(r) => { scrollboxRef = r as { scrollTop: number; scrollTo: (line: number) => void }; }}
        focusable={false}
      >
        <For each={listItems()}>
          {(item, index) => {
            const isSelected = () => selectedIndex() === index();
            const isHeader = () => item.type === 'header';

            return (
              <box
                height={1}
                backgroundColor={isSelected() && !isHeader() ? Colors.primaryDark : '#1e1e2e'}
              >
                {isHeader() ? (
                  <text>
                    <span style={{ fg: Colors.muted }}>
                      {item.displayText}
                    </span>
                  </text>
                ) : (
                  <box flexDirection="row" justifyContent="space-between" width="100%" paddingLeft={1} paddingRight={1}>
                    <text>
                      <span style={{
                        fg: isSelected() ? Colors.white : Colors.light,
                        bold: isSelected()
                      }}>
                        {isSelected() ? '▶ ' : '  '}{item.displayText}
                      </span>
                    </text>
                    <text>
                      <span style={{
                        fg: isSelected() ? Colors.white : Colors.light,
                        bold: isSelected()
                      }}>
                        {item.timestamp}
                      </span>
                    </text>
                  </box>
                )}
              </box>
            );
          }}
        </For>
      </scrollbox>

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
