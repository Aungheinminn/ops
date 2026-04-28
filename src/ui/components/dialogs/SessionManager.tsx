import { createSignal, createMemo, Index, createEffect, onMount, Show, For } from 'solid-js';
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
  const [isSearching, setIsSearching] = createSignal(false);

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

  const allNavigableSessions = createMemo(() => {
    const result: { session: SessionListItem; groupIndex: number; sessionIndex: number; isActive: boolean }[] = [];
    
    activeGroups().forEach((group, gIdx) => {
      group.sessions.forEach((session, sIdx) => {
        result.push({ session, groupIndex: gIdx, sessionIndex: sIdx, isActive: true });
      });
    });
    
    inactiveGroups().forEach((group, gIdx) => {
      group.sessions.forEach((session, sIdx) => {
        result.push({ session, groupIndex: gIdx, sessionIndex: sIdx, isActive: false });
      });
    });
    
    return result;
  });

  const maxIndex = createMemo(() => Math.max(0, allNavigableSessions().length - 1));

  onMount(() => {
    setTimeout(() => {
      boxRef?.focus();
    }, 50);
  });

  createEffect(() => {
    const idx = selectedIndex();
    if (scrollboxRef) {
      const viewportHeight = 12;
      const scrollTop = scrollboxRef.scrollTop;
      const scrollBottom = scrollTop + viewportHeight;

      if (idx < scrollTop) {
        scrollboxRef.scrollTo(idx);
      } else if (idx >= scrollBottom) {
        scrollboxRef.scrollTo(idx - viewportHeight + 1);
      }
    }
  });

  const handleKey = (e: KeyEvent) => {
    const name = e.name;
    const ctrl = e.ctrl;

    if (name === 'escape') {
      if (isSearching() && searchQuery()) {
        setSearchQuery('');
        setIsSearching(false);
        setSelectedIndex(0);
      } else {
        props.onCancel();
      }
      e.preventDefault();
      return;
    }

    if (ctrl && name === 'd') {
      const selected = allNavigableSessions()[selectedIndex()];
      if (selected) {
        if (deleteConfirmationId() === selected.session.id) {
          props.onDelete(selected.session.id);
          setDeleteConfirmationId(null);
        } else {
          setDeleteConfirmationId(selected.session.id);
        }
      }
      e.preventDefault();
      return;
    }

    if (ctrl && name === 'r') {
      const selected = allNavigableSessions()[selectedIndex()];
      if (selected) {
        props.onRename(selected.session.id, '');
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

    if (name === 'up') {
      setSelectedIndex(i => (i > 0 ? i - 1 : maxIndex()));
      setDeleteConfirmationId(null);
      e.preventDefault();
    } else if (name === 'down') {
      setSelectedIndex(i => (i < maxIndex() ? i + 1 : 0));
      setDeleteConfirmationId(null);
      e.preventDefault();
    } else if (name === 'return') {
      const selected = allNavigableSessions()[selectedIndex()];
      if (selected) {
        props.onSelect(selected.session.id, selected.isActive);
      }
      e.preventDefault();
    } else if (name && name.length === 1 && !ctrl && !e.meta) {
      setIsSearching(true);
      setSearchQuery(q => q + name);
      setSelectedIndex(0);
      setDeleteConfirmationId(null);
      e.preventDefault();
    }
  };

  const isSelected = (sessionId: string) => {
    const selected = allNavigableSessions()[selectedIndex()];
    return selected?.session.id === sessionId;
  };

  return (
    <box
      ref={(r) => { boxRef = r as { focus(): void }; }}
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
      focusable={true}
      onKeyDown={handleKey}
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

      <scrollbox
        flexDirection="column"
        flexGrow={1}
        height={16}
        scrollbarOptions={{ visible: false }}
        ref={(r) => { scrollboxRef = r as { scrollTop: number; scrollTo: (line: number) => void }; }}
      >
        <Show when={activeGroups().length > 0}>
          <box flexDirection="column">
            <For each={activeGroups()}>
              {(group) => (
                <box flexDirection="column">
                  <text>
                    <span style={{ fg: Colors.primary, bold: true }}>{group.date}</span>
                  </text>
                  <For each={group.sessions}>
                    {(session) => {
                      const isSel = isSelected(session.id);
                      const isActive = props.activeId === session.id;
                      const showDeleteConfirm = deleteConfirmationId() === session.id;
                      
                      return (
                        <box
                          height={1}
                          backgroundColor={isActive ? '#eebb99' : (isSel ? Colors.primaryDark : undefined)}
                          flexDirection="row"
                          alignItems="center"
                          paddingLeft={1}
                        >
                          <text flexGrow={1}>
                            <span style={{ 
                              fg: isActive ? '#000000' : (isSel ? Colors.white : Colors.light),
                              bold: isSel || isActive
                            }}>
                              {isSel ? '→ ' : '  '}
                              {session.isLoading ? `${SPINNER_FRAMES[frame()]} ` : ''}
                              {showDeleteConfirm ? `[DELETE?] ` : ''}
                              {session.name}
                            </span>
                          </text>
                          <text flexShrink={0}>
                            <span style={{ 
                              fg: isActive ? '#666666' : Colors.muted,
                              dim: true 
                            }}>
                              {formatTime(session.lastActivity)}
                            </span>
                          </text>
                        </box>
                      );
                    }}
                  </For>
                </box>
              )}
            </For>
          </box>
        </Show>

        <Show when={activeGroups().length > 0 && inactiveGroups().length > 0}>
          <box width="100%" height={1} border={true} borderStyle="single" borderColor={Colors.border} />
        </Show>

        <Show when={inactiveGroups().length > 0}>
          <box flexDirection="column">
            <For each={inactiveGroups()}>
              {(group) => (
                <box flexDirection="column">
                  <text>
                    <span style={{ fg: Colors.primary, bold: true }}>{group.date}</span>
                  </text>
                  <For each={group.sessions}>
                    {(session) => {
                      const isSel = isSelected(session.id);
                      const showDeleteConfirm = deleteConfirmationId() === session.id;
                      
                      return (
                        <box
                          height={1}
                          backgroundColor={isSel ? Colors.primaryDark : undefined}
                          flexDirection="row"
                          alignItems="center"
                          paddingLeft={1}
                        >
                          <text flexGrow={1}>
                            <span style={{ 
                              fg: isSel ? Colors.white : Colors.light,
                              bold: isSel
                            }}>
                              {isSel ? '→ ' : '  '}
                              {showDeleteConfirm ? `[DELETE?] ` : ''}
                              {session.name}
                            </span>
                          </text>
                          <text flexShrink={0}>
                            <span style={{ fg: Colors.muted, dim: true }}>
                              {formatTime(session.lastActivity)}
                            </span>
                          </text>
                        </box>
                      );
                    }}
                  </For>
                </box>
              )}
            </For>
          </box>
        </Show>

        <Show when={allNavigableSessions().length === 0}>
          <box height={3} justifyContent="center" alignItems="center">
            <text>
              <span style={{ fg: Colors.muted }}>No sessions found</span>
            </text>
          </box>
        </Show>
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
