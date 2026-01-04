import { z } from 'zod';

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

export interface FieldValidationResult {
  valid: boolean;
  error?: string;
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
    const field = issue.path[0] as keyof JiraInstanceFormData;
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }

  return { valid: false, errors };
};

export const generateInstanceId = (): string => {
  return crypto.randomUUID();
};
