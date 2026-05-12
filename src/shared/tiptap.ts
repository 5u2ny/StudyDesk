export interface TipTapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: TipTapNode[];
}

const DEFAULT_TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'horizontalRule',
]);

export function parseTipTapJson(raw: string): TipTapNode | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function walkTipTapDoc(
  node: TipTapNode | null | undefined,
  visit: (node: TipTapNode, parent?: TipTapNode) => void,
  parent?: TipTapNode,
): void {
  if (!node) return;
  visit(node, parent);
  if (Array.isArray(node.content)) {
    for (const child of node.content) walkTipTapDoc(child, visit, node);
  }
}

export function textOfTipTapNode(node: TipTapNode | null | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(textOfTipTapNode).join('');
}

export function textFromTipTapJson(
  raw: string,
  opts: { blockTypes?: ReadonlySet<string>; fallback?: string } = {},
): string {
  const doc = parseTipTapJson(raw);
  if (!doc) return opts.fallback ?? '';

  const blockTypes = opts.blockTypes ?? DEFAULT_TEXT_BLOCK_TYPES;
  const lines: string[] = [];
  const collectBlocks = (node: TipTapNode) => {
    if (node.type && blockTypes.has(node.type)) {
      lines.push(textOfTipTapNode(node));
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(collectBlocks);
  };

  collectBlocks(doc);
  return lines.join('\n').trim();
}

export function allTextFromTipTapJson(raw: string, fallback = ''): string {
  const doc = parseTipTapJson(raw);
  if (!doc) return fallback;

  const parts: string[] = [];
  walkTipTapDoc(doc, node => {
    if (typeof node.text === 'string') parts.push(node.text);
  });
  return parts.join(' ').trim();
}
