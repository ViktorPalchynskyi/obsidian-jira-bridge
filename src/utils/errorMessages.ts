export const NOTICE_DURATION = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 3000,
} as const;

export function mapJiraError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('401') || msg.includes('unauthorized')) {
      return 'Invalid credentials. Check your API token in settings.';
    }

    if (msg.includes('403') || msg.includes('forbidden')) {
      return "You don't have permission for this action.";
    }

    if (msg.includes('404') || msg.includes('not found')) {
      return 'Resource not found. Check if the issue or project exists.';
    }

    if (msg.includes('net::') || msg.includes('network') || msg.includes('enotfound') || msg.includes('fetch failed')) {
      return 'Cannot reach Jira. Check your internet connection.';
    }

    if (msg.includes('429') || msg.includes('rate limit')) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('internal server')) {
      return 'Jira server error. Please try again later.';
    }

    if (msg.includes('timeout') || msg.includes('aborted')) {
      return 'Request timed out. Check your connection and try again.';
    }

    if (msg.includes('invalid') && msg.includes('json')) {
      return 'Invalid response from Jira. Please try again.';
    }
  }

  return 'An unexpected error occurred. Please try again.';
}

export function formatIssueNotFoundError(issueKey: string): string {
  return `Issue ${issueKey} not found.`;
}

export function formatProjectNotFoundError(projectKey: string): string {
  return `Project ${projectKey} not found.`;
}

export function formatPermissionError(action: string): string {
  return `You don't have permission to ${action}.`;
}
