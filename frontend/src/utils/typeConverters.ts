import { AgentConfig as SharedAgentConfig } from '../../../shared/types/src';
import { AgentConfig as LocalAgentConfig } from '../store/slices/configurationSlice';

// Convert local AgentConfig to shared AgentConfig
export const toSharedAgentConfig = (config: LocalAgentConfig): SharedAgentConfig => {
  return {
    ...config,
    createdAt: new Date(config.createdAt),
    updatedAt: new Date(config.updatedAt)
  };
};

// Convert shared AgentConfig to local AgentConfig
export const toLocalAgentConfig = (config: SharedAgentConfig): LocalAgentConfig => {
  return {
    ...config,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  };
};

// Convert partial local AgentConfig to partial shared AgentConfig
export const toSharedPartialAgentConfig = (config: Partial<LocalAgentConfig>): Partial<SharedAgentConfig> => {
  const result: any = { ...config };
  
  if (config.createdAt) {
    result.createdAt = new Date(config.createdAt);
  }
  
  if (config.updatedAt) {
    result.updatedAt = new Date(config.updatedAt);
  }
  
  return result as Partial<SharedAgentConfig>;
};