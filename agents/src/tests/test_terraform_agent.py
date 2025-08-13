"""
Tests for the Terraform Agent implementation
"""
import asyncio
import pytest
import tempfile
import os
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime

from src.agents.terraform_agent import TerraformAgent, TerraformStateMonitor, DriftPredictionModel
from src.core.interfaces import (
    AgentConfig, AgentType, SystemEvent, EventType, ActionType, 
    RiskLevel, AutomationLevel, Integration
)


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
        id="terraform-agent-1",
        name="Test Terraform Agent",
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
                    "workspace_path": "/tmp/terraform-test",
                    "backend_config": {"type": "local"},
                    "model_path": "/tmp/terraform_model.joblib"
                }
            )
        ]
    )


@pytest.fixture
def terraform_agent(mock_services, terraform_config):
    """Fixture providing a Terraform agent instance"""
    agent = TerraformAgent(
        agent_id=terraform_config.id,
        event_bus=mock_services['event_bus'],
        config_service=mock_services['config_service'],
        audit_service=mock_services['audit_service']
    )
    return agent


class TestTerraformStateMonitor:
    """Tests for TerraformStateMonitor"""
    
    def test_init(self):
        """Test state monitor initialization"""
        monitor = TerraformStateMonitor("/tmp/test", {"type": "local"})
        assert monitor.workspace_path == "/tmp/test"
        assert monitor.backend_config == {"type": "local"}
    
    @patch('python_terraform.Terraform')
    async def test_get_current_state(self, mock_terraform_class):
        """Test getting current Terraform state"""
        # Mock terraform instance
        mock_terraform = Mock()
        mock_terraform.cmd.return_value = (0, "resource1\nresource2", "")
        mock_terraform_class.return_value = mock_terraform
        
        monitor = TerraformStateMonitor("/tmp/test", {})
        
        # Mock the state show calls
        mock_terraform.cmd.side_effect = [
            (0, "resource1\nresource2", ""),  # state list
            (0, "resource1 state data", ""),  # state show resource1
            (0, "resource2 state data", "")   # state show resource2
        ]
        
        state = await monitor.get_current_state()
        
        assert "resource1" in state
        assert "resource2" in state
        assert state["resource1"] == "resource1 state data"
        assert state["resource2"] == "resource2 state data"
    
    @patch('python_terraform.Terraform')
    async def test_detect_drift_no_changes(self, mock_terraform_class):
        """Test drift detection when no changes exist"""
        mock_terraform = Mock()
        mock_terraform.plan.return_value = (0, "No changes", "")
        mock_terraform_class.return_value = mock_terraform
        
        monitor = TerraformStateMonitor("/tmp/test", {})
        drift_info = await monitor.detect_drift()
        
        assert drift_info["drift_detected"] is False
        assert drift_info["return_code"] == 0
    
    @patch('python_terraform.Terraform')
    async def test_detect_drift_with_changes(self, mock_terraform_class):
        """Test drift detection when changes exist"""
        mock_terraform = Mock()
        plan_output = """
        # aws_instance.example will be modified
        ~ resource "aws_instance" "example" {
            ~ instance_type = "t2.micro" -> "t2.small"
        }
        """
        mock_terraform.plan.return_value = (2, plan_output, "")
        mock_terraform_class.return_value = mock_terraform
        
        monitor = TerraformStateMonitor("/tmp/test", {})
        drift_info = await monitor.detect_drift()
        
        assert drift_info["drift_detected"] is True
        assert drift_info["return_code"] == 2
        assert len(drift_info["changes"]) > 0


class TestDriftPredictionModel:
    """Tests for DriftPredictionModel"""
    
    def test_init(self):
        """Test model initialization"""
        model = DriftPredictionModel("/tmp/test_model.joblib")
        assert model.model_path == "/tmp/test_model.joblib"
        assert model.model is None
        assert model.scaler is None
    
    def test_predict_drift_probability_no_model(self):
        """Test prediction when no model is loaded"""
        model = DriftPredictionModel("/tmp/nonexistent_model.joblib")
        
        features = {
            'resource_count': 10.0,
            'last_apply_hours_ago': 24.0,
            'config_changes_count': 2.0,
            'external_changes_count': 1.0,
            'avg_drift_frequency': 0.3,
            'resource_complexity': 2.0
        }
        
        # Should return default probability when model loading fails
        probability = model.predict_drift_probability(features)
        assert 0.0 <= probability <= 1.0


