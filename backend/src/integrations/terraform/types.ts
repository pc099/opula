export interface TerraformConfig {
  version?: string;
  workingDirectory: string;
  varFiles?: string[];
  backendConfig?: Record<string, any>;
  cloudConfig?: TerraformCloudConfig;
}

export interface TerraformCloudConfig {
  organization: string;
  token: string;
  workspace?: string;
  hostname?: string;
}

export interface TerraformPlan {
  changes: {
    add: number;
    change: number;
    destroy: number;
  };
  resources: TerraformResource[];
  raw_output: string;
}

export interface TerraformResource {
  address: string;
  action: string[];
  resource_type: string;
  resource_name: string;
  values?: Record<string, any>;
  sensitive_values?: Record<string, any>;
}

export interface TerraformState {
  format_version: string;
  terraform_version: string;
  values?: {
    root_module: TerraformModule;
  };
  resources?: TerraformStateResource[];
}

export interface TerraformModule {
  resources?: TerraformStateResource[];
  child_modules?: TerraformModule[];
}

export interface TerraformStateResource {
  address: string;
  mode: string;
  type: string;
  name: string;
  provider_name: string;
  schema_version: number;
  values: Record<string, any>;
  sensitive_values?: Record<string, any>;
  depends_on?: string[];
}

export interface TerraformValidation {
  valid: boolean;
  error_count: number;
  warning_count: number;
  diagnostics: TerraformDiagnostic[];
}

export interface TerraformDiagnostic {
  severity: 'error' | 'warning';
  summary: string;
  detail?: string;
  range?: {
    filename: string;
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export interface TerraformVersion {
  terraform_version: string;
  platform: string;
  provider_selections: Record<string, string>;
  terraform_outdated: boolean;
}

export interface TerraformWorkspace {
  name: string;
  current: boolean;
}

export interface TerraformDriftDetection {
  hasDrift: boolean;
  driftedResources: TerraformDriftResource[];
  summary: {
    total_resources: number;
    drifted_resources: number;
    drift_percentage: number;
  };
}

export interface TerraformDriftResource {
  address: string;
  resource_type: string;
  drift_type: 'configuration' | 'external_change' | 'missing';
  current_values: Record<string, any>;
  planned_values: Record<string, any>;
  differences: TerraformDifference[];
}

export interface TerraformDifference {
  path: string;
  current_value: any;
  planned_value: any;
  change_type: 'added' | 'removed' | 'modified';
}