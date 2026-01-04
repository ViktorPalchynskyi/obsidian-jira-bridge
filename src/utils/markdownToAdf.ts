interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
}

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface AdfDocument {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

export function markdownToAdf(markdown: string): AdfDocument {
  const lines = markdown.split('\n');
  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    const codeBlockResult = parseCodeBlock(lines, i);
    if (codeBlockResult) {
      content.push(codeBlockResult.node);
      i = codeBlockResult.nextIndex;
      continue;
    }

    const tableResult = parseTable(lines, i);
    if (tableResult) {
      content.push(tableResult.node);
      i = tableResult.nextIndex;
      continue;
    }

    const bulletListResult = parseBulletList(lines, i);
    if (bulletListResult) {
      content.push(bulletListResult.node);
      i = bulletListResult.nextIndex;
      continue;
    }

    const orderedListResult = parseOrderedList(lines, i);
    if (orderedListResult) {
      content.push(orderedListResult.node);
      i = orderedListResult.nextIndex;
      continue;
    }

    const headingResult = parseHeading(line);
    if (headingResult) {
      content.push(headingResult);
      i++;
      continue;
    }

    content.push(parseParagraph(line));
    i++;
  }

  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', version: 1, content };
}

function parseHeading(line: string): AdfNode | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;

  const level = match[1].length;
  const text = match[2];

  return {
    type: 'heading',
    attrs: { level },
    content: parseInlineContent(text),
  };
}

function parseCodeBlock(lines: string[], startIndex: number): { node: AdfNode; nextIndex: number } | null {
  const line = lines[startIndex];
  const match = line.match(/^```(\w*)$/);
  if (!match) return null;

  const language = match[1] || null;
  const codeLines: string[] = [];
  let i = startIndex + 1;

  while (i < lines.length && !lines[i].startsWith('```')) {
    codeLines.push(lines[i]);
    i++;
  }

  const node: AdfNode = {
    type: 'codeBlock',
    content: [{ type: 'text', text: codeLines.join('\n') }],
  };

  if (language) {
    node.attrs = { language };
  }

  return { node, nextIndex: i + 1 };
}

function parseBulletList(lines: string[], startIndex: number): { node: AdfNode; nextIndex: number } | null {
  if (!lines[startIndex].match(/^[-*]\s+/)) return null;

  const items: AdfNode[] = [];
  let i = startIndex;

  while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
    const text = lines[i].replace(/^[-*]\s+/, '');
    items.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: parseInlineContent(text) }],
    });
    i++;
  }

  return {
    node: { type: 'bulletList', content: items },
    nextIndex: i,
  };
}

function parseOrderedList(lines: string[], startIndex: number): { node: AdfNode; nextIndex: number } | null {
  if (!lines[startIndex].match(/^\d+\.\s+/)) return null;

  const items: AdfNode[] = [];
  let i = startIndex;

  while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
    const text = lines[i].replace(/^\d+\.\s+/, '');
    items.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: parseInlineContent(text) }],
    });
    i++;
  }

  return {
    node: { type: 'orderedList', content: items },
    nextIndex: i,
  };
}

function parseTable(lines: string[], startIndex: number): { node: AdfNode; nextIndex: number } | null {
  const line = lines[startIndex];
  if (!line.startsWith('|') || !line.endsWith('|')) return null;

  const rows: AdfNode[] = [];
  let i = startIndex;
  let isHeader = true;

  while (i < lines.length && lines[i].startsWith('|') && lines[i].endsWith('|')) {
    const rowLine = lines[i];

    if (rowLine.match(/^\|[-:\s|]+\|$/)) {
      i++;
      continue;
    }

    const cells = rowLine
      .slice(1, -1)
      .split('|')
      .map(cell => cell.trim());

    const cellNodes: AdfNode[] = cells.map(cellText => ({
      type: isHeader ? 'tableHeader' : 'tableCell',
      content: [{ type: 'paragraph', content: parseInlineContent(cellText) }],
    }));

    rows.push({ type: 'tableRow', content: cellNodes });
    isHeader = false;
    i++;
  }

  if (rows.length === 0) return null;

  return {
    node: { type: 'table', content: rows },
    nextIndex: i,
  };
}

function parseParagraph(line: string): AdfNode {
  return {
    type: 'paragraph',
    content: parseInlineContent(line),
  };
}

function parseInlineContent(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push({
        type: 'text',
        text: linkMatch[1],
        marks: [{ type: 'link', attrs: { href: linkMatch[2] } }],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      nodes.push({
        type: 'text',
        text: boldMatch[1],
        marks: [{ type: 'strong' }],
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push({
        type: 'text',
        text: italicMatch[1],
        marks: [{ type: 'em' }],
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({
        type: 'text',
        text: codeMatch[1],
        marks: [{ type: 'code' }],
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    let plainEnd = remaining.length;
    const specialChars = ['[', '*', '`'];
    for (const char of specialChars) {
      const idx = remaining.indexOf(char);
      if (idx > 0 && idx < plainEnd) {
        plainEnd = idx;
      }
    }

    const plainText = remaining.slice(0, plainEnd);
    if (plainText) {
      nodes.push({ type: 'text', text: plainText });
    }
    remaining = remaining.slice(plainEnd);
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }];
}
