import { z } from 'zod';
import type { FieldValidationResult } from './types';

export type { FieldValidationResult };

export const jiraInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name is too long'),
  baseUrl: z
    .string()
    .min(1, 'URL is required')
    .url('Invalid URL format')
    .refine(url => url.startsWith('https://') || url.startsWith('http://'), 'URL must start with http:// or https://'),
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  apiToken: z.string().min(1, 'API token is required'),
});

export type JiraInstanceFormData = z.infer<typeof jiraInstanceSchema>;

const FORM_FIELD_KEYS: Record<keyof JiraInstanceFormData, true> = {
  name: true,
  baseUrl: true,
  email: true,
  apiToken: true,
};

function isFormField(value: unknown): value is keyof JiraInstanceFormData {
  return typeof value === 'string' && value in FORM_FIELD_KEYS;
}

export const validateField = (fieldName: keyof JiraInstanceFormData, value: string): FieldValidationResult => {
  const fieldSchema = jiraInstanceSchema.shape[fieldName];
  const result = fieldSchema.safeParse(value);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    error: result.error.issues[0]?.message,
  };
};

export const validateForm = (
  data: JiraInstanceFormData,
): { valid: boolean; errors: Partial<Record<keyof JiraInstanceFormData, string>> } => {
  const result = jiraInstanceSchema.safeParse(data);

  if (result.success) {
    return { valid: true, errors: {} };
  }

  const errors: Partial<Record<keyof JiraInstanceFormData, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (isFormField(field) && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return { valid: false, errors };
};

export const generateInstanceId = (): string => {
  return crypto.randomUUID();
};
