# Markdown Support Plan for Ops TUI

## Executive Summary

This plan outlines the strategy for adding markdown rendering capabilities to the Ops Terminal UI application. Currently, all text content is rendered as plain text. This plan identifies **which events/components need markdown support**, provides **implementation insight**, and proposes a **phased approach**.

---

## 1. Current State Analysis

### 1.1 Architecture Overview
- **Framework**: SolidJS with @opentui (terminal UI library)
- **Content Flow**: AI responses stream in via `text_delta` events → stored in message store → rendered in components
- **Content Types**: `TextBlock`, `ThinkingBlock`, `ToolCallBlock`, `ToolResultBlock`

### 1.2 Current Rendering (Plain Text Only)

```tsx
// TextBlock.tsx - Current Implementation
export function TextBlock(props: TextBlockProps) {
  return (
    <text>
      {props.block.content || ' '}
    </text>
  );
}
```

**Problem**: Markdown syntax (e.g., `**bold**`, `` `code` ``, `## headers`) is displayed literally instead of being formatted.

---

## 2. Which Events/Components Need Markdown?

### 2.1 Primary Target: TextBlock (HIGH PRIORITY)

**Event Source**: `text_delta` events from AI assistant responses

**Why Markdown Matters Here**:
AI assistants frequently output markdown-formatted content including:

| Markdown Feature | Use Case | Example |
|-----------------|----------|---------|
| **Headers** (`#`, `##`) | Section organization | `## Installation` |
| **Bold/Italic** (`**`, `*`) | Emphasis | `**Important:** Run this first` |
| **Inline Code** (`` ` ``) | Commands/variables | ``Run `npm install` `` |
| **Code Blocks** (` ``` `) | Multi-line code snippets | ` ```typescript\nconst x = 1;\n``` ` |
| **Lists** (`-`, `*`, `1.`) | Step-by-step instructions | `- First step\n- Second step` |
| **Links** (`[text](url)`) | References | `[Docs](https://example.com)` |
| **Blockquotes** (`>`) | Quotes/notes | `> Note: This is experimental` |
| **Tables** (`|`) | Structured data comparison | `| Option | Pros |` |
| **Horizontal Rules** (`---`) | Section dividers | `---` |

**Example of Current vs. Desired Output**:

```markdown
## Features

- **Fast**: Built with Bun
- **Type-safe**: Full TypeScript support

Run `ops init` to get started.
```

**Current** (plain text):
```
## Features

- **Fast**: Built with Bun
- **Type-safe**: Full TypeScript support

Run `ops init` to get started.
```

**Desired** (rendered):
```
Features                    ← bold, larger

• Fast: Built with Bun      ← bullet, bold word
• Type-safe: Full TypeScript support

Run ops init to get started. ← inline code styled
```

### 2.2 Secondary Target: ToolResultBlock (MEDIUM PRIORITY)

**Event Source**: `tool_execution_end` events with result content

**Why Markdown Matters Here**:
Tool results often contain:
- File contents (which may have markdown)
- Command output with formatting
- Error messages with code references
- Structured data that benefits from tables/lists

**Example**: A `read_file` tool might return a markdown README - currently shown as raw text.

### 2.3 Out of Scope (LOW/NO PRIORITY)

| Component | Reason |
|-----------|--------|
| `ThinkingBlock` | Internal reasoning, not user-facing; raw text is fine |
| `ToolCallBlock` | Structured data (name, arguments), not prose |
| `UserMessage` | User input is typically plain text commands |

---

## 3. Key Insight: TUI-Specific Considerations

### 3.1 The Terminal Constraint

Unlike web browsers, terminal UIs have unique constraints:

| Feature | Web Browser | Terminal UI |
|---------|-------------|-------------|
| **Rendering** | HTML/CSS DOM | Character grid with ANSI colors |
| **Layout** | Flexible, pixel-precise | Fixed-width monospace characters |
| **Images** | Supported via `<img>` | Not supported (use ASCII art or skip) |
| **Links** | Clickable hyperlinks | May use OSC 8 escape sequences |
| **Fonts** | Rich typography | Single monospace font |

