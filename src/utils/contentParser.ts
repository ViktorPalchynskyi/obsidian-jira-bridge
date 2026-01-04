export function parseSummaryFromContent(content: string): string | null {
  const summaryRegex = /^## Summary\s*\n+```\s*\n(.+?)\n```/m;
  const match = content.match(summaryRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function parseDescriptionFromContent(content: string): string | null {
  const lines = content.split('\n');
  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (startIndex === -1 && /^## Description[\s\t]*$/.test(line)) {
      startIndex = i + 1;
      continue;
    }

    if (startIndex !== -1 && /^##? [^#]/.test(line)) {
      endIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return null;
  }

  const descriptionLines = lines.slice(startIndex, endIndex);
  const description = descriptionLines.join('\n').trim();

  return description || null;
}
