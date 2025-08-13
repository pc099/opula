"""
Agent factory and registry for creating and managing AI agents
"""
import logging
from typing import Dict, Type, Optional, List
from abc import ABC, abstractmethod

from .interfaces import (
    AgentInterface, AgentConfig, AgentType, EventBusInterface, 
    ConfigurationInterface, AuditInterface
)
from .base_agent import BaseAgent


class AgentFactory:
    """
    Factory class for creating AI agents based on configuration.
    Manages agent types and provides a centralized way to create agents.
    """
    
    def __init__(
        self,
        event_bus: EventBusInterface,
        config_service: ConfigurationInterface,
        audit_service: AuditInterface
    ):
        self.event_bus = event_bus
        self.config_service = config_service
        self.audit_service = audit_service
        self.agent_classes: Dict[AgentType, Type[BaseAgent]] = {}
        self.logger = logging.getLogger("agent_factory")
    
    def register_agent_class(self, agent_type: AgentType, agent_class: Type[BaseAgent]) -> None:
        """Register an agent class for a specific agent type"""
        self.agent_classes[agent_type] = agent_class
        self.logger.info(f"Registered agent class for type: {agent_type.value}")
    
    async def create_agent(self, config: AgentConfig) -> BaseAgent:
        """Create an agent instance based on configuration"""
        if config.type not in self.agent_classes:
            raise ValueError(f"No agent class registered for type: {config.type.value}")
        
        agent_class = self.agent_classes[config.type]
        
        try:
            # Create agent instance
            agent = agent_class(
                agent_id=config.id,
                event_bus=self.event_bus,
                config_service=self.config_service,
                audit_service=self.audit_service
            )
            
            # Initialize the agent
            await agent.initialize(config)
            
            self.logger.info(f"Created agent {config.id} of type {config.type.value}")
            return agent
            
        except Exception as e:
            self.logger.error(f"Failed to create agent {config.id}: {str(e)}")
            raise
    
    def get_supported_agent_types(self) -> List[AgentType]:
        """Get list of supported agent types"""
        return list(self.agent_classes.keys())
    
    def is_agent_type_supported(self, agent_type: AgentType) -> bool:
        """Check if an agent type is supported"""
        return agent_type in self.agent_classes


class AgentRegistry:
    """
    Registry for managing active agent instances.
    Provides lifecycle management and lookup capabilities.
    """
    
    def __init__(self):
        self.agents: Dict[str, BaseAgent] = {}
        self.agent_configs: Dict[str, AgentConfig] = {}
        self.logger = logging.getLogger("agent_registry")
    
    async def register_agent(self, agent: BaseAgent, config: AgentConfig) -> None:
        """Register an agent instance"""
        if config.id in self.agents:
            self.logger.warning(f"Agent {config.id} is already registered")
            return
        
        self.agents[config.id] = agent
        self.agent_configs[config.id] = config
        
        self.logger.info(f"Registered agent {config.id}")
    
    async def unregister_agent(self, agent_id: str) -> None:
        """Unregister an agent instance"""
        if agent_id not in self.agents:
            self.logger.warning(f"Agent {agent_id} is not registered")
            return
        
        # Stop the agent if it's running
        agent = self.agents[agent_id]
        try:
            await agent.stop()
        except Exception as e:
            self.logger.error(f"Error stopping agent {agent_id}: {str(e)}")
        
        # Remove from registry
        del self.agents[agent_id]
        del self.agent_configs[agent_id]
        
        self.logger.info(f"Unregistered agent {agent_id}")
    
    def get_agent(self, agent_id: str) -> Optional[BaseAgent]:
        """Get an agent instance by ID"""
        return self.agents.get(agent_id)
    
    def get_agent_config(self, agent_id: str) -> Optional[AgentConfig]:
        """Get agent configuration by ID"""
        return self.agent_configs.get(agent_id)
    
    def get_all_agents(self) -> Dict[str, BaseAgent]:
        """Get all registered agents"""
        return self.agents.copy()
    
    def get_agents_by_type(self, agent_type: AgentType) -> Dict[str, BaseAgent]:
        """Get all agents of a specific type"""
        return {
            agent_id: agent
            for agent_id, agent in self.agents.items()
            if self.agent_configs[agent_id].type == agent_type
        }
    
    def get_active_agents(self) -> Dict[str, BaseAgent]:
        """Get all active (running) agents"""
        return {
            agent_id: agent
            for agent_id, agent in self.agents.items()
            if agent.is_running
        }
    
    async def start_agent(self, agent_id: str) -> None:
        """Start a specific agent"""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        
        await agent.start()
        self.logger.info(f"Started agent {agent_id}")
    
    async def stop_agent(self, agent_id: str) -> None:
        """Stop a specific agent"""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        
        await agent.stop()
        self.logger.info(f"Stopped agent {agent_id}")
    
    async def start_all_agents(self) -> None:
        """Start all registered agents"""
        for agent_id, agent in self.agents.items():
            try:
                if not agent.is_running:
                    await agent.start()
                    self.logger.info(f"Started agent {agent_id}")
            except Exception as e:
                self.logger.error(f"Failed to start agent {agent_id}: {str(e)}")
    
    async def stop_all_agents(self) -> None:
        """Stop all registered agents"""
        for agent_id, agent in self.agents.items():
            try:
                if agent.is_running:
                    await agent.stop()
                    self.logger.info(f"Stopped agent {agent_id}")
            except Exception as e:
                self.logger.error(f"Failed to stop agent {agent_id}: {str(e)}")
    
    async def reload_agent_config(self, agent_id: str, new_config: AgentConfig) -> None:
        """Reload configuration for a specific agent"""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        
        await agent.reload_config(new_config)
        self.agent_configs[agent_id] = new_config
        
        self.logger.info(f"Reloaded config for agent {agent_id}")
    
    def get_agent_status_summary(self) -> Dict[str, Dict[str, any]]:
        """Get status summary for all agents"""
        summary = {}
        
        for agent_id, agent in self.agents.items():
            config = self.agent_configs[agent_id]
            summary[agent_id] = {
                "type": config.type.value,
                "name": config.name,
                "enabled": config.enabled,
                "running": agent.is_running,
                "automation_level": config.automation_level.value,
                "error_count": agent.error_count,
                "last_error": agent.last_error
            }
        
        return summary


