import type { JiraClient } from '../../api/JiraClient';
import type {
  ExportedProjectConfig,
  ValidationResult,
  ValidationCheck,
  ValidationSeverity,
  ConfigurationDiff,
  DiffCategory,
  FieldConfig,
  IssueTypeConfig,
  WorkflowConfig,
  WorkflowStatus,
} from '../../types';

interface TargetProjectInfo {
  projectKey: string;
  projectId: string;
  projectType: string;
  fields: Map<string, { id: string; name: string; custom: boolean }>;
  issueTypes: Map<string, { id: string; name: string }>;
  statuses: Map<string, { id: string; name: string }>;
}

export class ConfigurationValidationService {
  constructor(private client: JiraClient) {}

  async validate(config: ExportedProjectConfig, targetProjectKey: string): Promise<ValidationResult> {
    const targetInfo = await this.fetchTargetProjectInfo(targetProjectKey);

    const checks: ValidationCheck[] = [];
    let hasError = false;
    let hasWarning = false;

    const projectTypeCheck = this.validateProjectType(config, targetInfo);
    checks.push(projectTypeCheck);
    if (projectTypeCheck.status === 'fail') hasError = true;

    const fieldCheck = this.validateFields(config, targetInfo);
    checks.push(fieldCheck);
    if (fieldCheck.status === 'fail') hasError = true;
    if (fieldCheck.status === 'warning') hasWarning = true;

    const issueTypeCheck = this.validateIssueTypes(config, targetInfo);
    checks.push(issueTypeCheck);
    if (issueTypeCheck.status === 'fail') hasError = true;
    if (issueTypeCheck.status === 'warning') hasWarning = true;

    const workflowCheck = this.validateWorkflows(config, targetInfo);
    checks.push(workflowCheck);
    if (workflowCheck.status === 'fail') hasError = true;
    if (workflowCheck.status === 'warning') hasWarning = true;

    let severity: ValidationSeverity = 'info';
    if (hasWarning) severity = 'warning';
    if (hasError) severity = 'error';

    const diff = hasError ? null : this.generateDiff(config, targetInfo);

    return {
      compatible: !hasError,
      severity,
      checks,
      diff,
    };
  }

  private async fetchTargetProjectInfo(projectKey: string): Promise<TargetProjectInfo> {
    const project = await this.client.getProject(projectKey);
    const projectFields = await this.client.getProjectFields(project.id);
    const issueTypes = await this.client.getIssueTypesForProject(projectKey);
    const projectStatuses = await this.client.getProjectStatuses(projectKey);

    const fields = new Map<string, { id: string; name: string; custom: boolean }>();
    for (const field of projectFields) {
      fields.set(field.id, { id: field.id, name: field.name, custom: field.custom });
    }

    const issueTypeMap = new Map<string, { id: string; name: string }>();
    for (const it of issueTypes) {
      issueTypeMap.set(it.id, { id: it.id, name: it.name });
    }

    const statuses = new Map<string, { id: string; name: string }>();
    for (const itStatus of projectStatuses) {
      for (const status of itStatus.statuses) {
        statuses.set(status.id, { id: status.id, name: status.name });
      }
    }

    return {
      projectKey,
      projectId: project.id,
      projectType: project.projectTypeKey,
      fields,
      issueTypes: issueTypeMap,
      statuses,
    };
  }

  private validateProjectType(config: ExportedProjectConfig, targetInfo: TargetProjectInfo): ValidationCheck {
    const sourceType = config.meta.projectType;
    const targetType = targetInfo.projectType;

    if (sourceType === targetType) {
      return {
        name: 'Project Type',
        status: 'pass',
        message: `Both projects are ${sourceType} type`,
        details: null,
      };
    }

    return {
      name: 'Project Type',
      status: 'fail',
      message: `Project type mismatch: source is ${sourceType}, target is ${targetType}`,
      details: [
        `Source project: ${config.meta.projectKey} (${sourceType})`,
        `Target project: ${targetInfo.projectKey} (${targetType})`,
        'Configuration import requires matching project types',
      ],
    };
  }

