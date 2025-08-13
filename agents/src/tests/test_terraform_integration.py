"""
Integration tests for Terraform Agent with the agent factory
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch

from src.core.agent_factory import AgentManager
from src.core.interfaces import AgentType, AgentConfig, AutomationLevel, Integration
from src.agents.terraform_agent import TerraformAgent


class MockEventBus:
    """Mock event bus for testing"""
    
    def __init__(self):
        self.published_events = []
        self.published_actions = []
        self.subscriptions = {}
    
    async def publish_event(self, event):
        self.published_events.append(event)
    
    async def publish_action(self, action):
        self.published_actions.append(action)
    
    async def subscribe_to_events(self, event_types, callback):
        for event_type in event_types:
            self.subscriptions[event_type] = callback


class MockConfigService:
    """Mock configuration service for testing"""
    
    def __init__(self):
        self.configs = {}
    
    async def load_config(self, agent_id):
        return self.configs.get(agent_id)
    
    async def save_config(self, config):
        self.configs[config.id] = config
    
    async def watch_config_changes(self, agent_id, callback):
        pass
    
    async def get_all_configs(self):
        return self.configs


class MockAuditService:
    """Mock audit service for testing"""
    
    def __init__(self):
        self.logged_actions = []
        self.logged_events = []
        self.logged_health = []
    
    async def log_action(self, action, result):
        self.logged_actions.append((action, result))
    
    async def log_event(self, event):
        self.logged_events.append(event)
    
    async def log_health_status(self, agent_id, status):
        self.logged_health.append((agent_id, status))


@pytest.fixture
def mock_services():
    """Fixture providing mock services"""
    return {
        'event_bus': MockEventBus(),
        'config_service': MockConfigService(),
        'audit_service': MockAuditService()
    }


@pytest.fixture
def terraform_config():
    """Fixture providing Terraform agent configuration"""
    return AgentConfig(
        id="terraform-agent-integration",
        name="Integration Test Terraform Agent",
        type=AgentType.TERRAFORM,
        enabled=True,
        automation_level=AutomationLevel.SEMI_AUTO,
        thresholds={
            "drift_check_interval": 60,
            "auto_apply_threshold": 0.8
        },
        approval_required=True,
        integrations=[
            Integration(
                name="terraform",
                type="terraform",
                config={
                    "workspace_path": "/tmp/terraform-integration-test",
                    "backend_config": {"type": "local"},
                    "model_path": "/tmp/terraform_integration_model.joblib"
                }
            )
        ]
    )


class TestTerraformAgentIntegration:
    """Integration tests for Terraform Agent with the agent management system"""
    
    @pytest.mark.asyncio
    async def test_agent_factory_creates_terraform_agent(self, mock_services, terraform_config):
        """Test that the agent factory can create a Terraform agent"""
        # Create agent manager
        agent_manager = AgentManager(
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        # Register Terraform agent class
        agent_manager.register_agent_class(AgentType.TERRAFORM, TerraformAgent)
        
        # Create agent
        agent = await agent_manager.create_and_register_agent(terraform_config)
        
        # Verify agent was created correctly
        assert isinstance(agent, TerraformAgent)
        assert agent.agent_id == terraform_config.id
        assert agent.config == terraform_config
        
        # Verify agent is registered
        registered_agent = agent_manager.get_agent(terraform_config.id)
        assert registered_agent is agent
        
        # Clean up
        await agent_manager.shutdown_all_agents()
    
    @pytest.mark.asyncio
    async def test_terraform_agent_lifecycle(self, mock_services, terraform_config):
        """Test complete lifecycle of Terraform agent"""
        # Create agent manager
        agent_manager = AgentManager(
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        # Register Terraform agent class
        agent_manager.register_agent_class(AgentType.TERRAFORM, TerraformAgent)
        
        # Create and register agent
        agent = await agent_manager.create_and_register_agent(terraform_config)
        
        # Mock the drift monitoring loop to avoid actual monitoring
        with patch.object(agent, '_drift_monitoring_loop') as mock_loop:
            mock_loop.return_value = asyncio.create_task(asyncio.sleep(0.1))
            
            # Start agent
            await agent.start()
            assert agent.is_running is True
            
            # Get health status
            health = await agent.get_health_status()
            assert health.status.value in ['healthy', 'degraded', 'unhealthy']
            
            # Stop agent
            await agent.stop()
            assert agent.is_running is False
        
        # Clean up
        await agent_manager.shutdown_all_agents()
    
    @pytest.mark.asyncio
    async def test_terraform_agent_configuration_reload(self, mock_services, terraform_config):
        """Test that Terraform agent can reload configuration"""
        # Create agent manager
        agent_manager = AgentManager(
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        # Register Terraform agent class
        agent_manager.register_agent_class(AgentType.TERRAFORM, TerraformAgent)
        
        # Create agent
        agent = await agent_manager.create_and_register_agent(terraform_config)
        
        # Create new configuration with different thresholds
        new_config = terraform_config.copy()
        new_config.thresholds = {
            "drift_check_interval": 120,  # Changed from 60
            "auto_apply_threshold": 0.9   # Changed from 0.8
        }
        
        # Reload configuration
        await agent.reload_config(new_config)
        
        # Verify configuration was updated
        assert agent.config.thresholds["drift_check_interval"] == 120
        assert agent.config.thresholds["auto_apply_threshold"] == 0.9
        assert agent.drift_check_interval == 120
        assert agent.auto_apply_threshold == 0.9
        
        # Clean up
        await agent_manager.shutdown_all_agents()
    
    def test_terraform_agent_supported_event_types(self, mock_services, terraform_config):
        """Test that Terraform agent subscribes to correct event types"""
        # Create agent
        agent = TerraformAgent(
            agent_id=terraform_config.id,
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        # Get subscribed event types
        event_types = agent._get_subscribed_event_types()
        
        # Verify correct event types
        from src.core.interfaces import EventType
        assert EventType.INFRASTRUCTURE_DRIFT in event_types
        
        # Should only subscribe to infrastructure drift events
        assert len(event_types) == 1
    
    @pytest.mark.asyncio
    async def test_agent_manager_status_summary(self, mock_services, terraform_config):
        """Test that agent manager provides correct status summary"""
        # Create agent manager
        agent_manager = AgentManager(
            event_bus=mock_services['event_bus'],
            config_service=mock_services['config_service'],
            audit_service=mock_services['audit_service']
        )
        
        # Register Terraform agent class
        agent_manager.register_agent_class(AgentType.TERRAFORM, TerraformAgent)
        
        # Create agent
        agent = await agent_manager.create_and_register_agent(terraform_config)
        
        # Get status summary
        status_summary = agent_manager.get_agent_status_summary()
        
        # Verify status summary
        assert terraform_config.id in status_summary
        agent_status = status_summary[terraform_config.id]
        
        assert agent_status["type"] == "terraform"
        assert agent_status["name"] == terraform_config.name
        assert agent_status["enabled"] == terraform_config.enabled
        assert agent_status["running"] == agent.is_running
        assert agent_status["automation_level"] == terraform_config.automation_level.value
        
        # Clean up
        await agent_manager.shutdown_all_agents()


if __name__ == "__main__":
    pytest.main([__file__])