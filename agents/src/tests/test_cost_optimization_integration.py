"""
Integration tests for the Cost Optimization Agent
"""
import pytest
import asyncio
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from src.agents.cost_optimization_agent import (
    CostOptimizationAgent, CloudResourceMonitor, CostOptimizationEngine,
    CostForecastingModel, OptimizationType, CloudProvider
)
from src.core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, AgentType, AutomationLevel, Integration
)


class MockEventBus:
    """Mock event bus for integration testing"""
    
    def __init__(self):
        self.published_events = []
        self.published_actions = []
        self.subscribers = {}
    
    async def publish_event(self, event):
        self.published_events.append(event)
    
    async def publish_action(self, action):
        self.published_actions.append(action)
    
    async def subscribe_to_events(self, event_types, callback):
        for event_type in event_types:
            if event_type not in self.subscribers:
                self.subscribers[event_type] = []
            self.subscribers[event_type].append(callback)


class MockConfigService:
    """Mock configuration service for integration testing"""
    
    def __init__(self):
        self.configs = {}
    
    async def load_config(self, agent_id):
        return self.configs.get(agent_id)
    
    async def save_config(self, config):
        self.configs[config.id] = config
    
    async def watch_config_changes(self, agent_id, callback):
        # Mock implementation - no actual watching
        pass


class MockAuditService:
    """Mock audit service for integration testing"""
    
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
def integration_config():
    """Configuration for integration testing"""
    return AgentConfig(
        id="cost-optimization-integration-test",
        name="Cost Optimization Integration Test Agent",
        type=AgentType.COST_OPTIMIZATION,
        enabled=True,
        automation_level=AutomationLevel.FULL_AUTO,
        thresholds={
            "monitoring_interval": 10,  # Short interval for testing
            "optimization_threshold": 50.0,
            "auto_apply_threshold": 0.8
        },
        approval_required=False,
        integrations=[
            Integration(
                name="cost_optimization",
                type="cost_optimization",
                enabled=True,
                config={
                    "providers": [
                        {
                            "name": "aws",
                            "credentials": {
                                "access_key_id": "test_key",
                                "secret_access_key": "test_secret",
                                "region": "us-east-1"
                            }
                        }
                    ],
                    "budget_limits": {
                        "test_budget": 1000.0
                    },
                    "forecasting_model_path": "./test_cost_model.joblib"
                }
            )
        ]
    )


@pytest.fixture
def mock_services():
    """Mock services for integration testing"""
    return {
        'event_bus': MockEventBus(),
        'config_service': MockConfigService(),
        'audit_service': MockAuditService()
    }


