import { describe, it, expect } from 'vitest';
import { parseSummaryFromContent, parseDescriptionFromContent } from '../../../src/utils/contentParser';

describe('parseSummaryFromContent', () => {
  it('should extract summary from code block', () => {
    const content = `# Title

## Summary

\`\`\`
Fix login button not working on mobile
\`\`\`

## Description
Some description here.
`;
    expect(parseSummaryFromContent(content)).toBe('Fix login button not working on mobile');
  });

  it('should trim whitespace from summary', () => {
    const content = `## Summary

\`\`\`
  Add new feature
\`\`\`
`;
    expect(parseSummaryFromContent(content)).toBe('Add new feature');
  });

  it('should return null when no Summary section exists', () => {
    const content = `# Title

## Description
Some content here.
`;
    expect(parseSummaryFromContent(content)).toBeNull();
  });

  it('should return null when Summary exists but no code block', () => {
    const content = `## Summary

Just plain text without code block.
`;
    expect(parseSummaryFromContent(content)).toBeNull();
  });
});

describe('parseDescriptionFromContent', () => {
  it('should extract description from file with frontmatter and horizontal rule', () => {
    const content = `---
title: "US-3.2 Create Modal Form"
type: user-story
---

## Summary

\`\`\`
User can fill a form to create a Jira ticket
\`\`\`

---

## Description

### User Story

As a user,
I want to fill a form to create a ticket,
so that I can specify ticket details quickly.

### Context

Some context here.
`;
    const result = parseDescriptionFromContent(content);
    expect(result).toContain('### User Story');
    expect(result).toContain('As a user,');
    expect(result).toContain('### Context');
  });
  it('should extract description until next h2', () => {
    const content = `# Title

## Summary

\`\`\`
Some summary
\`\`\`

## Description

### User Story
As a user, I want to be able to login.

### Acceptance Criteria
- Can login with email
- Can login with SSO

## Notes
Some notes here.
`;
    const result = parseDescriptionFromContent(content);
    expect(result).toBe(`### User Story
As a user, I want to be able to login.

### Acceptance Criteria
- Can login with email
- Can login with SSO`);
  });

  it('should extract description until end of file', () => {
    const content = `## Description

This is the description.
It spans multiple lines.
`;
    expect(parseDescriptionFromContent(content)).toBe(`This is the description.
It spans multiple lines.`);
  });

  it('should handle description with h1 as terminator', () => {
    const content = `## Description

Some description content.

# Another top level heading
`;
    expect(parseDescriptionFromContent(content)).toBe('Some description content.');
  });

  it('should return null when no Description section exists', () => {
    const content = `# Title

## Summary

\`\`\`
Some summary
\`\`\`
`;
    expect(parseDescriptionFromContent(content)).toBeNull();
  });

  it('should return null when Description section is empty', () => {
    const content = `## Description

## Next Section
`;
    expect(parseDescriptionFromContent(content)).toBeNull();
  });

  it('should handle tab after Description heading', () => {
    const content = `## Description\t

### User Story
As a user...
`;
    expect(parseDescriptionFromContent(content)).toBe(`### User Story
As a user...`);
  });

  it('should preserve nested markdown structure', () => {
    const content = `## Description

### Requirements
- Item 1
- Item 2
  - Nested item

\`\`\`typescript
const code = "example";
\`\`\`

## Implementation
`;
    const result = parseDescriptionFromContent(content);
    expect(result).toContain('### Requirements');
    expect(result).toContain('- Item 1');
    expect(result).toContain('const code = "example"');
    expect(result).not.toContain('## Implementation');
  });
});
