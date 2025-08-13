import { AzureCredentials } from './azureIntegration';

export interface StoredAzureCredentials extends AzureCredentials {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export class AzureCredentialManager {
  private credentials: Map<string, StoredAzureCredentials> = new Map();

  constructor() {
    this.loadCredentialsFromEnv();
  }

  private loadCredentialsFromEnv(): void {
    // Load default credentials from environment variables
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    
    if (subscriptionId) {
      const defaultCredentials: StoredAzureCredentials = {
        id: 'default',
        name: 'Default Azure Credentials',
        description: 'Loaded from environment variables',
        subscriptionId,
        tenantId: process.env.AZURE_TENANT_ID,
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        useDefaultCredential: !process.env.AZURE_CLIENT_ID, // Use default if no client ID
        useCLI: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      this.credentials.set('default', defaultCredentials);
    }
  }

  addCredentials(credentials: Omit<StoredAzureCredentials, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = this.generateId();
    const storedCredentials: StoredAzureCredentials = {
      ...credentials,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.credentials.set(id, storedCredentials);
    return id;
  }

  updateCredentials(id: string, updates: Partial<Omit<StoredAzureCredentials, 'id' | 'createdAt'>>): boolean {
    const existing = this.credentials.get(id);
    if (!existing) {
      return false;
    }

    const updated: StoredAzureCredentials = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    this.credentials.set(id, updated);
    return true;
  }

  getCredentials(id: string): StoredAzureCredentials | undefined {
    return this.credentials.get(id);
  }

  getAllCredentials(): StoredAzureCredentials[] {
    return Array.from(this.credentials.values());
  }

  getActiveCredentials(): StoredAzureCredentials[] {
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

  getDefaultCredentials(): StoredAzureCredentials | undefined {
    return this.credentials.get('default');
  }

  validateCredentials(credentials: AzureCredentials): boolean {
    // Basic validation
    if (!credentials.subscriptionId) {
      return false;
    }

    // If using service principal, all three must be present
    if (credentials.clientId || credentials.clientSecret || credentials.tenantId) {
      if (!credentials.clientId || !credentials.clientSecret || !credentials.tenantId) {
        return false;
      }
    }

    // Must have some form of authentication
    if (!credentials.useDefaultCredential && !credentials.useCLI && !credentials.clientId) {
      return false;
    }

    return true;
  }

  private generateId(): string {
    return `azure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Security: Mask sensitive data when logging or returning credentials
  maskCredentials(credentials: StoredAzureCredentials): Omit<StoredAzureCredentials, 'clientSecret'> & { clientSecret?: string } {
    const masked = { ...credentials };
    if (masked.clientSecret) {
      masked.clientSecret = '***masked***';
    }
    return masked;
  }

  // Get credentials for integration use (without masking)
  getCredentialsForIntegration(id: string): AzureCredentials | undefined {
    const stored = this.credentials.get(id);
    if (!stored || !stored.isActive) {
      return undefined;
    }

    return {
      subscriptionId: stored.subscriptionId,
      tenantId: stored.tenantId,
      clientId: stored.clientId,
      clientSecret: stored.clientSecret,
      useDefaultCredential: stored.useDefaultCredential,
      useCLI: stored.useCLI
    };
  }
}

// Singleton instance
export const azureCredentialManager = new AzureCredentialManager();