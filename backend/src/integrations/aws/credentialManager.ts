import { AWSCredentials } from './awsIntegration';

export interface StoredAWSCredentials extends AWSCredentials {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export class AWSCredentialManager {
  private credentials: Map<string, StoredAWSCredentials> = new Map();

  constructor() {
    this.loadCredentialsFromEnv();
  }

  private loadCredentialsFromEnv(): void {
    // Load default credentials from environment variables
    const defaultCredentials: StoredAWSCredentials = {
      id: 'default',
      name: 'Default AWS Credentials',
      description: 'Loaded from environment variables',
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      profile: process.env.AWS_PROFILE,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };

    if (defaultCredentials.accessKeyId || defaultCredentials.profile) {
      this.credentials.set('default', defaultCredentials);
    }
  }

  addCredentials(credentials: Omit<StoredAWSCredentials, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = this.generateId();
    const storedCredentials: StoredAWSCredentials = {
      ...credentials,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.credentials.set(id, storedCredentials);
    return id;
  }

  updateCredentials(id: string, updates: Partial<Omit<StoredAWSCredentials, 'id' | 'createdAt'>>): boolean {
    const existing = this.credentials.get(id);
    if (!existing) {
      return false;
    }

    const updated: StoredAWSCredentials = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    this.credentials.set(id, updated);
    return true;
  }

  getCredentials(id: string): StoredAWSCredentials | undefined {
    return this.credentials.get(id);
  }

  getAllCredentials(): StoredAWSCredentials[] {
    return Array.from(this.credentials.values());
  }

  getActiveCredentials(): StoredAWSCredentials[] {
    return Array.from(this.credentials.values()).filter(cred => cred.isActive);
  }

  deleteCredentials(id: string): boolean {
    if (id === 'default') {
      // Don't allow deletion of default credentials
      return false;
    }
    return this.credentials.delete(id);
  }

  setActive(id: string, isActive: boolean): boolean {
    const credentials = this.credentials.get(id);
    if (!credentials) {
      return false;
    }

    credentials.isActive = isActive;
    credentials.updatedAt = new Date();
    return true;
  }

  getDefaultCredentials(): StoredAWSCredentials | undefined {
    return this.credentials.get('default');
  }

  validateCredentials(credentials: AWSCredentials): boolean {
    // Basic validation
    if (!credentials.region) {
      return false;
    }

    // If using access keys, both must be present
    if (credentials.accessKeyId && !credentials.secretAccessKey) {
      return false;
    }

    if (credentials.secretAccessKey && !credentials.accessKeyId) {
      return false;
    }

    // Must have either access keys or profile
    if (!credentials.accessKeyId && !credentials.profile) {
      return false;
    }

    return true;
  }

  private generateId(): string {
    return `aws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Security: Mask sensitive data when logging or returning credentials
  maskCredentials(credentials: StoredAWSCredentials): Omit<StoredAWSCredentials, 'secretAccessKey'> & { secretAccessKey?: string } {
    const masked = { ...credentials };
    if (masked.secretAccessKey) {
      masked.secretAccessKey = '***masked***';
    }
    return masked;
  }

  // Get credentials for integration use (without masking)
  getCredentialsForIntegration(id: string): AWSCredentials | undefined {
    const stored = this.credentials.get(id);
    if (!stored || !stored.isActive) {
      return undefined;
    }

    return {
      accessKeyId: stored.accessKeyId,
      secretAccessKey: stored.secretAccessKey,
      region: stored.region,
      profile: stored.profile
    };
  }
}

// Singleton instance
export const awsCredentialManager = new AWSCredentialManager();