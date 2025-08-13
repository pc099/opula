"""
Unit tests for the Cost Optimization Agent
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

from src.agents.cost_optimization_agent import (
    CostOptimizationAgent, CloudResourceMonitor, CostOptimizationEngine,
    CostForecastingModel, ResourceUtilization, CostOptimizationRecommendation,
    OptimizationType, CloudProvider
)
from src.core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, AgentType, AutomationLevel, Integration
)


@pytest.fixture
def mock_event_bus():
    """Mock event bus"""
    mock = Mock()
    mock.publish_event = AsyncMock()
    mock.subscribe_to_events = AsyncMock()
    mock.publish_action = AsyncMock()
    return mock


@pytest.fixture
def mock_config_service():
    """Mock configuration service"""
    mock = Mock()
    mock.load_config = AsyncMock()
    mock.save_config = AsyncMock()
    mock.watch_config_changes = AsyncMock()
    return mock


@pytest.fixture
def mock_audit_service():
    """Mock audit service"""
    mock = Mock()
    mock.log_action = AsyncMock()
    mock.log_event = AsyncMock()
    mock.log_health_status = AsyncMock()
    return mock


@pytest.fixture
def sample_agent_config():
    """Sample agent configuration"""
    return AgentConfig(
        id="cost-optimization-agent-1",
        name="Cost Optimization Agent",
        type=AgentType.COST_OPTIMIZATION,
        enabled=True,
        automation_level=AutomationLevel.SEMI_AUTO,
        thresholds={
            "monitoring_interval": 3600,
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
                                "secret_access_key": "test_secret",
                                "region": "us-east-1"
                            }
                        }
                    ],
                    "budget_limits": {
                        "production": 20000.0,
                        "development": 5000.0
                    }
                }
            )
        ]
    )


@pytest.fixture
def sample_utilization_data():
    """Sample resource utilization data"""
    return [
        ResourceUtilization(
            resource_id="i-1234567890abcdef0",
            resource_type="ec2.instance",
            provider=CloudProvider.AWS,
            cpu_utilization=15.5,
            memory_utilization=25.3,
            network_utilization=8.2,
            storage_utilization=45.0,
            cost_per_hour=0.096,
            timestamp=datetime.utcnow()
        ),
        ResourceUtilization(
            resource_id="i-0987654321fedcba0",
            resource_type="ec2.instance",
            provider=CloudProvider.AWS,
            cpu_utilization=85.2,
            memory_utilization=78.9,
            network_utilization=65.4,
            storage_utilization=82.1,
            cost_per_hour=0.192,
            timestamp=datetime.utcnow()
        )
    ]


class TestCloudResourceMonitor:
    """Test CloudResourceMonitor class"""
    
    def test_init(self):
        """Test CloudResourceMonitor initialization"""
        credentials = {"access_key_id": "test", "secret_access_key": "test"}
        monitor = CloudResourceMonitor(CloudProvider.AWS, credentials)
        
        assert monitor.provider == CloudProvider.AWS
        assert monitor.credentials == credentials
        assert monitor.logger is not None
    
    @pytest.mark.asyncio
    async def test_get_resource_utilization_aws(self):
        """Test getting AWS resource utilization"""
        credentials = {"access_key_id": "test", "secret_access_key": "test"}
        monitor = CloudResourceMonitor(CloudProvider.AWS, credentials)
        
        utilization_data = await monitor.get_resource_utilization(24)
        
        assert isinstance(utilization_data, list)
        assert len(utilization_data) >= 0  # Mock data may return empty or sample data
    
    @pytest.mark.asyncio
    async def test_get_cost_data_aws(self):
        """Test getting AWS cost data"""
        credentials = {"access_key_id": "test", "secret_access_key": "test"}
        monitor = CloudResourceMonitor(CloudProvider.AWS, credentials)
        
        cost_data = await monitor.get_cost_data(30)
        
        assert isinstance(cost_data, dict)


class TestCostOptimizationEngine:
    """Test CostOptimizationEngine class"""
    
    def test_init(self):
        """Test CostOptimizationEngine initialization"""
        engine = CostOptimizationEngine()
        
        assert engine.utilization_threshold_low == 20.0
        assert engine.utilization_threshold_high == 80.0
        assert engine.logger is not None
    
    @pytest.mark.asyncio
    async def test_analyze_utilization(self, sample_utilization_data):
        """Test utilization analysis"""
        engine = CostOptimizationEngine()
        
        recommendations = await engine.analyze_utilization(sample_utilization_data)
        
        assert isinstance(recommendations, list)
        # Should generate recommendations for underutilized resources
        assert len(recommendations) > 0
        
        # Check recommendation structure
        for rec in recommendations:
            assert isinstance(rec, CostOptimizationRecommendation)
            assert rec.id is not None
            assert rec.type in OptimizationType
            assert rec.potential_savings > 0
            assert 0 <= rec.confidence <= 1
            assert rec.risk_level in RiskLevel


class TestCostForecastingModel:
    """Test CostForecastingModel class"""
    
    def test_init(self):
        """Test CostForecastingModel initialization"""
        model = CostForecastingModel()
        
        assert model.model_path == "cost_forecasting_model.joblib"
        assert model.feature_columns is not None
        assert len(model.feature_columns) > 0
    
    def test_forecast_costs(self):
        """Test cost forecasting"""
        model = CostForecastingModel()
        
        current_data = {
            'daily_cost': 500.0,
            'cpu_utilization_avg': 50.0,
            'memory_utilization_avg': 60.0,
            'resource_count': 20
        }
        
        forecasts = model.forecast_costs(current_data, days_ahead=7)
        
        assert isinstance(forecasts, list)
        assert len(forecasts) == 7
        
        for forecast in forecasts:
            assert 'date' in forecast
            assert 'predicted_cost' in forecast
            assert 'confidence' in forecast
            assert forecast['predicted_cost'] > 0
    
    def test_check_budget_alerts(self):
        """Test budget alert checking"""
        model = CostForecastingModel()
        
        current_spend = 8000.0
        budget = 10000.0
        forecasted_costs = [
            {'predicted_cost': 100.0} for _ in range(30)
        ]
        
        alerts = model.check_budget_alerts(current_spend, budget, forecasted_costs)
        
        assert isinstance(alerts, list)
        # Should generate alerts if projected spend exceeds thresholds
        if alerts:
            for alert in alerts:
                assert 'level' in alert
                assert 'message' in alert
                assert 'current_spend' in alert
                assert 'projected_spend' in alert


class TestCostOptimizationAgent:
    """Test CostOptimizationAgent class"""
    
    @pytest.mark.asyncio
    async def test_init(self, mock_event_bus, mock_config_service, mock_audit_service):
        """Test agent initialization"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        assert agent.agent_id == "cost-optimization-agent-1"
        assert agent.event_bus == mock_event_bus
        assert agent.config_service == mock_config_service
        assert agent.audit_service == mock_audit_service
        assert agent.resource_monitors == {}
        assert agent.optimization_engine is None
        assert agent.forecasting_model is None
    
    @pytest.mark.asyncio
    async def test_initialize_agent_specific(self, mock_event_bus, mock_config_service, 
                                           mock_audit_service, sample_agent_config):
        """Test agent-specific initialization"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        assert agent.config == sample_agent_config
        assert len(agent.resource_monitors) > 0
        assert agent.optimization_engine is not None
        assert agent.forecasting_model is not None
        assert CloudProvider.AWS in agent.resource_monitors
    
    @pytest.mark.asyncio
    async def test_process_cost_threshold_event(self, mock_event_bus, mock_config_service,
                                              mock_audit_service, sample_agent_config):
        """Test processing cost threshold exceeded event"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        # Create a cost threshold event
        event = SystemEvent(
            id="cost_threshold_event_1",
            type=EventType.COST_THRESHOLD_EXCEEDED,
            source="cost_monitor",
            severity="high",
            data={
                "recommendation": {
                    "id": "rec_1",
                    "title": "Right-size instances",
                    "confidence": 0.85,
                    "risk_level": "low",
                    "potential_savings": 1500.0,
                    "affected_resources": ["i-1234567890abcdef0"]
                }
            }
        )
        
        action = await agent._process_event_specific(event)
        
        assert action is not None
        assert action.type == ActionType.COST_OPTIMIZE
        assert action.agent_id == agent.agent_id
        assert action.risk_level == RiskLevel.LOW
        assert len(action.target_resources) > 0
    
    @pytest.mark.asyncio
    async def test_execute_cost_optimization_action(self, mock_event_bus, mock_config_service,
                                                  mock_audit_service, sample_agent_config):
        """Test executing cost optimization action"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        # Add a mock recommendation
        recommendation = CostOptimizationRecommendation(
            id="rec_1",
            type=OptimizationType.RIGHT_SIZING,
            title="Right-size instances",
            description="Downsize over-provisioned instances",
            potential_savings=1500.0,
            confidence=0.85,
            risk_level=RiskLevel.LOW,
            affected_resources=["i-1234567890abcdef0"],
            implementation_steps=["Stop instance", "Change type", "Start instance"],
            estimated_duration="30 minutes",
            rollback_possible=True,
            priority="high",
            created_at=datetime.utcnow()
        )
        
        agent.active_recommendations = [recommendation]
        
        # Create action
        action = AgentAction(
            id="action_1",
            agent_id=agent.agent_id,
            type=ActionType.COST_OPTIMIZE,
            description="Apply cost optimization",
            target_resources=["i-1234567890abcdef0"],
            risk_level=RiskLevel.LOW,
            estimated_impact="$1500 savings",
            metadata={"recommendation_id": "rec_1"}
        )
        
        result = await agent._execute_action_specific(action)
        
        assert result.success is True
        assert "right-sized" in result.message.lower()
        assert result.data is not None
        assert "resized_resources" in result.data
    
    @pytest.mark.asyncio
    async def test_execute_resource_cleanup_action(self, mock_event_bus, mock_config_service,
                                                 mock_audit_service, sample_agent_config):
        """Test executing resource cleanup action"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        # Create cleanup action
        action = AgentAction(
            id="cleanup_action_1",
            agent_id=agent.agent_id,
            type=ActionType.RESOURCE_CLEANUP,
            description="Clean up unused resources",
            target_resources=["i-unused1", "i-unused2"],
            risk_level=RiskLevel.MEDIUM,
            estimated_impact="Remove unused resources",
            metadata={}
        )
        
        result = await agent._execute_action_specific(action)
        
        assert result.success is True
        assert "cleaned up" in result.message.lower()
        assert result.data is not None
        assert "cleaned_resources" in result.data
        assert len(result.data["cleaned_resources"]) == 2
    
    def test_get_subscribed_event_types(self, mock_event_bus, mock_config_service, mock_audit_service):
        """Test getting subscribed event types"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        event_types = agent._get_subscribed_event_types()
        
        assert EventType.COST_THRESHOLD_EXCEEDED in event_types
        assert EventType.RESOURCE_ANOMALY in event_types
    
    def test_assess_recommendation_severity(self, mock_event_bus, mock_config_service, mock_audit_service):
        """Test assessing recommendation severity"""
        agent = CostOptimizationAgent(
            "cost-optimization-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
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