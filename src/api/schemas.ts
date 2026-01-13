import { z } from 'zod';

export const jiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  avatarUrls: z.record(z.string(), z.string()).optional(),
});

export const jiraIssueTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUrl: z.string().optional(),
  subtask: z.boolean(),
});

export const jiraIssueTypeResponseSchema = z.object({
  issueTypes: z.array(jiraIssueTypeSchema),
});

export const jiraPrioritySchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUrl: z.string().optional(),
});

export const jiraUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
});

export const jiraStatusCategorySchema = z.object({
  id: z.number(),
  key: z.string(),
  name: z.string(),
});

export const jiraStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  statusCategory: jiraStatusCategorySchema,
});

export const jiraTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  to: jiraStatusSchema,
  hasScreen: z.boolean(),
  isGlobal: z.boolean(),
  isInitial: z.boolean(),
  isConditional: z.boolean(),
});

export const jiraTransitionsResponseSchema = z.object({
  transitions: z.array(jiraTransitionSchema),
});

export const jiraSprintSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.enum(['active', 'future', 'closed']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  goal: z.string().optional(),
});

export const jiraBoardLocationSchema = z
  .object({
    projectId: z.number().optional(),
    projectKey: z.string().optional(),
    projectName: z.string().optional(),
  })
  .optional();

export const jiraBoardSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  type: z.enum(['scrum', 'kanban', 'simple']),
  location: jiraBoardLocationSchema,
});

export const jiraIssueFieldsSchema = z.object({
  summary: z.string(),
  issuetype: z.object({ name: z.string() }).optional(),
  status: z.object({ name: z.string() }).optional(),
});

export const jiraSearchIssueSchema = z.object({
  key: z.string(),
  fields: jiraIssueFieldsSchema,
});

export const jiraSearchResponseSchema = z.object({
  issues: z.array(jiraSearchIssueSchema),
});

export const jiraPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    values: z.array(itemSchema).optional(),
  });

export type JiraProjectResponse = z.infer<typeof jiraProjectSchema>;
export type JiraIssueTypeResponse = z.infer<typeof jiraIssueTypeSchema>;
export type JiraPriorityResponse = z.infer<typeof jiraPrioritySchema>;
export type JiraUserResponse = z.infer<typeof jiraUserSchema>;
export type JiraTransitionResponse = z.infer<typeof jiraTransitionSchema>;
export type JiraSprintResponse = z.infer<typeof jiraSprintSchema>;
export type JiraBoardResponse = z.infer<typeof jiraBoardSchema>;
export type JiraSearchIssueResponse = z.infer<typeof jiraSearchIssueSchema>;
