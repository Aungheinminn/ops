/**
 * Markdown utilities for Terminal UI
 * 
 * Simplified approach: regex-based formatting instead of full AST parsing
 */

/**
 * Check if content contains markdown syntax
 * Simple heuristic for conditional rendering
 */
export function containsMarkdown(content: string): boolean {
  if (!content || content.length < 2) return false;
  
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers
    /\*\*.*?\*\*/,          // Bold
    /\*[^*]+\*/,            // Italic
    /`[^`]+`/,              // Inline code
    /^\s*[-*+]\s/m,         // Unordered lists
    /^\s*\d+\.\s/m,          // Ordered lists
    /^\s*>\s/m,             // Blockquotes
    /\[.*?\]\(.*?\)/,       // Links
  ];
  
  return markdownPatterns.some(pattern => pattern.test(content));
}

/**
 * Strip markdown syntax for plain text fallback
 */
export function stripMarkdown(content: string): string {
  if (!content) return '';
  
  return content
    .replace(/\*\*(.*?)\*\*/g, '$1')      // Remove bold
    .replace(/\*(.*?)\*/g, '$1')          // Remove italic
    .replace(/`(.*?)`/g, '$1')            // Remove inline code
    .replace(/^#{1,6}\s*/gm, '')          // Remove headers
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')   // Remove links, keep text
    .trim();
}

/**
 * Simple text style interface
 */
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fg?: string;
  bg?: string;
}

/**
 * Header colors by level (for reference)
 */
export const HEADER_COLORS = [
  '#3b82f6', // H1 - bright blue
  '#3b82f6', // H2 - bright blue
  '#60a5fa', // H3 - light blue
  '#9ca3af', // H4 - gray
  '#6b7280', // H5 - darker gray
  '#6b7280', // H6 - darker gray
];
