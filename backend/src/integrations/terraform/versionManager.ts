import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

export interface TerraformVersionInfo {
  version: string;
  path: string;
  isInstalled: boolean;
  isDefault: boolean;
}

export class TerraformVersionManager {
  private installDir: string;
  private versionsCache: Map<string, TerraformVersionInfo> = new Map();

  constructor(installDir?: string) {
    this.installDir = installDir || path.join(os.homedir(), '.terraform-versions');
  }

  /**
   * List all available Terraform versions
   */
  async listAvailableVersions(): Promise<string[]> {
    try {
      const response = await axios.get('https://api.releases.hashicorp.com/v1/releases/terraform');
      return response.data.map((release: any) => release.version).slice(0, 20); // Get latest 20 versions
    } catch (error) {
      throw new Error(`Failed to fetch available versions: ${error.message}`);
    }
  }

  /**
   * List installed Terraform versions
   */
  async listInstalledVersions(): Promise<TerraformVersionInfo[]> {
    const versions: TerraformVersionInfo[] = [];
    
    try {
      await fs.access(this.installDir);
      const entries = await fs.readdir(this.installDir);
      
      for (const entry of entries) {
        const versionPath = path.join(this.installDir, entry);
        const stat = await fs.stat(versionPath);
        
        if (stat.isDirectory()) {
          const terraformPath = path.join(versionPath, this.getTerraformBinaryName());
          const isInstalled = await this.fileExists(terraformPath);
          
          versions.push({
            version: entry,
            path: terraformPath,
            isInstalled,
            isDefault: false
          });
        }
      }
    } catch (error) {
      // Directory doesn't exist or is empty
    }

    // Check for system-wide terraform
    const systemTerraform = await this.getSystemTerraformVersion();
    if (systemTerraform) {
      versions.push({
        version: systemTerraform.version,
        path: 'terraform', // Use system PATH
        isInstalled: true,
        isDefault: true
      });
    }

    return versions.sort((a, b) => this.compareVersions(b.version, a.version));
  }

  /**
   * Install a specific Terraform version
   */
  async installVersion(version: string): Promise<void> {
    const versionDir = path.join(this.installDir, version);
    const terraformPath = path.join(versionDir, this.getTerraformBinaryName());

    // Check if already installed
    if (await this.fileExists(terraformPath)) {
      return;
    }

    // Create version directory
    await fs.mkdir(versionDir, { recursive: true });

    // Download and install
    const downloadUrl = this.getDownloadUrl(version);
    const zipPath = path.join(versionDir, 'terraform.zip');

    try {
      // Download
      const response = await axios.get(downloadUrl, { responseType: 'stream' });
      const writer = require('fs').createWriteStream(zipPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Extract (simplified - in production, use a proper zip library)
      await this.extractZip(zipPath, versionDir);
      
      // Make executable
      if (process.platform !== 'win32') {
        await fs.chmod(terraformPath, '755');
      }

      // Clean up
      await fs.unlink(zipPath);

    } catch (error) {
      // Clean up on failure
      await fs.rmdir(versionDir, { recursive: true }).catch(() => {});
      throw new Error(`Failed to install Terraform ${version}: ${error.message}`);
    }
  }

  /**
   * Get Terraform binary for a specific version
   */
  async getTerraformBinary(version?: string): Promise<string> {
    if (!version) {
      return 'terraform'; // Use system default
    }

    const versionPath = path.join(this.installDir, version, this.getTerraformBinaryName());
    
    if (await this.fileExists(versionPath)) {
      return versionPath;
    }

    throw new Error(`Terraform version ${version} is not installed`);
  }

  /**
   * Get version of a Terraform binary
   */
  async getVersionFromBinary(terraformPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(terraformPath, ['version', '-json'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const versionInfo = JSON.parse(stdout);
            resolve(versionInfo.terraform_version);
          } catch (error) {
            reject(new Error('Failed to parse version output'));
          }
        } else {
          reject(new Error(`Failed to get version: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async getSystemTerraformVersion(): Promise<{ version: string } | null> {
    try {
      const version = await this.getVersionFromBinary('terraform');
      return { version };
    } catch (error) {
      return null;
    }
  }

  private getTerraformBinaryName(): string {
    return process.platform === 'win32' ? 'terraform.exe' : 'terraform';
  }

  private getDownloadUrl(version: string): string {
    const platform = this.getPlatform();
    const arch = this.getArch();
    return `https://releases.hashicorp.com/terraform/${version}/terraform_${version}_${platform}_${arch}.zip`;
  }

  private getPlatform(): string {
    switch (process.platform) {
      case 'darwin': return 'darwin';
      case 'linux': return 'linux';
      case 'win32': return 'windows';
      default: throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  private getArch(): string {
    switch (process.arch) {
      case 'x64': return 'amd64';
      case 'arm64': return 'arm64';
      case 'ia32': return '386';
      default: throw new Error(`Unsupported architecture: ${process.arch}`);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async extractZip(zipPath: string, extractDir: string): Promise<void> {
    // Simplified extraction - in production, use a proper zip library like 'yauzl' or 'node-stream-zip'
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }
    
    return 0;
  }
}