**Implication**: We need a **terminal-aware markdown renderer** that converts markdown to @opentui components (`<text>`, `<box>`, `<span>` with style props) rather than HTML.

### 3.2 Streaming Content Challenge

Content arrives incrementally via `text_delta` events:

```typescript
// Event 1: "## Feat"
// Event 2: "## Features\n\n- **Bo"
// Event 3: "## Features\n\n- **Bold** text"
```

**Challenge**: Markdown parsing typically requires complete content. Partial markdown can cause flickering or incorrect rendering.

**Solution Approaches**:
1. **Debounce rendering**: Wait for streaming to complete or pause
2. **Incremental parser**: Use a streaming-capable markdown parser
3. **Hybrid approach**: Show plain text while streaming, render markdown when complete

### 3.3 Available Dependencies

Current `package.json` dependencies:
- `@opentui/core` & `@opentui/solid`: Terminal UI components
- `chalk`: ANSI color utilities (may be useful)

**No markdown parser currently included** - will need to add one.

---

## 4. Recommended Implementation Approach

### 4.1 Phase 1: Basic Markdown Support (MVP)

**Goal**: Support most common markdown features in `TextBlock`

**Implementation Steps**:

1. **Add markdown parser dependency**
   ```bash
   bun add marked  # or unified/remark
   ```

2. **Create MarkdownRenderer component**
   ```tsx
   // components/MarkdownRenderer.tsx
   export function MarkdownRenderer(props: { content: string }) {
     // Parse markdown to intermediate representation
     // Convert to @opentui components
   }
   ```

3. **Update TextBlock to use MarkdownRenderer**
   ```tsx
   export function TextBlock(props: TextBlockProps) {
     return <MarkdownRenderer content={props.block.content} />;
   }
   ```

**Supported Features for MVP**:
- Headers (H1-H6) → Bold + size variation
- Bold (`**text**`) → Bold text
- Italic (`*text*`) → Italic/underline
- Inline code (`` `code` ``) → Muted background color
- Code blocks → Box with border + muted text
- Lists (`-`, `*`, `1.`) → Bullet/number prefix
- Blockquotes (`>`) → Left border + muted color

**Deferred Features**:
- Tables (complex layout in terminals)
- Links (may add later with OSC 8 support)
- Images (not applicable)
- HTML blocks (not applicable)

### 4.2 Phase 2: Streaming-Aware Rendering

**Goal**: Handle incremental content without flickering

**Approach**:
```typescript
// Pseudocode
function TextBlock(props) {
  const [isStreaming] = useMessageStore(); // Get streaming state
  
  return (
    <Show 
      when={!isStreaming()} 
      fallback={<PlainText content={props.block.content} />}
    >
      <MarkdownRenderer content={props.block.content} />
    </Show>
  );
}
```

Show plain text while streaming, switch to rendered markdown when complete.

### 4.3 Phase 3: Tool Result Enhancement

**Goal**: Add markdown support to `ToolResultBlock`

**Considerations**:
- Some tool results are plain text (commands, errors)
- Some are markdown (file contents)
- Need heuristic or explicit flag to determine format

**Implementation**:
```typescript
export function ToolResultBlock(props: ToolResultBlockProps) {
  const shouldRenderMarkdown = () => {
    // Heuristic: check for markdown indicators
    const content = props.block.content;
    return content.includes('#') || 
           content.includes('```') || 
           content.includes('**');
  };
  
  return (
    <Show 
      when={shouldRenderMarkdown()}
      fallback={<PlainText content={props.block.content} />}
    >
      <MarkdownRenderer content={props.block.content} />
    </Show>
  );
}
```

---

## 5. Technical Design

### 5.1 Proposed Component Architecture

```
TextBlock
└── MarkdownRenderer (new)
    ├── HeaderNode → <text style={{ bold, size: 'large' }}>
    ├── ParagraphNode → <text>
    ├── CodeBlockNode → <box border> + <text style={{ fg: muted }}>
    ├── ListNode → <box flexDirection="column">
    │   └── ListItemNode → <text>• content</text>
    ├── InlineCodeNode → <text style={{ bg: muted }}>
    └── StrongNode → <text style={{ bold }}
