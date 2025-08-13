import { GCPCredentials } from './gcpIntegration';

export interface StoredGCPCredentials extends GCPCredentials {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export class GCPCredentialManager {
  private credentials: Map<string, StoredGCPCredentials> = new Map();

  constructor() {
    this.loadCredentialsFromEnv();
  }

  private loadCredentialsFromEnv(): void {
    // Load default credentials from environment variables
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    
    if (projectId) {
      const defaultCredentials: StoredGCPCredentials = {
        id: 'default',
        name: 'Default GCP Credentials',
        description: 'Loaded from environment variables',
        projectId,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        useApplicationDefault: !process.env.GOOGLE_APPLICATION_CREDENTIALS,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      this.credentials.set('default', defaultCredentials);
    }
  }

  addCredentials(credentials: Omit<StoredGCPCredentials, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = this.generateId();
    const storedCredentials: StoredGCPCredentials = {
      ...credentials,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.credentials.set(id, storedCredentials);
    return id;
  }

  updateCredentials(id: string, updates: Partial<Omit<StoredGCPCredentials, 'id' | 'createdAt'>>): boolean {
    const existing = this.credentials.get(id);
    if (!existing) {
      return false;
    }

    const updated: StoredGCPCredentials = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    this.credentials.set(id, updated);
    return true;
  }

  getCredentials(id: string): StoredGCPCredentials | undefined {
    return this.credentials.get(id);
  }

  getAllCredentials(): StoredGCPCredentials[] {
    return Array.from(this.credentials.values());
  }

  getActiveCredentials(): StoredGCPCredentials[] {
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

  getDefaultCredentials(): StoredGCPCredentials | undefined {
    return this.credentials.get('default');
  }

  validateCredentials(credentials: GCPCredentials): boolean {
    // Basic validation
    if (!credentials.projectId) {
      return false;
    }

    // Must have some form of authentication
    if (!credentials.keyFilename && !credentials.credentials && !credentials.useApplicationDefault) {
      return false;
    }

    return true;
  }

  private generateId(): string {
    return `gcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Security: Mask sensitive data when logging or returning credentials
  maskCredentials(credentials: StoredGCPCredentials): Omit<StoredGCPCredentials, 'credentials'> & { credentials?: string } {
    const masked = { ...credentials };
    if (masked.credentials) {
      (masked as any).credentials = '***masked***';
    }
    return masked as any;
  }

  // Get credentials for integration use (without masking)
  getCredentialsForIntegration(id: string): GCPCredentials | undefined {
    const stored = this.credentials.get(id);
    if (!stored || !stored.isActive) {
      return undefined;
    }

    return {
      projectId: stored.projectId,
      keyFilename: stored.keyFilename,
      credentials: stored.credentials,
      useApplicationDefault: stored.useApplicationDefault
    };
  }
}

// Singleton instance
export const gcpCredentialManager = new GCPCredentialManager();