  private validateFields(config: ExportedProjectConfig, targetInfo: TargetProjectInfo): ValidationCheck {
    const customFields = config.fields.filter(f => f.custom);
    if (customFields.length === 0) {
      return {
        name: 'Custom Fields',
        status: 'pass',
        message: 'No custom fields to validate',
        details: null,
      };
    }

    const missingFields: string[] = [];
    const presentFields: string[] = [];

    for (const field of customFields) {
      if (targetInfo.fields.has(field.id)) {
        presentFields.push(field.name);
      } else {
        missingFields.push(`${field.name} (${field.id})`);
      }
    }

    if (missingFields.length === 0) {
      return {
        name: 'Custom Fields',
        status: 'pass',
        message: `All ${customFields.length} custom fields exist in target project`,
        details: null,
      };
    }

    return {
      name: 'Custom Fields',
      status: 'pass',
      message: `${missingFields.length} of ${customFields.length} custom fields will be created`,
      details: missingFields,
    };
  }

  private validateIssueTypes(config: ExportedProjectConfig, targetInfo: TargetProjectInfo): ValidationCheck {
    if (config.issueTypes.length === 0) {
      return {
        name: 'Issue Types',
        status: 'pass',
        message: 'No issue types to validate',
        details: null,
      };
    }

    const missingTypes: string[] = [];
    const presentTypes: string[] = [];

    for (const it of config.issueTypes) {
      if (targetInfo.issueTypes.has(it.id)) {
        presentTypes.push(it.name);
      } else {
        const byName = Array.from(targetInfo.issueTypes.values()).find(t => t.name.toLowerCase() === it.name.toLowerCase());
        if (byName) {
          presentTypes.push(`${it.name} (mapped by name)`);
        } else {
          missingTypes.push(`${it.name} (${it.id})`);
        }
      }
    }

    if (missingTypes.length === 0) {
      return {
        name: 'Issue Types',
        status: 'pass',
        message: `All ${config.issueTypes.length} issue types exist in target project`,
        details: null,
      };
    }

    return {
      name: 'Issue Types',
      status: 'pass',
      message: `${missingTypes.length} of ${config.issueTypes.length} issue types will be created`,
      details: missingTypes,
    };
  }

  private validateWorkflows(config: ExportedProjectConfig, targetInfo: TargetProjectInfo): ValidationCheck {
    if (config.workflows.length === 0) {
      return {
        name: 'Workflows',
        status: 'pass',
        message: 'No workflows to validate',
        details: null,
      };
    }

    const allStatuses = new Set<string>();
    for (const wf of config.workflows) {
      for (const status of wf.statuses) {
        allStatuses.add(status.id);
      }
    }

    const missingStatuses: string[] = [];
    const presentStatuses: string[] = [];

    for (const statusId of allStatuses) {
      if (targetInfo.statuses.has(statusId)) {
        const status = targetInfo.statuses.get(statusId)!;
        presentStatuses.push(status.name);
      } else {
        const sourceStatus = this.findStatusById(config.workflows, statusId);
        if (sourceStatus) {
          const byName = Array.from(targetInfo.statuses.values()).find(s => s.name.toLowerCase() === sourceStatus.name.toLowerCase());
          if (byName) {
            presentStatuses.push(`${sourceStatus.name} (mapped by name)`);
          } else {
            missingStatuses.push(`${sourceStatus.name} (${statusId})`);
          }
        } else {
          missingStatuses.push(`Unknown (${statusId})`);
        }
      }
    }

    if (missingStatuses.length === 0) {
      return {
        name: 'Workflows',
        status: 'pass',
        message: `All ${allStatuses.size} workflow statuses exist in target project`,
        details: null,
      };
    }

    return {
      name: 'Workflows',
      status: 'pass',
      message: `${missingStatuses.length} of ${allStatuses.size} workflow statuses will be created`,
      details: missingStatuses,
    };
  }

