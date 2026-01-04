import type { App, TFile } from 'obsidian';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

export function readFrontmatterField(app: App, file: TFile, key: string): string | undefined {
  const cache = app.metadataCache.getFileCache(file);
  const value = cache?.frontmatter?.[key];
  return typeof value === 'string' ? value : undefined;
}

export async function addFrontmatterFields(app: App, file: TFile, fields: Record<string, string>): Promise<void> {
  const content = await app.vault.read(file);
  const newContent = insertOrUpdateFrontmatter(content, fields);
  if (newContent !== content) {
    await app.vault.modify(file, newContent);
  }
}

function insertOrUpdateFrontmatter(content: string, fields: Record<string, string>): string {
  const match = content.match(FRONTMATTER_REGEX);

  if (match) {
    const existingFrontmatter = match[1];
    const updatedFrontmatter = updateFrontmatterFields(existingFrontmatter, fields);
    return content.replace(FRONTMATTER_REGEX, `---\n${updatedFrontmatter}\n---`);
  }

  const newFrontmatter = Object.entries(fields)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`)
    .join('\n');

  return `---\n${newFrontmatter}\n---\n${content}`;
}

function updateFrontmatterFields(frontmatter: string, fields: Record<string, string>): string {
  const lines = frontmatter.split('\n');
  const existingKeys = new Set<string>();

  const updatedLines = lines.map(line => {
    const keyMatch = line.match(/^(\w+):/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (key in fields) {
        existingKeys.add(key);
        return `${key}: ${formatYamlValue(fields[key])}`;
      }
    }
    return line;
  });

  for (const [key, value] of Object.entries(fields)) {
    if (!existingKeys.has(key)) {
      updatedLines.push(`${key}: ${formatYamlValue(value)}`);
    }
  }

  return updatedLines.join('\n');
}

function formatYamlValue(value: string): string {
  if (value.includes(':') || value.includes('#') || value.includes("'") || value.includes('"')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