class TestCostOptimizationAgentIntegration:
    """Integration tests for Cost Optimization Agent"""
    
    @pytest.mark.asyncio
    async def test_full_agent_lifecycle(self, integration_config, mock_services):
        """Test complete agent lifecycle"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        # Initialize agent
        await agent.initialize(integration_config)
        assert agent.config == integration_config
        assert agent.optimization_engine is not None
        assert agent.forecasting_model is not None
        
        # Start agent
        await agent.start()
        assert agent.is_running is True
        
        # Test health status
        health = await agent.get_health_status()
        assert health.status.value in ['healthy', 'degraded', 'unhealthy', 'offline']
        
        # Stop agent
        await agent.stop()
        assert agent.is_running is False
    
    @pytest.mark.asyncio
    async def test_cost_threshold_event_processing(self, integration_config, mock_services):
        """Test processing of cost threshold events"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(integration_config)
        await agent.start()
        
        # Create cost threshold event
        event = SystemEvent(
            id="cost_threshold_integration_test",
            type=EventType.COST_THRESHOLD_EXCEEDED,
            source="test_monitor",
            severity="high",
            data={
                "recommendation": {
                    "id": "integration_rec_1",
                    "title": "Integration Test Optimization",
                    "confidence": 0.9,
                    "risk_level": "low",
                    "potential_savings": 500.0,
                    "affected_resources": ["test-resource-1", "test-resource-2"]
                }
            }
        )
        
        # Process event
        action = await agent.process_event(event)
        
        # Verify action was created
        assert action is not None
        assert action.type == ActionType.COST_OPTIMIZE
        assert action.agent_id == agent.agent_id
        
        # Verify event was logged
        assert len(mock_services['audit_service'].logged_events) > 0
        
        await agent.stop()
    
    @pytest.mark.asyncio
    async def test_automated_optimization_execution(self, integration_config, mock_services):
        """Test automated optimization execution"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(integration_config)
        await agent.start()
        
        # Create and execute optimization action
        action = AgentAction(
            id="integration_optimization_action",
            agent_id=agent.agent_id,
            type=ActionType.COST_OPTIMIZE,
            description="Integration test optimization",
            target_resources=["test-resource-1"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test optimization",
            metadata={
                "recommendation_id": "test_rec_1",
                "auto_apply": True
            }
        )
        
        # Mock recommendation
        from src.agents.cost_optimization_agent import CostOptimizationRecommendation
        recommendation = CostOptimizationRecommendation(
            id="test_rec_1",
            type=OptimizationType.RIGHT_SIZING,
            title="Test Right-sizing",
            description="Test optimization",
            potential_savings=500.0,
            confidence=0.9,
            risk_level=RiskLevel.LOW,
            affected_resources=["test-resource-1"],
            implementation_steps=["Test step"],
            estimated_duration="5 minutes",
            rollback_possible=True,
            priority="high",
            created_at=datetime.utcnow()
        )
        
        agent.active_recommendations = [recommendation]
        
        # Execute action
        result = await agent.execute_action(action)
        
        # Verify execution
        assert result.success is True
        assert result.data is not None
        
        # Verify action was logged
        assert len(mock_services['audit_service'].logged_actions) > 0
        
        await agent.stop()
    
    @pytest.mark.asyncio
    async def test_resource_cleanup_workflow(self, integration_config, mock_services):
        """Test resource cleanup workflow"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(integration_config)
        await agent.start()
        
        # Create resource anomaly event
        event = SystemEvent(
            id="resource_anomaly_integration_test",
            type=EventType.RESOURCE_ANOMALY,
            source="anomaly_detector",
            severity="medium",
            data={
                "anomaly_type": "low_utilization",
                "affected_resources": ["unused-resource-1", "unused-resource-2"],
                "utilization_metrics": {
                    "cpu": 2.5,
                    "memory": 5.0,
                    "network": 1.0
                }
            }
        )
        
        # Process event
        action = await agent.process_event(event)
        
        # Verify cleanup action was created
        assert action is not None
        assert action.type == ActionType.RESOURCE_CLEANUP
        assert len(action.target_resources) == 2
        
        # Execute cleanup action
        result = await agent.execute_action(action)
        
        # Verify cleanup was successful
        assert result.success is True
        assert "cleaned up" in result.message.lower()
        assert result.data["total_cleaned"] == 2
        
        await agent.stop()
    
    @pytest.mark.asyncio
    async def test_budget_alert_generation(self, integration_config, mock_services):
        """Test budget alert generation"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(integration_config)
        
        # Mock cost history that would trigger budget alerts
        agent.cost_history = [
            {
                'date': datetime.utcnow().strftime('%Y-%m-%d'),
                'actual_cost': 900.0,  # High cost that should trigger alert
                'forecasts': [
                    {'predicted_cost': 50.0} for _ in range(30)
                ],
                'timestamp': datetime.utcnow()
            }
        ]
        
        # Trigger budget alert check
        await agent._check_budget_alerts()
        
        # Verify budget alert events were published
        budget_events = [
            event for event in mock_services['event_bus'].published_events
            if event.type == EventType.COST_THRESHOLD_EXCEEDED and 
               "budget_alert" in event.data
        ]
        
        assert len(budget_events) > 0
        
        # Verify alert data
        alert_event = budget_events[0]
        assert "budget_alert" in alert_event.data
        assert alert_event.data["budget_alert"]["budget_name"] == "test_budget"
    
    @pytest.mark.asyncio
    async def test_error_handling_and_recovery(self, integration_config, mock_services):
        """Test error handling and recovery"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(integration_config)
        await agent.start()
        
        # Test handling of invalid action
        invalid_action = AgentAction(
            id="invalid_action",
            agent_id=agent.agent_id,
            type=ActionType.COST_OPTIMIZE,
            description="Invalid action",
            target_resources=[],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test",
            metadata={"recommendation_id": "nonexistent_rec"}
        )
        
        # Execute invalid action
        result = await agent.execute_action(invalid_action)
        
        # Verify error handling
        assert result.success is False
        assert "not found" in result.message.lower()
        
        # Verify agent is still functional
        health = await agent.get_health_status()
        assert health.status.value in ['healthy', 'degraded', 'unhealthy']
        
        await agent.stop()
    
    @pytest.mark.asyncio
    async def test_configuration_reload(self, integration_config, mock_services):
        """Test configuration reload functionality"""
        agent = CostOptimizationAgent(
            "cost-optimization-integration-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(integration_config)
        
        # Modify configuration
        new_config = integration_config.copy()
        new_config.thresholds["optimization_threshold"] = 200.0
        
        # Reload configuration
        await agent.reload_config(new_config)
        
        # Verify configuration was updated
        assert agent.config.thresholds["optimization_threshold"] == 200.0
        assert agent.optimization_threshold == 200.0


if __name__ == "__main__":
    pytest.main([__file__])