"""
Example agent implementation to demonstrate the base agent framework
"""
import asyncio
import logging
from typing import List, Optional
from datetime import datetime

from .interfaces import (
    SystemEvent, AgentAction, ActionResult, EventType, ActionType,
    RiskLevel, AgentConfig, EventBusInterface, ConfigurationInterface,
    AuditInterface
)
from .base_agent import BaseAgent


class ExampleAgent(BaseAgent):
    """
    Example agent implementation that demonstrates how to extend BaseAgent.
    This agent simply logs events and performs mock actions.
    """
    
    def __init__(
        self,
        agent_id: str,
        event_bus: EventBusInterface,
        config_service: ConfigurationInterface,
        audit_service: AuditInterface
    ):
        super().__init__(agent_id, event_bus, config_service, audit_service)
        self.processed_events = []
        self.executed_actions = []
    
    async def _initialize_agent_specific(self) -> None:
        """Agent-specific initialization logic"""
        self.logger.info(f"Initializing example agent {self.agent_id}")
        
        # Initialize any agent-specific resources
        self.processed_events = []
        self.executed_actions = []
        
        # Set up any external connections or resources
        # For example: database connections, API clients, etc.
        
        self.logger.info(f"Example agent {self.agent_id} initialized")
    
    async def _start_agent_specific(self) -> None:
        """Agent-specific startup logic"""
        self.logger.info(f"Starting example agent {self.agent_id}")
        
        # Start any background tasks or connections
        # For example: start monitoring threads, connect to external services
        
        self.logger.info(f"Example agent {self.agent_id} started")
    
    async def _stop_agent_specific(self) -> None:
        """Agent-specific cleanup logic"""
        self.logger.info(f"Stopping example agent {self.agent_id}")
        
        # Clean up resources, close connections, etc.
        
        self.logger.info(f"Example agent {self.agent_id} stopped")
    
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        """Agent-specific event processing logic"""
        self.logger.info(f"Processing event {event.id} of type {event.type}")
        
        # Store the event for tracking
        self.processed_events.append(event)
        
        # Example logic: create actions based on event type
        action = None
        
        if event.type == EventType.INFRASTRUCTURE_DRIFT:
            action = AgentAction(
                id=f"action_{len(self.executed_actions) + 1}",
                agent_id=self.agent_id,
                type=ActionType.TERRAFORM_PLAN,
                description=f"Generate Terraform plan for drift in {event.source}",
                target_resources=[event.source],
                risk_level=RiskLevel.LOW,
                estimated_impact="Generate plan to show infrastructure changes"
            )
        
        elif event.type == EventType.RESOURCE_ANOMALY:
            action = AgentAction(
                id=f"action_{len(self.executed_actions) + 1}",
                agent_id=self.agent_id,
                type=ActionType.K8S_SCALE,
                description=f"Scale resources due to anomaly in {event.source}",
                target_resources=[event.source],
                risk_level=RiskLevel.MEDIUM,
                estimated_impact="Adjust resource allocation to handle anomaly"
            )
        
        elif event.type == EventType.INCIDENT_DETECTED:
            action = AgentAction(
                id=f"action_{len(self.executed_actions) + 1}",
                agent_id=self.agent_id,
                type=ActionType.INCIDENT_RESOLVE,
                description=f"Attempt to resolve incident in {event.source}",
                target_resources=[event.source],
                risk_level=RiskLevel.HIGH,
                estimated_impact="Execute automated incident resolution procedures"
            )
        
        if action:
            self.logger.info(f"Generated action {action.id} for event {event.id}")
        else:
            self.logger.debug(f"No action generated for event {event.id}")
        
        return action
    
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        """Agent-specific action execution logic"""
        self.logger.info(f"Executing action {action.id} of type {action.type}")
        
        # Store the action for tracking
        self.executed_actions.append(action)
        
        # Simulate action execution with different outcomes based on action type
        try:
            if action.type == ActionType.TERRAFORM_PLAN:
                # Simulate Terraform plan generation
                await asyncio.sleep(0.1)  # Simulate work
                
                result = ActionResult(
                    success=True,
                    message="Terraform plan generated successfully",
                    data={
                        "plan_output": "Plan: 2 to add, 1 to change, 0 to destroy",
                        "resources_affected": action.target_resources
                    }
                )
            
            elif action.type == ActionType.K8S_SCALE:
                # Simulate Kubernetes scaling
                await asyncio.sleep(0.2)  # Simulate work
                
                result = ActionResult(
                    success=True,
                    message="Kubernetes resources scaled successfully",
                    data={
                        "scaled_resources": action.target_resources,
                        "new_replica_count": 3
                    }
                )
            
            elif action.type == ActionType.INCIDENT_RESOLVE:
                # Simulate incident resolution (with some chance of failure)
                await asyncio.sleep(0.3)  # Simulate work
                
                # Simulate 80% success rate
                import random
                success = random.random() > 0.2
                
                if success:
                    result = ActionResult(
                        success=True,
                        message="Incident resolved automatically",
                        data={
                            "resolution_steps": [
                                "Identified root cause",
                                "Applied automated fix",
                                "Verified system stability"
                            ],
                            "affected_resources": action.target_resources
                        }
                    )
                else:
                    result = ActionResult(
                        success=False,
                        message="Automated resolution failed, escalating to human operator",
                        error="Complex incident requires manual intervention",
                        data={
                            "attempted_steps": [
                                "Identified root cause",
                                "Attempted automated fix"
                            ],
                            "escalation_reason": "Fix validation failed"
                        }
                    )
            
            else:
                # Unknown action type
                result = ActionResult(
                    success=False,
                    message=f"Unknown action type: {action.type}",
                    error="Action type not supported by this agent"
                )
            
            self.logger.info(f"Action {action.id} completed with success={result.success}")
            return result
            
        except Exception as e:
            error_msg = str(e)
            self.logger.error(f"Error executing action {action.id}: {error_msg}")
            
            return ActionResult(
                success=False,
                message="Action execution failed due to unexpected error",
                error=error_msg
            )
    
    async def _reload_config_specific(self, old_config: Optional[AgentConfig], new_config: AgentConfig) -> None:
        """Agent-specific configuration reload logic"""
        self.logger.info(f"Reloading configuration for example agent {self.agent_id}")
        
        # Handle configuration changes
        if old_config:
            # Check what changed and react accordingly
            if old_config.automation_level != new_config.automation_level:
                self.logger.info(f"Automation level changed from {old_config.automation_level} to {new_config.automation_level}")
            
            if old_config.thresholds != new_config.thresholds:
                self.logger.info("Thresholds updated")
        
        # Apply new configuration
        # For example: update internal parameters, reconnect to services, etc.
        
        self.logger.info(f"Configuration reloaded for example agent {self.agent_id}")
    
    def _get_subscribed_event_types(self) -> List[EventType]:
        """Return list of event types this agent should subscribe to"""
        return [
            EventType.INFRASTRUCTURE_DRIFT,
            EventType.RESOURCE_ANOMALY,
            EventType.INCIDENT_DETECTED
        ]
    
    async def _perform_health_check(self) -> None:
        """Perform agent-specific health checks"""
        # Example health checks
        try:
            # Check if we can process events
            if len(self.processed_events) > 1000:
                self.logger.warning("Large number of processed events, may need cleanup")
            
            # Check if we have too many failed actions
            failed_actions = sum(1 for action in self.executed_actions 
                               if action.result and not action.result.success)
            
            if failed_actions > 10:
                self.logger.warning(f"High number of failed actions: {failed_actions}")
            
            # Update custom metrics
            self.metrics.update({
                "processed_events_count": len(self.processed_events),
                "executed_actions_count": len(self.executed_actions),
                "failed_actions_count": failed_actions
            })
            
        except Exception as e:
            self.logger.error(f"Error in health check: {str(e)}")
    
    # Additional methods specific to this example agent
    
    def get_processed_events_summary(self) -> dict:
        """Get summary of processed events"""
        event_types = {}
        for event in self.processed_events:
            event_type = event.type.value
            event_types[event_type] = event_types.get(event_type, 0) + 1
        
        return {
            "total_events": len(self.processed_events),
            "event_types": event_types,
            "last_event_time": self.processed_events[-1].timestamp.isoformat() if self.processed_events else None
        }
    
    def get_executed_actions_summary(self) -> dict:
        """Get summary of executed actions"""
        action_types = {}
        successful_actions = 0
        
        for action in self.executed_actions:
            action_type = action.type.value
            action_types[action_type] = action_types.get(action_type, 0) + 1
            
            if action.result and action.result.success:
                successful_actions += 1
        
        return {
            "total_actions": len(self.executed_actions),
            "successful_actions": successful_actions,
            "success_rate": successful_actions / len(self.executed_actions) if self.executed_actions else 0,
            "action_types": action_types
        }