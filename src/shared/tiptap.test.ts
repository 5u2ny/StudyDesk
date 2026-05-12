import { describe, expect, test } from 'vitest';
import { allTextFromTipTapJson, parseTipTapJson, textFromTipTapJson, textOfTipTapNode, walkTipTapDoc } from './tiptap';

const doc = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project plan' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Scope and risk.' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Budget' }] }] },
      ],
    },
  ],
});

describe('TipTap shared utilities', () => {
  test('parseTipTapJson returns null for invalid content', () => {
    expect(parseTipTapJson('{not json')).toBeNull();
    expect(parseTipTapJson('')).toBeNull();
  });

  test('walkTipTapDoc visits nested nodes in document order', () => {
    const seen: string[] = [];
    walkTipTapDoc(parseTipTapJson(doc), node => {
      if (node.type) seen.push(node.type);
    });
    expect(seen).toEqual(['doc', 'heading', 'text', 'paragraph', 'text', 'bulletList', 'listItem', 'paragraph', 'text']);
  });

  test('textOfTipTapNode reads recursive text', () => {
    const parsed = parseTipTapJson(doc);
    expect(textOfTipTapNode(parsed?.content?.[2])).toBe('Budget');
  });

  test('textFromTipTapJson preserves block boundaries', () => {
    expect(textFromTipTapJson(doc)).toBe('Project plan\nScope and risk.\nBudget');
  });

  test('textFromTipTapJson returns fallback for raw legacy text', () => {
    expect(textFromTipTapJson('plain text', { fallback: 'plain text' })).toBe('plain text');
  });

  test('allTextFromTipTapJson reads every text node with spaces', () => {
    expect(allTextFromTipTapJson(doc)).toBe('Project plan Scope and risk. Budget');
  });
});