class TestTerraformAgent:
    """Tests for TerraformAgent"""
    
    @pytest.mark.asyncio
    async def test_initialization(self, terraform_agent, terraform_config):
        """Test agent initialization"""
        await terraform_agent.initialize(terraform_config)
        
        assert terraform_agent.config == terraform_config
        assert terraform_agent.workspace_path == "/tmp/terraform-test"
        assert terraform_agent.drift_check_interval == 60
        assert terraform_agent.auto_apply_threshold == 0.8
    
    @pytest.mark.asyncio
    async def test_start_stop(self, terraform_agent, terraform_config):
        """Test agent start and stop"""
        await terraform_agent.initialize(terraform_config)
        
        # Mock the drift monitoring loop to avoid actual monitoring
        with patch.object(terraform_agent, '_drift_monitoring_loop') as mock_loop:
            mock_loop.return_value = asyncio.create_task(asyncio.sleep(0.1))
            
            await terraform_agent.start()
            assert terraform_agent.is_running is True
            
            await terraform_agent.stop()
            assert terraform_agent.is_running is False
    
    @pytest.mark.asyncio
    async def test_process_drift_event(self, terraform_agent, terraform_config, mock_services):
        """Test processing infrastructure drift event"""
        await terraform_agent.initialize(terraform_config)
        
        # Start the agent so it can process events
        with patch.object(terraform_agent, '_drift_monitoring_loop') as mock_loop:
            mock_loop.return_value = asyncio.create_task(asyncio.sleep(0.1))
            await terraform_agent.start()
        
        # Create a drift event
        drift_event = SystemEvent(
            id="drift-event-1",
            type=EventType.INFRASTRUCTURE_DRIFT,
            source="terraform-monitor",
            severity="medium",
            data={
                "drift_detected": True,
                "changes": [
                    {
                        "resource": "aws_instance.example",
                        "action": "modified",
                        "details": ["~ instance_type = t2.micro -> t2.small"]
                    }
                ]
            }
        )
        
        # Mock the drift prediction
        with patch.object(terraform_agent, '_predict_drift_correction_success', return_value=0.6):
            action = await terraform_agent.process_event(drift_event)
        
        await terraform_agent.stop()
        
        assert action is not None
        assert action.agent_id == terraform_agent.agent_id
        assert action.type == ActionType.TERRAFORM_PLAN  # Should generate plan for medium confidence
        assert "aws_instance.example" in action.target_resources
    
    @pytest.mark.asyncio
    async def test_execute_terraform_plan(self, terraform_agent, terraform_config):
        """Test executing Terraform plan action"""
        await terraform_agent.initialize(terraform_config)
        
        # Start the agent so it can execute actions
        with patch.object(terraform_agent, '_drift_monitoring_loop') as mock_loop:
            mock_loop.return_value = asyncio.create_task(asyncio.sleep(0.1))
            await terraform_agent.start()
        
        # Mock the state monitor
        mock_drift_info = {
            "drift_detected": True,
            "plan_output": "Plan: 1 to change, 0 to add, 0 to destroy",
            "changes": [{"resource": "aws_instance.example", "action": "modified"}]
        }
        
        with patch.object(terraform_agent.state_monitor, 'detect_drift', return_value=mock_drift_info):
            from src.core.interfaces import AgentAction
            
            action = AgentAction(
                id="plan-action-1",
                agent_id=terraform_agent.agent_id,
                type=ActionType.TERRAFORM_PLAN,
                description="Generate plan for drift",
                target_resources=["aws_instance.example"],
                risk_level=RiskLevel.MEDIUM,
                estimated_impact="Modify 1 resource"
            )
            
            result = await terraform_agent.execute_action(action)
            
            await terraform_agent.stop()
            
            assert result.success is True
            assert "plan_id" in result.data
            assert result.data["plan_output"] == mock_drift_info["plan_output"]
    
    @pytest.mark.asyncio
    async def test_execute_terraform_apply_local(self, terraform_agent, terraform_config):
        """Test executing local Terraform apply action"""
        await terraform_agent.initialize(terraform_config)
        
        # Start the agent so it can execute actions
        with patch.object(terraform_agent, '_drift_monitoring_loop') as mock_loop:
            mock_loop.return_value = asyncio.create_task(asyncio.sleep(0.1))
            await terraform_agent.start()
        
        # Mock successful terraform apply
        with patch.object(terraform_agent.state_monitor.terraform, 'apply', return_value=(0, "Apply complete", "")):
            with patch.object(terraform_agent.state_monitor, 'detect_drift', return_value={"drift_detected": False}):
                from src.core.interfaces import AgentAction
                
                action = AgentAction(
                    id="apply-action-1",
                    agent_id=terraform_agent.agent_id,
                    type=ActionType.TERRAFORM_APPLY,
                    description="Apply drift corrections",
                    target_resources=["aws_instance.example"],
                    risk_level=RiskLevel.LOW,
                    estimated_impact="Modify 1 resource"
                )
                
                result = await terraform_agent.execute_action(action)
                
                await terraform_agent.stop()
                
                assert result.success is True
                assert "apply_output" in result.data
                assert result.data["post_apply_drift_detected"] is False
    
    @pytest.mark.asyncio
    async def test_drift_monitoring_loop(self, terraform_agent, terraform_config, mock_services):
        """Test the drift monitoring background loop"""
        await terraform_agent.initialize(terraform_config)
        
        # Mock drift detection
        mock_drift_info = {
            "drift_detected": True,
            "changes": [{"resource": "test", "action": "modified"}]
        }
        
        with patch.object(terraform_agent.state_monitor, 'detect_drift', return_value=mock_drift_info):
            # Start the agent to begin monitoring
            await terraform_agent.start()
            
            # Wait a short time for the monitoring loop to run
            await asyncio.sleep(0.1)
            
            # Stop the agent
            await terraform_agent.stop()
            
            # Check that drift was detected and event was published
            assert len(mock_services['event_bus'].published_events) > 0
            published_event = mock_services['event_bus'].published_events[0]
            assert published_event.type == EventType.INFRASTRUCTURE_DRIFT
    
    def test_assess_drift_severity(self, terraform_agent):
        """Test drift severity assessment"""
        # Test critical severity (destructive changes)
        drift_info = {
            "changes": [
                {"action": "destroyed", "resource": "test1"},
                {"action": "modified", "resource": "test2"}
            ]
        }
        severity = terraform_agent._assess_drift_severity(drift_info)
        assert severity == "critical"
        
        # Test high severity (many creates/modifies)
        drift_info = {
            "changes": [
                {"action": "created", "resource": f"test{i}"} for i in range(6)
            ]
        }
        severity = terraform_agent._assess_drift_severity(drift_info)
        assert severity == "high"
        
        # Test low severity (few changes)
        drift_info = {
            "changes": [
                {"action": "modified", "resource": "test1"}
            ]
        }
        severity = terraform_agent._assess_drift_severity(drift_info)
        assert severity == "low"
    
    def test_extract_drift_features(self, terraform_agent):
        """Test feature extraction for ML model"""
        drift_info = {
            "changes": [
                {"resource": "test1", "action": "modified"},
                {"resource": "test2", "action": "created"},
                {"resource": "test3", "action": "destroyed"}
            ]
        }
        
        features = terraform_agent._extract_drift_features(drift_info)
        
        assert features['resource_count'] == 3.0
        assert features['config_changes_count'] == 1.0  # 1 modified
        assert features['external_changes_count'] == 2.0  # 1 created + 1 destroyed
        assert 'avg_drift_frequency' in features
        assert 'resource_complexity' in features
    
    def test_get_subscribed_event_types(self, terraform_agent):
        """Test that agent subscribes to correct event types"""
        event_types = terraform_agent._get_subscribed_event_types()
        assert EventType.INFRASTRUCTURE_DRIFT in event_types


if __name__ == "__main__":
    pytest.main([__file__])