```

### 5.2 Style Mapping

| Markdown Element | @opentui Style |
|-----------------|----------------|
| H1 | `bold`, `fg: primary`, larger implied size |
| H2 | `bold`, `fg: primary` |
| H3-H6 | `bold` |
| Bold | `bold` |
| Italic | `italic` (if supported) or underline |
| Code (inline) | `bg: muted`, `fg: foreground` |
| Code (block) | Box with border, `fg: muted` |
| Blockquote | Left border, `fg: muted` |
| List item | Prefix with `•` or number |

### 5.3 Dependencies to Add

| Package | Purpose | Size |
|---------|---------|------|
| `marked` | Fast markdown parser | ~50KB |
| or `remark` + `remark-gfm` | Extensible parser with GFM | ~100KB |

**Recommendation**: `marked` for simplicity and speed in Phase 1. Consider `remark` ecosystem if need advanced plugins later.

---

## 6. Decision Matrix

### Which Components Get Markdown Support?

| Component | Priority | Rationale |
|-----------|----------|-----------|
| **TextBlock** | 🔴 HIGH | Primary AI response format; users see this most |
| **ToolResultBlock** | 🟡 MEDIUM | File contents often markdown; conditional support |
| **ThinkingBlock** | 🟢 LOW | Internal/debug output; plain text acceptable |
| **ToolCallBlock** | 🟢 LOW | Structured data; formatting not needed |
| **UserMessage** | 🟢 LOW | User input is plain text |

### Which Markdown Features First?

| Feature | Priority | Complexity | User Value |
|---------|----------|------------|------------|
| Headers | 🔴 HIGH | Low | High - structure visibility |
| Bold/Italic | 🔴 HIGH | Low | High - emphasis |
| Inline code | 🔴 HIGH | Low | High - commands stand out |
| Code blocks | 🔴 HIGH | Medium | High - readability |
| Lists | 🟡 MEDIUM | Medium | Medium - organization |
| Blockquotes | 🟡 MEDIUM | Low | Medium - notes/tips |
| Tables | 🟢 LOW | High | Medium - compare data |
| Links | 🟢 LOW | Medium | Low - can't click in TUI |

---

## 7. Open Questions

Before implementation, consider:

1. **Performance**: How large can AI responses get? Full markdown parsing on every update could be slow.

2. **Terminal Width**: Tables and wide code blocks may not fit. Should we wrap, truncate, or scroll horizontally?

3. **Color Scheme**: Should markdown elements use theme-aware colors? (e.g., headers use `primary` color)

4. **Nested Elements**: How to handle `**bold with *italic* inside**`? Parser must support nesting.

5. **GFM Extensions**: Do we need GitHub Flavored Markdown (task lists, strikethrough, tables)?

---

## 8. Implementation Checklist

### Phase 1: MVP
- [ ] Add `marked` dependency
- [ ] Create `MarkdownRenderer` component
- [ ] Implement AST-to-@opentui converter
- [ ] Update `TextBlock` to use markdown renderer
- [ ] Add basic styling for headers, bold, italic, code
- [ ] Test with common AI responses

### Phase 2: Polish
- [ ] Implement streaming-aware rendering (plain → markdown)
- [ ] Add list rendering
- [ ] Add blockquote rendering
- [ ] Performance optimization (memoization)

### Phase 3: Enhanced Tool Results
- [ ] Add markdown detection heuristic
- [ ] Update `ToolResultBlock` with conditional markdown

### Phase 4: Advanced Features (Optional)
- [ ] Table rendering (simplified)
- [ ] OSC 8 hyperlink support
- [ ] Custom theme integration

---

## 9. Summary

**Key Takeaways**:

1. **Primary Target**: `TextBlock` component for AI assistant responses
2. **Secondary Target**: `ToolResultBlock` for file contents
3. **Constraint**: Must render to terminal-compatible @opentui components
4. **Challenge**: Handle streaming content gracefully
5. **Approach**: Phase 1 = basic features, Phase 2 = streaming support

**Next Steps**:
1. Review this plan and decide on priorities
2. Choose markdown parser library
3. Implement Phase 1 (MVP)
4. Test with real AI responses
5. Iterate based on usage

---

*Plan created for Ops TUI - Markdown Support Initiative*
