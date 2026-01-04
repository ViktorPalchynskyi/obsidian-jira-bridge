import { describe, it, expect } from 'vitest';
import {
  validateField,
  validateForm,
  generateInstanceId,
  jiraInstanceSchema,
} from '../../../src/utils/validation';

describe('validation', () => {
  describe('jiraInstanceSchema', () => {
    it('should validate a correct instance', () => {
      const data = {
        name: 'My Jira',
        baseUrl: 'https://my-company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'my-api-token',
      };

      const result = jiraInstanceSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const data = {
        name: '',
        baseUrl: 'https://my-company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'my-api-token',
      };

      const result = jiraInstanceSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 50 characters', () => {
      const data = {
        name: 'a'.repeat(51),
        baseUrl: 'https://my-company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'my-api-token',
      };

      const result = jiraInstanceSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('validateField', () => {
    describe('name field', () => {
      it('should pass for valid name', () => {
        const result = validateField('name', 'My Jira');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should fail for empty name', () => {
        const result = validateField('name', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Name is required');
      });

      it('should fail for name too long', () => {
        const result = validateField('name', 'a'.repeat(51));
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Name is too long');
      });
    });

    describe('baseUrl field', () => {
      it('should pass for valid https URL', () => {
        const result = validateField('baseUrl', 'https://my-company.atlassian.net');
        expect(result.valid).toBe(true);
      });

      it('should pass for valid http URL', () => {
        const result = validateField('baseUrl', 'http://localhost:8080');
        expect(result.valid).toBe(true);
      });

      it('should fail for empty URL', () => {
        const result = validateField('baseUrl', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('URL is required');
      });

      it('should fail for invalid URL format', () => {
        const result = validateField('baseUrl', 'not-a-url');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid URL format');
      });

      it('should fail for URL without http/https', () => {
        const result = validateField('baseUrl', 'ftp://example.com');
        expect(result.valid).toBe(false);
      });
    });

    describe('email field', () => {
      it('should pass for valid email', () => {
        const result = validateField('email', 'user@example.com');
        expect(result.valid).toBe(true);
      });

      it('should fail for empty email', () => {
        const result = validateField('email', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Email is required');
      });

      it('should fail for invalid email format', () => {
        const result = validateField('email', 'not-an-email');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid email format');
      });
    });

    describe('apiToken field', () => {
      it('should pass for non-empty token', () => {
        const result = validateField('apiToken', 'my-secret-token');
        expect(result.valid).toBe(true);
      });

      it('should fail for empty token', () => {
        const result = validateField('apiToken', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token is required');
      });
    });
  });

  describe('validateForm', () => {
    it('should return valid for correct form data', () => {
      const data = {
        name: 'My Jira',
        baseUrl: 'https://my-company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'my-api-token',
      };

      const result = validateForm(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('should return all errors for invalid form data', () => {
      const data = {
        name: '',
        baseUrl: 'invalid',
        email: 'not-email',
        apiToken: '',
      };

      const result = validateForm(data);
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.baseUrl).toBeDefined();
      expect(result.errors.email).toBeDefined();
      expect(result.errors.apiToken).toBeDefined();
    });
  });

  describe('generateInstanceId', () => {
    it('should generate a valid UUID', () => {
      const id = generateInstanceId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateInstanceId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
