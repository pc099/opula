"""
Base Agent class implementation for the AIOps Platform
"""
import asyncio
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
from abc import abstractmethod

from .interfaces import (
    AgentInterface, AgentConfig, SystemEvent, AgentAction, ActionResult,
    HealthStatus, AgentStatus, EventBusInterface, ConfigurationInterface,
    AuditInterface, EventType, ActionStatus
)


class BaseAgent(AgentInterface):
    """
    Abstract base class for all AI agents in the AIOps platform.
    Provides common functionality for health monitoring, configuration management,
    and standardized action execution.
    """
    
    def __init__(
        self,
        agent_id: str,
        event_bus: EventBusInterface,
        config_service: ConfigurationInterface,
        audit_service: AuditInterface
    ):
        self.agent_id = agent_id
        self.event_bus = event_bus
        self.config_service = config_service
        self.audit_service = audit_service
        
        # Agent state
        self.config: Optional[AgentConfig] = None
        self.is_running = False
        self.start_time: Optional[datetime] = None
        self.last_heartbeat: Optional[datetime] = None
        self.error_count = 0
        self.last_error: Optional[str] = None
        
        # Health monitoring
        self._health_check_interval = 30  # seconds
        self._health_check_task: Optional[asyncio.Task] = None
        self._config_watch_task: Optional[asyncio.Task] = None
        
        # Metrics
        self.metrics: Dict[str, Any] = {
            "events_processed": 0,
            "actions_executed": 0,
            "actions_successful": 0,
            "actions_failed": 0,
            "avg_execution_time": 0.0
        }
        
        # Logger
        self.logger = logging.getLogger(f"agent.{self.agent_id}")
        
    async def initialize(self, config: AgentConfig) -> None:
        """Initialize the agent with configuration"""
        try:
            self.config = config
            self.logger.info(f"Initializing agent {self.agent_id} with config")
            
            # Perform agent-specific initialization
            await self._initialize_agent_specific()
            
            # Set up configuration watching
            await self._setup_config_watching()
            
            self.logger.info(f"Agent {self.agent_id} initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize agent {self.agent_id}: {str(e)}")
            self.last_error = str(e)
            self.error_count += 1
            raise
    
    async def start(self) -> None:
        """Start the agent"""
        if self.is_running:
            self.logger.warning(f"Agent {self.agent_id} is already running")
            return
            
        try:
            self.logger.info(f"Starting agent {self.agent_id}")
            
            if not self.config:
                raise RuntimeError("Agent not initialized - no configuration loaded")
            
            self.is_running = True
            self.start_time = datetime.utcnow()
            self.last_heartbeat = datetime.utcnow()
            
            # Start health monitoring
            self._health_check_task = asyncio.create_task(self._health_check_loop())
            
            # Subscribe to relevant events
            await self._subscribe_to_events()
            
            # Perform agent-specific startup
            await self._start_agent_specific()
            
            self.logger.info(f"Agent {self.agent_id} started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start agent {self.agent_id}: {str(e)}")
            self.last_error = str(e)
            self.error_count += 1
            self.is_running = False
            raise
    
    async def stop(self) -> None:
        """Stop the agent"""
        if not self.is_running:
            self.logger.warning(f"Agent {self.agent_id} is not running")
            return
            
        try:
            self.logger.info(f"Stopping agent {self.agent_id}")
            
            self.is_running = False
            
            # Cancel health check task
            if self._health_check_task:
                self._health_check_task.cancel()
                try:
                    await self._health_check_task
                except asyncio.CancelledError:
                    pass
            
            # Cancel config watch task
            if self._config_watch_task:
                self._config_watch_task.cancel()
                try:
                    await self._config_watch_task
                except asyncio.CancelledError:
                    pass
            
            # Perform agent-specific cleanup
            await self._stop_agent_specific()
            
            self.logger.info(f"Agent {self.agent_id} stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping agent {self.agent_id}: {str(e)}")
            self.last_error = str(e)
            self.error_count += 1
    
    async def process_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Process a system event and return an action if needed"""
        try:
            self.logger.debug(f"Processing event {event.id} of type {event.type}")
            
            if not self.is_running or not self.config or not self.config.enabled:
                self.logger.debug(f"Agent {self.agent_id} not active, skipping event")
                return None
            
            # Update metrics
            self.metrics["events_processed"] += 1
            
            # Log the event
            await self.audit_service.log_event(event)
            
            # Process the event using agent-specific logic
            action = await self._process_event_specific(event)
            
            if action:
                self.logger.info(f"Generated action {action.id} for event {event.id}")
                # Publish action for approval/execution
                await self.event_bus.publish_action(action)
            
            return action
            
        except Exception as e:
            self.logger.error(f"Error processing event {event.id}: {str(e)}")
            self.last_error = str(e)
            self.error_count += 1
            return None
    
    async def execute_action(self, action: AgentAction) -> ActionResult:
        """Execute an agent action"""
        start_time = time.time()
        
        try:
            self.logger.info(f"Executing action {action.id} of type {action.type}")
            
            if not self.is_running or not self.config:
                raise RuntimeError("Agent not active")
            
            # Update action status
            action.status = ActionStatus.EXECUTING
            action.executed_at = datetime.utcnow()
            
            # Execute the action using agent-specific logic
            result = await self._execute_action_specific(action)
            
            # Update metrics
            execution_time = time.time() - start_time
            self.metrics["actions_executed"] += 1
            
            if result.success:
                self.metrics["actions_successful"] += 1
                action.status = ActionStatus.COMPLETED
            else:
                self.metrics["actions_failed"] += 1
                action.status = ActionStatus.FAILED
            
            # Update average execution time
            current_avg = self.metrics["avg_execution_time"]
            total_actions = self.metrics["actions_executed"]
            self.metrics["avg_execution_time"] = (
                (current_avg * (total_actions - 1) + execution_time) / total_actions
            )
            
            result.execution_time = execution_time
            action.result = result
            
            # Log the action and result
            await self.audit_service.log_action(action, result)
            
            self.logger.info(f"Action {action.id} completed with success={result.success}")
            return result
            
        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = str(e)
            
            self.logger.error(f"Error executing action {action.id}: {error_msg}")
            self.last_error = error_msg
            self.error_count += 1
            self.metrics["actions_executed"] += 1
            self.metrics["actions_failed"] += 1
            
            result = ActionResult(
                success=False,
                message="Action execution failed",
                error=error_msg,
                execution_time=execution_time
            )
            
            action.status = ActionStatus.FAILED
            action.result = result
            
            # Log the failed action
            await self.audit_service.log_action(action, result)
            
            return result
    
    async def get_health_status(self) -> HealthStatus:
        """Get current health status of the agent"""
        now = datetime.utcnow()
        uptime = 0.0
        
        if self.start_time:
            uptime = (now - self.start_time).total_seconds()
        
        # Determine status based on various factors
        if not self.is_running:
            status = AgentStatus.OFFLINE
        elif self.error_count > 10:  # Too many errors
            status = AgentStatus.UNHEALTHY
        elif self.error_count > 5:   # Some errors
            status = AgentStatus.DEGRADED
        else:
            status = AgentStatus.HEALTHY
        
        health_status = HealthStatus(
            status=status,
            last_heartbeat=self.last_heartbeat or now,
            uptime=uptime,
            error_count=self.error_count,
            last_error=self.last_error,
            metrics=self.metrics.copy()
        )
        
        # Log health status
        await self.audit_service.log_health_status(self.agent_id, health_status)
        
        return health_status
    
    async def reload_config(self, config: AgentConfig) -> None:
        """Reload agent configuration"""
        try:
            self.logger.info(f"Reloading configuration for agent {self.agent_id}")
            
            old_config = self.config
            self.config = config
            
            # Perform agent-specific configuration reload
            await self._reload_config_specific(old_config, config)
            
            self.logger.info(f"Configuration reloaded successfully for agent {self.agent_id}")
            
        except Exception as e:
            self.logger.error(f"Failed to reload config for agent {self.agent_id}: {str(e)}")
            self.last_error = str(e)
            self.error_count += 1
            raise
    
    # Abstract methods to be implemented by specific agents
    
    @abstractmethod
    async def _initialize_agent_specific(self) -> None:
        """Agent-specific initialization logic"""
        pass
    
    @abstractmethod
    async def _start_agent_specific(self) -> None:
        """Agent-specific startup logic"""
        pass
    
    @abstractmethod
    async def _stop_agent_specific(self) -> None:
        """Agent-specific cleanup logic"""
        pass
    
    @abstractmethod
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        """Agent-specific event processing logic"""
        pass
    
    @abstractmethod
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        """Agent-specific action execution logic"""
        pass
    
    @abstractmethod
    async def _reload_config_specific(self, old_config: Optional[AgentConfig], new_config: AgentConfig) -> None:
        """Agent-specific configuration reload logic"""
        pass
    
    @abstractmethod
    def _get_subscribed_event_types(self) -> List[EventType]:
        """Return list of event types this agent should subscribe to"""
        pass
    
    # Private helper methods
    
    async def _health_check_loop(self) -> None:
        """Background task for health monitoring"""
        while self.is_running:
            try:
                self.last_heartbeat = datetime.utcnow()
                
                # Perform agent-specific health checks
                await self._perform_health_check()
                
                await asyncio.sleep(self._health_check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in health check loop: {str(e)}")
                self.last_error = str(e)
                self.error_count += 1
                await asyncio.sleep(self._health_check_interval)
    
    async def _setup_config_watching(self) -> None:
        """Set up configuration change watching"""
        try:
            self._config_watch_task = asyncio.create_task(
                self.config_service.watch_config_changes(
                    self.agent_id, 
                    self._on_config_change
                )
            )
        except Exception as e:
            self.logger.warning(f"Could not set up config watching: {str(e)}")
    
    async def _on_config_change(self, new_config: AgentConfig) -> None:
        """Handle configuration changes"""
        try:
            await self.reload_config(new_config)
        except Exception as e:
            self.logger.error(f"Failed to handle config change: {str(e)}")
    
    async def _subscribe_to_events(self) -> None:
        """Subscribe to relevant events"""
        event_types = self._get_subscribed_event_types()
        if event_types:
            await self.event_bus.subscribe_to_events(event_types, self.process_event)
    
    async def _perform_health_check(self) -> None:
        """Perform agent-specific health checks - can be overridden"""
        pass