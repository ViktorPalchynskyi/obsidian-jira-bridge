import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from '../../../src/api/JiraClient';
import type { JiraInstance } from '../../../src/types';

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}));

import { requestUrl } from 'obsidian';

const mockRequestUrl = vi.mocked(requestUrl);

const createMockInstance = (overrides?: Partial<JiraInstance>): JiraInstance => ({
  id: 'test-id',
  name: 'Test Instance',
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-token',
  isDefault: true,
  enabled: true,
  createdAt: Date.now(),
  ...overrides,
});

describe('JiraClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should return success with user data on 200 response', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          displayName: 'John Doe',
          emailAddress: 'john@example.com',
          accountId: 'account-123',
        },
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.user).toEqual({
        displayName: 'John Doe',
        emailAddress: 'john@example.com',
        accountId: 'account-123',
      });
      expect(result.error).toBeUndefined();
    });

    it('should call correct URL with auth header', async () => {
      const instance = createMockInstance({
        baseUrl: 'https://my-jira.atlassian.net',
        email: 'user@test.com',
        apiToken: 'secret-token',
      });
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: { displayName: 'User', emailAddress: 'user@test.com', accountId: '123' },
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      await client.testConnection();

      expect(mockRequestUrl).toHaveBeenCalledWith({
        url: 'https://my-jira.atlassian.net/rest/api/3/myself',
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa('user@test.com:secret-token')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'obsidian-jira-bridge/1.0',
        },
      });
    });

    it('should handle trailing slash in baseUrl', async () => {
      const instance = createMockInstance({
        baseUrl: 'https://test.atlassian.net/',
      });
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: { displayName: 'User', emailAddress: 'test@test.com', accountId: '123' },
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      await client.testConnection();

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.atlassian.net/rest/api/3/myself',
        }),
      );
    });

    it('should return error for 401 response', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockRejectedValueOnce(new Error('Request failed with status 401'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials. Check your email and API token.');
      expect(result.user).toBeUndefined();
    });

    it('should return error for 403 response', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockRejectedValueOnce(new Error('Request failed with status 403'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Access forbidden. Check your permissions.');
    });

    it('should return error for 404 response', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockRejectedValueOnce(new Error('Request failed with status 404'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Jira instance not found. Check the URL.');
    });

    it('should return error for network errors', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error. Check your internet connection.');
    });

    it('should return generic error for unknown errors', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockRejectedValueOnce(new Error('Something unexpected happened'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something unexpected happened');
    });
  });

  describe('getIssue', () => {
    it('should return issue with status', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          key: 'TEST-123',
          fields: {
            summary: 'Test Issue',
            status: {
              id: '1',
              name: 'In Progress',
              statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' },
            },
          },
        },
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      const result = await client.getIssue('TEST-123');

      expect(result.key).toBe('TEST-123');
      expect(result.summary).toBe('Test Issue');
      expect(result.status.name).toBe('In Progress');
    });

    it('should throw error for 404', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 404,
        json: {},
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      await expect(client.getIssue('INVALID-999')).rejects.toThrow('Failed to fetch issue: 404');
    });
  });

  describe('getTransitions', () => {
    it('should return available transitions', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          transitions: [
            {
              id: '21',
              name: 'Start Progress',
              to: { id: '3', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
              hasScreen: false,
              isGlobal: false,
              isInitial: false,
              isConditional: false,
            },
            {
              id: '31',
              name: 'Done',
              to: { id: '10001', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
              hasScreen: false,
              isGlobal: false,
              isInitial: false,
              isConditional: false,
            },
          ],
        },
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      const result = await client.getTransitions('TEST-123');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Start Progress');
      expect(result[1].to.name).toBe('Done');
    });
  });

  describe('transitionIssue', () => {
    it('should execute transition successfully', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 204,
        json: {},
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      await expect(client.transitionIssue('TEST-123', '21')).resolves.toBeUndefined();

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ transition: { id: '21' } }),
        }),
      );
    });

    it('should throw error on failure', async () => {
      const instance = createMockInstance();
      const client = new JiraClient(instance);

      mockRequestUrl.mockResolvedValueOnce({
        status: 400,
        json: {},
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        text: '',
      });

      await expect(client.transitionIssue('TEST-123', '999')).rejects.toThrow('Failed to transition issue: 400');
    });
  });
});
