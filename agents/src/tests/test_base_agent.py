"""
Tests for the base agent framework
"""
import pytest
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from src.core.interfaces import (
    AgentConfig, AgentType, AutomationLevel, SystemEvent, EventType,
    AgentAction, ActionType, RiskLevel, ActionResult, HealthStatus, AgentStatus
)
from src.core.example_agent import ExampleAgent


class MockEventBus:
    """Mock event bus for testing"""
    
    def __init__(self):
        self.published_events = []
        self.published_actions = []
        self.subscriptions = {}
    
    async def publish_event(self, event):
        self.published_events.append(event)
    
    async def subscribe_to_events(self, event_types, callback):
        for event_type in event_types:
            if event_type not in self.subscriptions:
                self.subscriptions[event_type] = []
            self.subscriptions[event_type].append(callback)
    
    async def publish_action(self, action):
        self.published_actions.append(action)


class MockConfigService:
    """Mock configuration service for testing"""
    
    def __init__(self):
        self.configs = {}
        self.watchers = {}
    
    async def load_config(self, agent_id):
        if agent_id not in self.configs:
            raise ValueError(f"Config not found for {agent_id}")
        return self.configs[agent_id]
    
    async def save_config(self, config):
        self.configs[config.id] = config
    
    async def watch_config_changes(self, agent_id, callback):
        self.watchers[agent_id] = callback


class MockAuditService:
    """Mock audit service for testing"""
    
    def __init__(self):
        self.logged_actions = []
        self.logged_events = []
        self.logged_health_statuses = []
    
    async def log_action(self, action, result):
        self.logged_actions.append((action, result))
    
    async def log_event(self, event):
        self.logged_events.append(event)
    
    async def log_health_status(self, agent_id, status):
        self.logged_health_statuses.append((agent_id, status))


@pytest.fixture
def mock_services():
    """Create mock services for testing"""
    return {
        'event_bus': MockEventBus(),
        'config_service': MockConfigService(),
        'audit_service': MockAuditService()
    }


@pytest.fixture
def sample_config():
    """Create a sample agent configuration"""
    return AgentConfig(
        id="test_agent",
        name="Test Agent",
        type=AgentType.TERRAFORM,
        enabled=True,
        automation_level=AutomationLevel.SEMI_AUTO,
        thresholds={"cpu_threshold": 80.0, "memory_threshold": 90.0},
        approval_required=True
    )


@pytest.fixture
def sample_event():
    """Create a sample system event"""
    return SystemEvent(
        id="test_event_1",
        type=EventType.INFRASTRUCTURE_DRIFT,
        source="terraform_state",
        severity="medium",
        data={"resource": "aws_instance.web", "drift_type": "configuration"}
    )


