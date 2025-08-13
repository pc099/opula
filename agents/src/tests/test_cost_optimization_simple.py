"""
Simple tests for the Cost Optimization Agent
"""
import pytest
import asyncio
from datetime import datetime
from unittest.mock import Mock, AsyncMock

from src.agents.cost_optimization_agent import (
    CostOptimizationAgent, OptimizationType, CloudProvider,
    CostOptimizationRecommendation
)
from src.core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, AgentType, AutomationLevel, Integration
)


@pytest.fixture
def mock_services():
    """Mock services for testing"""
    event_bus = Mock()
    event_bus.publish_event = AsyncMock()
    event_bus.subscribe_to_events = AsyncMock()
    event_bus.publish_action = AsyncMock()
    
    config_service = Mock()
    config_service.load_config = AsyncMock()
    config_service.save_config = AsyncMock()
    config_service.watch_config_changes = AsyncMock()
    
    audit_service = Mock()
    audit_service.log_action = AsyncMock()
    audit_service.log_event = AsyncMock()
    audit_service.log_health_status = AsyncMock()
    
    return {
        'event_bus': event_bus,
        'config_service': config_service,
        'audit_service': audit_service
    }


@pytest.fixture
def sample_config():
    """Sample agent configuration"""
    return AgentConfig(
        id="cost-optimization-test",
        name="Cost Optimization Test Agent",
        type=AgentType.COST_OPTIMIZATION,
        enabled=True,
        automation_level=AutomationLevel.SEMI_AUTO,
        thresholds={
            "monitoring_interval": 10,
            "optimization_threshold": 100.0,
            "auto_apply_threshold": 0.9
        },
        approval_required=True,
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
                                "secret_access_key": "test_secret"
                            }
                        }
                    ]
                }
            )
        ]
    )


class TestCostOptimizationAgent:
    """Test Cost Optimization Agent"""
    
    def test_agent_initialization(self, mock_services):
        """Test agent initialization"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        assert agent.agent_id == "cost-optimization-test"
        assert agent.monitoring_interval == 3600
        assert agent.optimization_threshold == 100.0
        assert agent.auto_apply_threshold == 0.9
        assert agent.active_recommendations == []
    
    @pytest.mark.asyncio
    async def test_agent_lifecycle(self, mock_services, sample_config):
        """Test agent lifecycle (initialize, start, stop)"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        # Initialize
        await agent.initialize(sample_config)
        assert agent.config == sample_config
        assert agent.monitoring_interval == 10  # From config
        
        # Start
        await agent.start()
        assert agent.is_running is True
        
        # Stop
        await agent.stop()
        assert agent.is_running is False
    
    @pytest.mark.asyncio
    async def test_cost_threshold_event_processing(self, mock_services, sample_config):
        """Test processing cost threshold events"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        
        # Create cost threshold event
        event = SystemEvent(
            id="cost_threshold_test",
            type=EventType.COST_THRESHOLD_EXCEEDED,
            source="test_monitor",
            severity="high",
            data={
                "recommendation": {
                    "id": "rec_1",
                    "title": "Test Optimization",
                    "confidence": 0.85,
                    "risk_level": "low",
                    "potential_savings": 500.0,
                    "affected_resources": ["test-resource-1"]
                }
            }
        )
        
        # Process event
        action = await agent._process_event_specific(event)
        
        # Verify action was created
        assert action is not None
        assert action.type == ActionType.COST_OPTIMIZE
        assert action.agent_id == agent.agent_id
        assert action.risk_level == RiskLevel.LOW
        assert len(action.target_resources) == 1
    
    @pytest.mark.asyncio
    async def test_resource_cleanup_execution(self, mock_services, sample_config):
        """Test resource cleanup execution"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        
        # Create cleanup action
        action = AgentAction(
            id="cleanup_test",
            agent_id=agent.agent_id,
            type=ActionType.RESOURCE_CLEANUP,
            description="Test cleanup",
            target_resources=["resource-1", "resource-2"],
            risk_level=RiskLevel.MEDIUM,
            estimated_impact="Test cleanup",
            metadata={}
        )
        
        # Execute action
        result = await agent._execute_action_specific(action)
        
        # Verify execution
        assert result.success is True
        assert "cleaned up" in result.message.lower()
        assert result.data["total_cleaned"] == 2
    
    @pytest.mark.asyncio
    async def test_cost_optimization_execution(self, mock_services, sample_config):
        """Test cost optimization execution"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        await agent.initialize(sample_config)
        
        # Add a mock recommendation
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
        
        # Create optimization action
        action = AgentAction(
            id="optimization_test",
            agent_id=agent.agent_id,
            type=ActionType.COST_OPTIMIZE,
            description="Test optimization",
            target_resources=["test-resource-1"],
            risk_level=RiskLevel.LOW,
            estimated_impact="$500 savings",
            metadata={"recommendation_id": "test_rec_1"}
        )
        
        # Execute action
        result = await agent._execute_action_specific(action)
        
        # Verify execution
        assert result.success is True
        assert "right-sized" in result.message.lower()
        assert result.data["total_savings"] == 50.0
    
    def test_get_subscribed_event_types(self, mock_services):
        """Test getting subscribed event types"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        event_types = agent._get_subscribed_event_types()
        
        assert EventType.COST_THRESHOLD_EXCEEDED in event_types
        assert EventType.RESOURCE_ANOMALY in event_types
    
    def test_assess_recommendation_severity(self, mock_services):
        """Test assessing recommendation severity"""
        agent = CostOptimizationAgent(
            "cost-optimization-test",
            mock_services['event_bus'],
            mock_services['config_service'],
            mock_services['audit_service']
        )
        
        # Test different savings amounts
        high_savings_rec = CostOptimizationRecommendation(
            id="rec_high",
            type=OptimizationType.RIGHT_SIZING,
            title="High savings",
            description="Test",
            potential_savings=6000.0,
            confidence=0.9,
            risk_level=RiskLevel.LOW,
            affected_resources=[],
            implementation_steps=[],
            estimated_duration="",
            rollback_possible=True,
            priority="high",
            created_at=datetime.utcnow()
        )
        
        low_savings_rec = CostOptimizationRecommendation(
            id="rec_low",
            type=OptimizationType.STORAGE_OPTIMIZATION,
            title="Low savings",
            description="Test",
            potential_savings=200.0,
            confidence=0.7,
            risk_level=RiskLevel.LOW,
            affected_resources=[],
            implementation_steps=[],
            estimated_duration="",
            rollback_possible=True,
            priority="low",
            created_at=datetime.utcnow()
        )
        
        assert agent._assess_recommendation_severity(high_savings_rec) == "critical"
        assert agent._assess_recommendation_severity(low_savings_rec) == "low"


if __name__ == "__main__":
    pytest.main([__file__])