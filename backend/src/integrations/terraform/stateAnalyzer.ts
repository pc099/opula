import * as fs from 'fs/promises';
import * as path from 'path';
import { TerraformState, TerraformDriftDetection, TerraformDriftResource, TerraformDifference } from './types';

export class TerraformStateAnalyzer {
  /**
   * Parse terraform state file
   */
  async parseStateFile(statePath: string): Promise<TerraformState> {
    try {
      const stateContent = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(stateContent);
    } catch (error) {
      throw new Error(`Failed to parse state file: ${error.message}`);
    }
  }

  /**
   * Compare two state files to detect drift
   */
  async detectDrift(currentStatePath: string, previousStatePath: string): Promise<TerraformDriftDetection> {
    const currentState = await this.parseStateFile(currentStatePath);
    const previousState = await this.parseStateFile(previousStatePath);

    return this.compareStates(currentState, previousState);
  }

  /**
   * Compare two state objects
   */
  compareStates(currentState: TerraformState, previousState: TerraformState): TerraformDriftDetection {
    const currentResources = this.extractResources(currentState);
    const previousResources = this.extractResources(previousState);
    
    const driftedResources: TerraformDriftResource[] = [];

    // Check for modified resources
    for (const [address, currentResource] of currentResources) {
      const previousResource = previousResources.get(address);
      
      if (!previousResource) {
        // New resource
        driftedResources.push({
          address,
          resource_type: currentResource.type,
          drift_type: 'configuration',
          current_values: currentResource.values,
          planned_values: {},
          differences: [{
            path: 'resource',
            current_value: currentResource.values,
            planned_value: null,
            change_type: 'added'
          }]
        });
      } else {
        // Compare resource values
        const differences = this.compareResourceValues(
          previousResource.values,
          currentResource.values
        );
        
        if (differences.length > 0) {
          driftedResources.push({
            address,
            resource_type: currentResource.type,
            drift_type: 'external_change',
            current_values: currentResource.values,
            planned_values: previousResource.values,
            differences
          });
        }
      }
    }

    // Check for removed resources
    for (const [address, previousResource] of previousResources) {
      if (!currentResources.has(address)) {
        driftedResources.push({
          address,
          resource_type: previousResource.type,
          drift_type: 'missing',
          current_values: {},
          planned_values: previousResource.values,
          differences: [{
            path: 'resource',
            current_value: null,
            planned_value: previousResource.values,
            change_type: 'removed'
          }]
        });
      }
    }

    const totalResources = Math.max(currentResources.size, previousResources.size);
    const driftPercentage = totalResources > 0 ? (driftedResources.length / totalResources) * 100 : 0;

    return {
      hasDrift: driftedResources.length > 0,
      driftedResources,
      summary: {
        total_resources: totalResources,
        drifted_resources: driftedResources.length,
        drift_percentage: Math.round(driftPercentage * 100) / 100
      }
    };
  }

  /**
   * Extract resources from state
   */
  private extractResources(state: TerraformState): Map<string, any> {
    const resources = new Map();
    
    if (state.values?.root_module) {
      this.extractModuleResources(state.values.root_module, resources);
    }

    return resources;
  }

  /**
   * Recursively extract resources from modules
   */
  private extractModuleResources(module: any, resources: Map<string, any>): void {
    if (module.resources) {
      for (const resource of module.resources) {
        resources.set(resource.address, resource);
      }
    }

    if (module.child_modules) {
      for (const childModule of module.child_modules) {
        this.extractModuleResources(childModule, resources);
      }
    }
  }

  /**
   * Compare resource values and return differences
   */
  private compareResourceValues(previous: Record<string, any>, current: Record<string, any>): TerraformDifference[] {
    const differences: TerraformDifference[] = [];
    const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

    for (const key of allKeys) {
      const prevValue = previous[key];
      const currValue = current[key];

      if (prevValue === undefined && currValue !== undefined) {
        differences.push({
          path: key,
          current_value: currValue,
          planned_value: prevValue,
          change_type: 'added'
        });
      } else if (prevValue !== undefined && currValue === undefined) {
        differences.push({
          path: key,
          current_value: currValue,
          planned_value: prevValue,
          change_type: 'removed'
        });
      } else if (!this.deepEqual(prevValue, currValue)) {
        differences.push({
          path: key,
          current_value: currValue,
          planned_value: prevValue,
          change_type: 'modified'
        });
      }
    }

    return differences;
  }

  /**
   * Deep equality check for objects
   */
  private deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    
    if (obj1 == null || obj2 == null) return obj1 === obj2;
    
    if (typeof obj1 !== typeof obj2) return false;
    
    if (typeof obj1 !== 'object') return obj1 === obj2;
    
    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }
    
    return true;
  }

  /**
   * Get resource dependencies from state
   */
  getResourceDependencies(state: TerraformState): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();
    const resources = this.extractResources(state);

    for (const [address, resource] of resources) {
      if (resource.depends_on) {
        dependencies.set(address, resource.depends_on);
      }
    }

    return dependencies;
  }

  /**
   * Analyze resource utilization and costs
   */
  analyzeResourceUtilization(state: TerraformState): {
    resourceCounts: Record<string, number>;
    estimatedCosts: Record<string, number>;
    recommendations: string[];
  } {
    const resources = this.extractResources(state);
    const resourceCounts: Record<string, number> = {};
    const estimatedCosts: Record<string, number> = {};
    const recommendations: string[] = [];

    for (const [address, resource] of resources) {
      const resourceType = resource.type;
      resourceCounts[resourceType] = (resourceCounts[resourceType] || 0) + 1;

      // Basic cost estimation (this would be enhanced with actual pricing data)
      const estimatedCost = this.estimateResourceCost(resource);
      estimatedCosts[resourceType] = (estimatedCosts[resourceType] || 0) + estimatedCost;
    }

    // Generate recommendations
    if (resourceCounts['aws_instance'] > 10) {
      recommendations.push('Consider using Auto Scaling Groups for better cost optimization');
    }
    
    if (resourceCounts['aws_ebs_volume'] > resourceCounts['aws_instance']) {
      recommendations.push('Review EBS volumes - some may be unattached');
    }

    return {
      resourceCounts,
      estimatedCosts,
      recommendations
    };
  }

  /**
   * Basic resource cost estimation
   */
  private estimateResourceCost(resource: any): number {
    // This is a simplified cost estimation
    // In a real implementation, this would use actual cloud provider pricing APIs
    const costMap: Record<string, number> = {
      'aws_instance': 50, // $50/month average
      'aws_rds_instance': 100, // $100/month average
      'aws_ebs_volume': 10, // $10/month average
      'aws_s3_bucket': 5, // $5/month average
      'google_compute_instance': 45,
      'azurerm_virtual_machine': 55
    };

    return costMap[resource.type] || 0;
  }
}