import { describe, it, expect } from 'vitest';
import {
  mapJiraError,
  formatIssueNotFoundError,
  formatProjectNotFoundError,
  formatPermissionError,
  NOTICE_DURATION,
} from '../../../src/utils/errorMessages';

describe('errorMessages', () => {
  describe('mapJiraError', () => {
    it('should return auth error message for 401', () => {
      const error = new Error('Request failed with status 401');
      expect(mapJiraError(error)).toBe('Invalid credentials. Check your API token in settings.');
    });

    it('should return auth error message for unauthorized', () => {
      const error = new Error('Unauthorized access');
      expect(mapJiraError(error)).toBe('Invalid credentials. Check your API token in settings.');
    });

    it('should return permission error message for 403', () => {
      const error = new Error('Request failed with status 403');
      expect(mapJiraError(error)).toBe("You don't have permission for this action.");
    });

    it('should return permission error message for forbidden', () => {
      const error = new Error('Access forbidden');
      expect(mapJiraError(error)).toBe("You don't have permission for this action.");
    });

    it('should return not found error message for 404', () => {
      const error = new Error('Request failed with status 404');
      expect(mapJiraError(error)).toBe('Resource not found. Check if the issue or project exists.');
    });

    it('should return not found error message for not found text', () => {
      const error = new Error('Issue not found');
      expect(mapJiraError(error)).toBe('Resource not found. Check if the issue or project exists.');
    });

    it('should return network error message for net:: errors', () => {
      const error = new Error('net::ERR_CONNECTION_REFUSED');
      expect(mapJiraError(error)).toBe('Cannot reach Jira. Check your internet connection.');
    });

    it('should return network error message for network errors', () => {
      const error = new Error('Network request failed');
      expect(mapJiraError(error)).toBe('Cannot reach Jira. Check your internet connection.');
    });

    it('should return network error message for enotfound', () => {
      const error = new Error('getaddrinfo ENOTFOUND jira.example.com');
      expect(mapJiraError(error)).toBe('Cannot reach Jira. Check your internet connection.');
    });

    it('should return network error message for fetch failed', () => {
      const error = new Error('Fetch failed');
      expect(mapJiraError(error)).toBe('Cannot reach Jira. Check your internet connection.');
    });

    it('should return rate limit error message for 429', () => {
      const error = new Error('Request failed with status 429');
      expect(mapJiraError(error)).toBe('Too many requests. Please wait a moment and try again.');
    });

    it('should return rate limit error message for rate limit text', () => {
      const error = new Error('Rate limit exceeded');
      expect(mapJiraError(error)).toBe('Too many requests. Please wait a moment and try again.');
    });

    it('should return server error message for 500', () => {
      const error = new Error('Request failed with status 500');
      expect(mapJiraError(error)).toBe('Jira server error. Please try again later.');
    });

    it('should return server error message for 502', () => {
      const error = new Error('Request failed with status 502');
      expect(mapJiraError(error)).toBe('Jira server error. Please try again later.');
    });

    it('should return server error message for 503', () => {
      const error = new Error('Request failed with status 503');
      expect(mapJiraError(error)).toBe('Jira server error. Please try again later.');
    });

    it('should return server error message for internal server error text', () => {
      const error = new Error('Internal server error');
      expect(mapJiraError(error)).toBe('Jira server error. Please try again later.');
    });

    it('should return timeout error message for timeout', () => {
      const error = new Error('Request timeout');
      expect(mapJiraError(error)).toBe('Request timed out. Check your connection and try again.');
    });

    it('should return timeout error message for aborted', () => {
      const error = new Error('Request aborted');
      expect(mapJiraError(error)).toBe('Request timed out. Check your connection and try again.');
    });

    it('should return invalid json error message', () => {
      const error = new Error('Invalid JSON response');
      expect(mapJiraError(error)).toBe('Invalid response from Jira. Please try again.');
    });

    it('should return generic error for unknown errors', () => {
      const error = new Error('Something completely unknown');
      expect(mapJiraError(error)).toBe('An unexpected error occurred. Please try again.');
    });

    it('should return generic error for non-Error objects', () => {
      expect(mapJiraError('string error')).toBe('An unexpected error occurred. Please try again.');
      expect(mapJiraError(null)).toBe('An unexpected error occurred. Please try again.');
      expect(mapJiraError(undefined)).toBe('An unexpected error occurred. Please try again.');
      expect(mapJiraError({ message: 'object error' })).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('formatIssueNotFoundError', () => {
    it('should format issue not found error with key', () => {
      expect(formatIssueNotFoundError('PROJECT-123')).toBe('Issue PROJECT-123 not found.');
    });
  });

  describe('formatProjectNotFoundError', () => {
    it('should format project not found error with key', () => {
      expect(formatProjectNotFoundError('PROJECT')).toBe('Project PROJECT not found.');
    });
  });

  describe('formatPermissionError', () => {
    it('should format permission error with action', () => {
      expect(formatPermissionError('create issues')).toBe("You don't have permission to create issues.");
    });
  });

  describe('NOTICE_DURATION', () => {
    it('should have correct duration values', () => {
      expect(NOTICE_DURATION.success).toBe(4000);
      expect(NOTICE_DURATION.error).toBe(6000);
      expect(NOTICE_DURATION.warning).toBe(5000);
      expect(NOTICE_DURATION.info).toBe(3000);
    });
  });
});