  private findStatusById(workflows: WorkflowConfig[], statusId: string): WorkflowStatus | null {
    for (const wf of workflows) {
      const status = wf.statuses.find(s => s.id === statusId);
      if (status) return status;
    }
    return null;
  }

  private generateDiff(config: ExportedProjectConfig, targetInfo: TargetProjectInfo): ConfigurationDiff {
    return {
      fields: this.generateFieldDiff(config.fields, targetInfo),
      issueTypes: this.generateIssueTypeDiff(config.issueTypes, targetInfo),
      workflows: this.generateWorkflowDiff(config.workflows, targetInfo),
    };
  }

  private generateFieldDiff(fields: FieldConfig[], targetInfo: TargetProjectInfo): DiffCategory<FieldConfig> {
    const result: DiffCategory<FieldConfig> = {
      new: [],
      modified: [],
      skipped: [],
      unchanged: [],
    };

    for (const field of fields) {
      if (!field.custom) {
        result.unchanged.push({
          item: field,
          status: 'unchanged',
          reason: 'System field',
        });
        continue;
      }

      const targetField = targetInfo.fields.get(field.id);
      if (!targetField) {
        result.new.push({
          item: field,
          status: 'new',
          reason: 'Will be created in target project',
        });
        continue;
      }

      if (field.options.length > 0) {
        result.modified.push({
          item: field,
          status: 'modified',
          reason: 'Field exists, options may be updated',
          currentValue: targetField.name,
          newValue: `${field.options.length} options`,
        });
      } else {
        result.unchanged.push({
          item: field,
          status: 'unchanged',
          reason: 'Field exists, no options to update',
        });
      }
    }

    return result;
  }

  private generateIssueTypeDiff(issueTypes: IssueTypeConfig[], targetInfo: TargetProjectInfo): DiffCategory<IssueTypeConfig> {
    const result: DiffCategory<IssueTypeConfig> = {
      new: [],
      modified: [],
      skipped: [],
      unchanged: [],
    };

    for (const it of issueTypes) {
      const targetIt = targetInfo.issueTypes.get(it.id);
      if (targetIt) {
        result.unchanged.push({
          item: it,
          status: 'unchanged',
          reason: 'Issue type exists by ID',
        });
        continue;
      }

      const byName = Array.from(targetInfo.issueTypes.values()).find(t => t.name.toLowerCase() === it.name.toLowerCase());
      if (byName) {
        result.modified.push({
          item: it,
          status: 'modified',
          reason: 'Issue type mapped by name (ID differs)',
          currentValue: byName.id,
          newValue: it.id,
        });
      } else {
        result.new.push({
          item: it,
          status: 'new',
          reason: 'Will be created in target project',
        });
      }
    }

    return result;
  }

  private generateWorkflowDiff(workflows: WorkflowConfig[], targetInfo: TargetProjectInfo): DiffCategory<WorkflowConfig> {
    const result: DiffCategory<WorkflowConfig> = {
      new: [],
      modified: [],
      skipped: [],
      unchanged: [],
    };

    for (const wf of workflows) {
      const allStatusesExist = wf.statuses.every(s => {
        if (targetInfo.statuses.has(s.id)) return true;
        const byName = Array.from(targetInfo.statuses.values()).find(ts => ts.name.toLowerCase() === s.name.toLowerCase());
        return !!byName;
      });

      if (allStatusesExist) {
        result.unchanged.push({
          item: wf,
          status: 'unchanged',
          reason: 'All workflow statuses exist in target project',
        });
      } else {
        const missingCount = wf.statuses.filter(s => {
          if (targetInfo.statuses.has(s.id)) return false;
          const byName = Array.from(targetInfo.statuses.values()).find(ts => ts.name.toLowerCase() === s.name.toLowerCase());
          return !byName;
        }).length;

        result.modified.push({
          item: wf,
          status: 'modified',
          reason: `${missingCount} statuses will be created`,
        });
      }
    }

    return result;
  }
}
