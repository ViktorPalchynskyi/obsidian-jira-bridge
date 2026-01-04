export interface JiraUser {
  displayName: string;
  emailAddress: string;
  accountId: string;
}

export interface TestConnectionResult {
  success: boolean;
  user?: JiraUser;
  error?: string;
}