@pytest.mark.asyncio
class TestBaseAgent:
    """Test cases for the base agent functionality"""
    
    async def test_agent_initialization(self, mock_services, sample_config):
        """Test agent initialization"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        
        assert agent.config == sample_config
        assert agent.agent_id == "test_agent"
        assert not agent.is_running
    
    async def test_agent_start_stop(self, mock_services, sample_config):
        """Test agent start and stop functionality"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        
        # Test start
        await agent.start()
        assert agent.is_running
        assert agent.start_time is not None
        
        # Test stop
        await agent.stop()
        assert not agent.is_running
    
    async def test_event_processing(self, mock_services, sample_config, sample_event):
        """Test event processing functionality"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        await agent.start()
        
        # Process an event
        action = await agent.process_event(sample_event)
        
        assert action is not None
        assert action.agent_id == "test_agent"
        assert action.type == ActionType.TERRAFORM_PLAN
        assert sample_event.source in action.target_resources
        
        # Check that event was logged
        assert len(mock_services['audit_service'].logged_events) == 1
        assert mock_services['audit_service'].logged_events[0] == sample_event
        
        # Check that action was published
        assert len(mock_services['event_bus'].published_actions) == 1
        assert mock_services['event_bus'].published_actions[0] == action
        
        await agent.stop()
    
    async def test_action_execution(self, mock_services, sample_config):
        """Test action execution functionality"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        await agent.start()
        
        # Create a test action
        action = AgentAction(
            id="test_action",
            agent_id="test_agent",
            type=ActionType.TERRAFORM_PLAN,
            description="Test action",
            target_resources=["test_resource"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test impact"
        )
        
        # Execute the action
        result = await agent.execute_action(action)
        
        assert isinstance(result, ActionResult)
        assert result.success is True
        assert result.execution_time is not None
        assert result.execution_time > 0
        
        # Check that action was logged
        assert len(mock_services['audit_service'].logged_actions) == 1
        logged_action, logged_result = mock_services['audit_service'].logged_actions[0]
        assert logged_action == action
        assert logged_result == result
        
        # Check metrics were updated
        assert agent.metrics["actions_executed"] == 1
        assert agent.metrics["actions_successful"] == 1
        assert agent.metrics["avg_execution_time"] > 0
        
        await agent.stop()
    
    async def test_health_status(self, mock_services, sample_config):
        """Test health status reporting"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        await agent.start()
        
        # Get health status
        health_status = await agent.get_health_status()
        
        assert isinstance(health_status, HealthStatus)
        assert health_status.status == AgentStatus.HEALTHY
        assert health_status.uptime >= 0
        assert health_status.error_count == 0
        assert health_status.last_error is None
        
        # Check that health status was logged
        assert len(mock_services['audit_service'].logged_health_statuses) == 1
        logged_agent_id, logged_status = mock_services['audit_service'].logged_health_statuses[0]
        assert logged_agent_id == "test_agent"
        assert logged_status == health_status
        
        await agent.stop()
    
    async def test_config_reload(self, mock_services, sample_config):
        """Test configuration reloading"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        
        # Create new config with different settings
        new_config = AgentConfig(
            id="test_agent",
            name="Updated Test Agent",
            type=AgentType.TERRAFORM,
            enabled=True,
            automation_level=AutomationLevel.FULL_AUTO,
            thresholds={"cpu_threshold": 70.0, "memory_threshold": 85.0},
            approval_required=False
        )
        
        # Reload configuration
        await agent.reload_config(new_config)
        
        assert agent.config == new_config
        assert agent.config.name == "Updated Test Agent"
        assert agent.config.automation_level == AutomationLevel.FULL_AUTO
        assert agent.config.approval_required is False
    
    async def test_error_handling(self, mock_services, sample_config):
        """Test error handling in various scenarios"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        await agent.start()
        
        # Test action execution with unknown action type
        unknown_action = AgentAction(
            id="unknown_action",
            agent_id="test_agent",
            type="unknown_type",  # This will cause an error
            description="Unknown action",
            target_resources=["test_resource"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test impact"
        )
        
        result = await agent.execute_action(unknown_action)
        
        assert result.success is False
        assert result.error is not None
        assert agent.error_count > 0
        assert agent.last_error is not None
        
        await agent.stop()
    
    async def test_metrics_tracking(self, mock_services, sample_config, sample_event):
        """Test metrics tracking functionality"""
        agent = ExampleAgent(
            agent_id="test_agent",
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        await agent.start()
        
        # Process multiple events
        for i in range(3):
            event = SystemEvent(
                id=f"test_event_{i}",
                type=EventType.INFRASTRUCTURE_DRIFT,
                source=f"resource_{i}",
                severity="medium",
                data={"test": "data"}
            )
            await agent.process_event(event)
        
        # Check metrics
        assert agent.metrics["events_processed"] == 3
        
        # Execute some actions
        for i in range(2):
            action = AgentAction(
                id=f"test_action_{i}",
                agent_id="test_agent",
                type=ActionType.TERRAFORM_PLAN,
                description=f"Test action {i}",
                target_resources=[f"resource_{i}"],
                risk_level=RiskLevel.LOW,
                estimated_impact="Test impact"
            )
            await agent.execute_action(action)
        
        # Check action metrics
        assert agent.metrics["actions_executed"] == 2
        assert agent.metrics["actions_successful"] == 2
        assert agent.metrics["actions_failed"] == 0
        assert agent.metrics["avg_execution_time"] > 0
        
        await agent.stop()


if __name__ == "__main__":
    pytest.main([__file__])