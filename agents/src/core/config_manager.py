"""
Configuration management for AI agents
"""
import asyncio
import json
import logging
from typing import Dict, Any, Callable, Optional
from datetime import datetime

import redis.asyncio as redis
import psycopg2
from psycopg2.extras import RealDictCursor

from .interfaces import AgentConfig, ConfigurationInterface


class ConfigurationManager(ConfigurationInterface):
    """
    Configuration manager that handles loading, saving, and watching
    agent configurations with hot-reloading support.
    """
    
    def __init__(self, db_config: Dict[str, Any], redis_config: Dict[str, Any]):
        self.db_config = db_config
        self.redis_config = redis_config
        self.redis_client: Optional[redis.Redis] = None
        self.db_connection = None
        self.config_watchers: Dict[str, Callable] = {}
        self.logger = logging.getLogger("config_manager")
        
    async def initialize(self) -> None:
        """Initialize the configuration manager"""
        try:
            # Initialize Redis connection for config change notifications
            self.redis_client = redis.Redis(**self.redis_config)
            await self.redis_client.ping()
            
            # Initialize database connection
            self.db_connection = psycopg2.connect(**self.db_config)
            
            # Start config change listener
            asyncio.create_task(self._listen_for_config_changes())
            
            self.logger.info("Configuration manager initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize configuration manager: {str(e)}")
            raise
    
    async def load_config(self, agent_id: str) -> AgentConfig:
        """Load configuration for an agent"""
        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT * FROM agent_configurations 
                    WHERE id = %s AND enabled = true
                    """,
                    (agent_id,)
                )
                
                row = cursor.fetchone()
                if not row:
                    raise ValueError(f"Configuration not found for agent {agent_id}")
                
                # Parse JSON fields
                config_data = dict(row)
                config_data['thresholds'] = json.loads(config_data.get('thresholds', '{}'))
                config_data['integrations'] = json.loads(config_data.get('integrations', '[]'))
                
                # Convert to AgentConfig model
                config = AgentConfig(**config_data)
                
                self.logger.debug(f"Loaded configuration for agent {agent_id}")
                return config
                
        except Exception as e:
            self.logger.error(f"Failed to load config for agent {agent_id}: {str(e)}")
            raise
    
    async def save_config(self, config: AgentConfig) -> None:
        """Save agent configuration"""
        try:
            config.updated_at = datetime.utcnow()
            
            with self.db_connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO agent_configurations 
                    (id, name, type, enabled, automation_level, thresholds, 
                     approval_required, integrations, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        type = EXCLUDED.type,
                        enabled = EXCLUDED.enabled,
                        automation_level = EXCLUDED.automation_level,
                        thresholds = EXCLUDED.thresholds,
                        approval_required = EXCLUDED.approval_required,
                        integrations = EXCLUDED.integrations,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        config.id,
                        config.name,
                        config.type.value,
                        config.enabled,
                        config.automation_level.value,
                        json.dumps(config.thresholds),
                        config.approval_required,
                        json.dumps([integration.dict() for integration in config.integrations]),
                        config.created_at,
                        config.updated_at
                    )
                )
                
                self.db_connection.commit()
            
            # Notify about config change
            if self.redis_client:
                await self.redis_client.publish(
                    f"config_change:{config.id}",
                    json.dumps(config.dict(), default=str)
                )
            
            self.logger.info(f"Saved configuration for agent {config.id}")
            
        except Exception as e:
            self.logger.error(f"Failed to save config for agent {config.id}: {str(e)}")
            if self.db_connection:
                self.db_connection.rollback()
            raise
    
    async def watch_config_changes(self, agent_id: str, callback: Callable) -> None:
        """Watch for configuration changes"""
        self.config_watchers[agent_id] = callback
        self.logger.debug(f"Started watching config changes for agent {agent_id}")
    
    async def _listen_for_config_changes(self) -> None:
        """Listen for configuration change notifications"""
        if not self.redis_client:
            return
            
        try:
            pubsub = self.redis_client.pubsub()
            await pubsub.psubscribe("config_change:*")
            
            async for message in pubsub.listen():
                if message['type'] == 'pmessage':
                    try:
                        # Extract agent ID from channel
                        channel = message['channel'].decode('utf-8')
                        agent_id = channel.split(':', 1)[1]
                        
                        if agent_id in self.config_watchers:
                            # Parse the new configuration
                            config_data = json.loads(message['data'].decode('utf-8'))
                            new_config = AgentConfig(**config_data)
                            
                            # Call the callback
                            await self.config_watchers[agent_id](new_config)
                            
                    except Exception as e:
                        self.logger.error(f"Error processing config change notification: {str(e)}")
                        
        except Exception as e:
            self.logger.error(f"Error in config change listener: {str(e)}")
    
    async def get_all_configs(self) -> Dict[str, AgentConfig]:
        """Get all agent configurations"""
        try:
            configs = {}
            
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM agent_configurations WHERE enabled = true")
                
                for row in cursor.fetchall():
                    config_data = dict(row)
                    config_data['thresholds'] = json.loads(config_data.get('thresholds', '{}'))
                    config_data['integrations'] = json.loads(config_data.get('integrations', '[]'))
                    
                    config = AgentConfig(**config_data)
                    configs[config.id] = config
            
            return configs
            
        except Exception as e:
            self.logger.error(f"Failed to get all configs: {str(e)}")
            raise
    
    async def delete_config(self, agent_id: str) -> None:
        """Delete agent configuration"""
        try:
            with self.db_connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE agent_configurations SET enabled = false WHERE id = %s",
                    (agent_id,)
                )
                self.db_connection.commit()
            
            # Notify about config deletion
            if self.redis_client:
                await self.redis_client.publish(
                    f"config_deleted:{agent_id}",
                    ""
                )
            
            self.logger.info(f"Deleted configuration for agent {agent_id}")
            
        except Exception as e:
            self.logger.error(f"Failed to delete config for agent {agent_id}: {str(e)}")
            if self.db_connection:
                self.db_connection.rollback()
            raise
    
    async def close(self) -> None:
        """Close connections"""
        if self.redis_client:
            await self.redis_client.close()
        
        if self.db_connection:
            self.db_connection.close()
        
        self.logger.info("Configuration manager closed")