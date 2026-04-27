export function containsMarkdown(content: string): boolean {
  if (!content || content.length < 2) return false;

  const markdownPatterns = [
    /^#{1,6}\s/m,
    /\*\*.*?\*\*/,
    /\*[^*]+\*/,
    /`[^`]+`/,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /^\s*>\s/m,
    /\[.*?\]\(.*?\)/,
  ];

  return markdownPatterns.some(pattern => pattern.test(content));
}

export function stripMarkdown(content: string): string {
  if (!content) return '';

  return content
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .trim();
}

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fg?: string;
  bg?: string;
}

export const HEADER_COLORS = [
  '#3b82f6',
  '#3b82f6',
  '#60a5fa',
  '#9ca3af',
  '#6b7280',
  '#6b7280',
];
