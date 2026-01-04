const DEFAULT_SUMMARY_PATTERN = '^## Summary\\s*\\n+```\\s*\\n(.+?)\\n```';
const DEFAULT_SUMMARY_FLAGS = 'm';
const DEFAULT_DESCRIPTION_PATTERN = '^## Description[\\s\\t]*$';
const DEFAULT_DESCRIPTION_FLAGS = 'm';

export function parseSummaryFromContent(content: string, pattern?: string, flags?: string): string | null {
  try {
    const regex = new RegExp(pattern || DEFAULT_SUMMARY_PATTERN, flags || DEFAULT_SUMMARY_FLAGS);
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // Invalid regex, fall back to default
    const defaultRegex = new RegExp(DEFAULT_SUMMARY_PATTERN, DEFAULT_SUMMARY_FLAGS);
    const match = content.match(defaultRegex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export function parseDescriptionFromContent(content: string, pattern?: string, flags?: string): string | null {
  let headerPattern: RegExp;
  try {
    headerPattern = new RegExp(pattern || DEFAULT_DESCRIPTION_PATTERN, flags || DEFAULT_DESCRIPTION_FLAGS);
  } catch {
    headerPattern = new RegExp(DEFAULT_DESCRIPTION_PATTERN, DEFAULT_DESCRIPTION_FLAGS);
  }

  const lines = content.split('\n');
  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (startIndex === -1 && headerPattern.test(line)) {
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