class AgentManager:
    """
    High-level agent manager that combines factory and registry
    to provide complete agent lifecycle management.
    """
    
    def __init__(
        self,
        event_bus: EventBusInterface,
        config_service: ConfigurationInterface,
        audit_service: AuditInterface
    ):
        self.factory = AgentFactory(event_bus, config_service, audit_service)
        self.registry = AgentRegistry()
        self.config_service = config_service
        self.logger = logging.getLogger("agent_manager")
    
    def register_agent_class(self, agent_type: AgentType, agent_class: Type[BaseAgent]) -> None:
        """Register an agent class"""
        self.factory.register_agent_class(agent_type, agent_class)
    
    async def create_and_register_agent(self, config: AgentConfig) -> BaseAgent:
        """Create and register a new agent"""
        agent = await self.factory.create_agent(config)
        await self.registry.register_agent(agent, config)
        return agent
    
    async def load_and_start_agents(self) -> None:
        """Load all agent configurations and start enabled agents"""
        try:
            configs = await self.config_service.get_all_configs()
            
            for config in configs.values():
                if config.enabled:
                    try:
                        agent = await self.create_and_register_agent(config)
                        await agent.start()
                        self.logger.info(f"Loaded and started agent {config.id}")
                    except Exception as e:
                        self.logger.error(f"Failed to load agent {config.id}: {str(e)}")
            
            self.logger.info(f"Loaded {len(configs)} agent configurations")
            
        except Exception as e:
            self.logger.error(f"Failed to load agent configurations: {str(e)}")
            raise
    
    async def shutdown_all_agents(self) -> None:
        """Shutdown all agents"""
        await self.registry.stop_all_agents()
        
        # Unregister all agents
        agent_ids = list(self.registry.agents.keys())
        for agent_id in agent_ids:
            await self.registry.unregister_agent(agent_id)
        
        self.logger.info("All agents shut down")
    
    def get_agent(self, agent_id: str) -> Optional[BaseAgent]:
        """Get an agent by ID"""
        return self.registry.get_agent(agent_id)
    
    def get_all_agents(self) -> Dict[str, BaseAgent]:
        """Get all agents"""
        return self.registry.get_all_agents()
    
    def get_agent_status_summary(self) -> Dict[str, Dict[str, any]]:
        """Get status summary for all agents"""
        return self.registry.get_agent_status_summary()