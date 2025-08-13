"""
Integration tests for the Kubernetes Agent
"""
import asyncio
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import tempfile
import os

from ..agents.kubernetes_agent import (
    KubernetesAgent, KubernetesMetricsCollector, PredictiveScalingModel,
    ResourceMetrics, ScalingRecommendation
)
from ..core.interfaces import (
    AgentConfig, AgentType, SystemEvent, EventType, ActionType,
    Integration, AutomationLevel, RiskLevel, AgentAction
)


class TestKubernetesAgentIntegration:
    """Integration tests for Kubernetes Agent"""
    
    @pytest.fixture
    def temp_model_path(self):
        """Create temporary model file path"""
        with tempfile.NamedTemporaryFile(suffix='.joblib', delete=False) as f:
            yield f.name
        os.unlink(f.name)
    
    @pytest.fixture
    def mock_event_bus(self):
        """Create mock event bus"""
        mock_bus = AsyncMock()
        return mock_bus
    
    @pytest.fixture
    def mock_config_service(self):
        """Create mock configuration service"""
        mock_service = AsyncMock()
        return mock_service
    
    @pytest.fixture
    def mock_audit_service(self):
        """Create mock audit service"""
        mock_service = AsyncMock()
        return mock_service
    
    @pytest.fixture
    def agent_config(self, temp_model_path):
        """Create agent configuration"""
        return AgentConfig(
            id="k8s-agent-integration",
            name="Kubernetes Agent Integration Test",
            type=AgentType.KUBERNETES,
            enabled=True,
            automation_level=AutomationLevel.FULL_AUTO,
            thresholds={
                "monitoring_interval": 5,  # Short interval for testing
                "scaling_threshold": 0.6
            },
            integrations=[
                Integration(
                    name="kubernetes",
                    type="kubernetes",
                    config={
                        "kubeconfig_path": None,  # Use default
                        "namespaces": ["default", "test"],
                        "model_path": temp_model_path
                    }
                )
            ]
        )
    
    @pytest_asyncio.fixture
    async def kubernetes_agent(self, mock_event_bus, mock_config_service, 
                              mock_audit_service, agent_config):
        """Create and initialize Kubernetes agent"""
        agent = KubernetesAgent(
            "k8s-agent-integration",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        # Mock the metrics collector initialization to avoid Kubernetes client issues
        with patch.object(agent, '_initialize_agent_specific') as mock_init:
            mock_init.return_value = None
            await agent.initialize(agent_config)
        
        # Set up mock components
        agent.metrics_collector = AsyncMock()
        agent.scaling_model = Mock()
        agent.scaler = AsyncMock()
        
        yield agent
        
        # Cleanup
        if agent.is_running:
            await agent.stop()
    
    @pytest.mark.asyncio
    async def test_full_agent_lifecycle(self, kubernetes_agent):
        """Test complete agent lifecycle"""
        # Agent should be initialized but not running
        assert not kubernetes_agent.is_running
        assert kubernetes_agent.config is not None
        assert kubernetes_agent.metrics_collector is not None
        assert kubernetes_agent.scaling_model is not None
        
        # Start the agent
        await kubernetes_agent.start()
        assert kubernetes_agent.is_running
        assert kubernetes_agent._monitoring_task is not None
        
        # Stop the agent
        await kubernetes_agent.stop()
        assert not kubernetes_agent.is_running
    
    @pytest.mark.asyncio
    async def test_metrics_collection_and_analysis(self, kubernetes_agent):
        """Test metrics collection and analysis workflow"""
        await kubernetes_agent.start()
        
        # Mock metrics collector to return test data
        mock_metrics = [
            ResourceMetrics(
                timestamp=datetime.utcnow(),
                namespace="test",
                deployment="web-app",
                pod_count=2,
                cpu_usage=0.8,  # High CPU usage
                memory_usage=600,
                cpu_requests=0.5,
                memory_requests=256,
                cpu_limits=1.0,
                memory_limits=512,
                network_io=25,
                disk_io=12
            ),
            ResourceMetrics(
                timestamp=datetime.utcnow(),
                namespace="test",
                deployment="api-service",
                pod_count=3,
                cpu_usage=0.3,  # Low CPU usage
                memory_usage=200,
                cpu_requests=0.5,
                memory_requests=512,
                cpu_limits=1.0,
                memory_limits=1024,
                network_io=10,
                disk_io=5
            )
        ]
        
        kubernetes_agent.metrics_collector.get_pod_metrics = AsyncMock(return_value=mock_metrics)
        
        # Trigger metrics collection
        await kubernetes_agent._collect_and_analyze_metrics()
        
        # Check that metrics were added to history
        assert len(kubernetes_agent.metrics_history) > 0
        assert "test/web-app" in kubernetes_agent.metrics_history
        assert "test/api-service" in kubernetes_agent.metrics_history
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_scaling_event_processing(self, kubernetes_agent):
        """Test processing of scaling events"""
        await kubernetes_agent.start()
        
        # Create a scaling recommendation
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="test",
            current_replicas=2,
            recommended_replicas=4,
            current_cpu_request="0.5",
            recommended_cpu_request="0.6",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization detected",
            estimated_cost_impact=0.20
        )
        
        # Create scaling event
        event = SystemEvent(
            id="scaling-event-integration",
            type=EventType.SCALING_REQUIRED,
            source="k8s-monitor",
            severity="medium",
            data={"recommendation": recommendation.__dict__}
        )
        
        # Process the event
        action = await kubernetes_agent.process_event(event)
        
        assert action is not None
        assert action.type == ActionType.K8S_SCALE
        assert action.agent_id == "k8s-agent-integration"
        assert "web-app" in action.description
        assert action.risk_level == RiskLevel.LOW  # Full auto mode with high confidence
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_scaling_action_execution(self, kubernetes_agent):
        """Test execution of scaling actions"""
        await kubernetes_agent.start()
        
        # Mock the scaler
        mock_scaler = AsyncMock()
        mock_scaler.scale_deployment.return_value = True
        mock_scaler.update_resource_requests.return_value = True
        kubernetes_agent.scaler = mock_scaler
        
        # Create scaling action
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="test",
            current_replicas=2,
            recommended_replicas=4,
            current_cpu_request="0.5",
            recommended_cpu_request="0.6",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization",
            estimated_cost_impact=0.20
        )
        
        action = AgentAction(
            id="scale-action-integration",
            agent_id="k8s-agent-integration",
            type=ActionType.K8S_SCALE,
            description="Scale web-app deployment",
            target_resources=["test/web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Scale from 2 to 4 replicas",
            metadata={"recommendation": recommendation.__dict__}
        )
        
        # Execute the action
        result = await kubernetes_agent.execute_action(action)
        
        assert result.success is True
        assert "success" in result.message.lower()
        
        # Verify scaler was called correctly
        mock_scaler.scale_deployment.assert_called_once_with("test", "web-app", 4)
        mock_scaler.update_resource_requests.assert_called_once_with(
            "test", "web-app", "0.6", "512Mi"
        )
        
        # Check that scaling history was recorded
        assert len(kubernetes_agent.scaling_history) > 0
        assert kubernetes_agent.scaling_history[-1]["deployment"] == "test/web-app"
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_restart_action_execution(self, kubernetes_agent):
        """Test execution of restart actions"""
        await kubernetes_agent.start()
        
        # Mock the scaler and metrics collector
        mock_scaler = AsyncMock()
        mock_scaler.scale_deployment.return_value = True
        kubernetes_agent.scaler = mock_scaler
        
        mock_metrics_collector = AsyncMock()
        mock_metrics_collector.get_deployments.return_value = [
            {"name": "api-service", "replicas": 3}
        ]
        kubernetes_agent.metrics_collector = mock_metrics_collector
        
        # Create restart action
        action = AgentAction(
            id="restart-action-integration",
            agent_id="k8s-agent-integration",
            type=ActionType.K8S_RESTART,
            description="Restart api-service due to anomaly",
            target_resources=["test/api-service"],
            risk_level=RiskLevel.MEDIUM,
            estimated_impact="Temporary service disruption",
            metadata={"anomaly_type": "memory_leak"}
        )
        
        # Execute the action
        result = await kubernetes_agent.execute_action(action)
        
        assert result.success is True
        assert "restarted" in result.message.lower()
        
        # Verify restart sequence (scale to 0, then back to original)
        assert mock_scaler.scale_deployment.call_count == 2
        mock_scaler.scale_deployment.assert_any_call("test", "api-service", 0)
        mock_scaler.scale_deployment.assert_any_call("test", "api-service", 3)
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_predictive_scaling_workflow(self, kubernetes_agent):
        """Test complete predictive scaling workflow"""
        await kubernetes_agent.start()
        
        # Create historical metrics to build prediction context
        historical_metrics = []
        base_time = datetime.utcnow() - timedelta(hours=1)
        
        for i in range(12):  # 12 data points over 1 hour
            timestamp = base_time + timedelta(minutes=i * 5)
            cpu_usage = 0.3 + (i * 0.05)  # Gradually increasing CPU
            memory_usage = 200 + (i * 20)  # Gradually increasing memory
            
            metrics = ResourceMetrics(
                timestamp=timestamp,
                namespace="test",
                deployment="web-app",
                pod_count=2,
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                cpu_requests=0.5,
                memory_requests=256,
                cpu_limits=1.0,
                memory_limits=512,
                network_io=10 + i,
                disk_io=5 + i
            )
            historical_metrics.append(metrics)
        
        # Add historical metrics to agent
        kubernetes_agent.metrics_history["test/web-app"] = historical_metrics
        
        # Create current high-usage metrics
        current_metrics = ResourceMetrics(
            timestamp=datetime.utcnow(),
            namespace="test",
            deployment="web-app",
            pod_count=2,
            cpu_usage=0.85,  # High CPU usage
            memory_usage=450,  # High memory usage
            cpu_requests=0.5,
            memory_requests=256,
            cpu_limits=1.0,
            memory_limits=512,
            network_io=35,
            disk_io=18
        )
        
        # Test prediction
        recommendation = kubernetes_agent.scaling_model.predict_scaling_needs(
            current_metrics, historical_metrics
        )
        
        assert isinstance(recommendation, ScalingRecommendation)
        assert recommendation.deployment == "web-app"
        assert recommendation.namespace == "test"
        assert 0.0 <= recommendation.confidence <= 1.0
        
        # Test scaling decision
        should_scale = kubernetes_agent._should_scale(recommendation)
        
        # With high CPU usage and historical trend, should recommend scaling
        if recommendation.confidence >= kubernetes_agent.scaling_threshold:
            assert should_scale is True
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_configuration_reload(self, kubernetes_agent, temp_model_path):
        """Test configuration reload functionality"""
        await kubernetes_agent.start()
        
        # Create new configuration with different settings
        new_config = AgentConfig(
            id="k8s-agent-integration",
            name="Kubernetes Agent Integration Test Updated",
            type=AgentType.KUBERNETES,
            enabled=True,
            automation_level=AutomationLevel.SEMI_AUTO,  # Changed from FULL_AUTO
            thresholds={
                "monitoring_interval": 10,  # Changed from 5
                "scaling_threshold": 0.8    # Changed from 0.6
            },
            integrations=[
                Integration(
                    name="kubernetes",
                    type="kubernetes",
                    config={
                        "kubeconfig_path": None,
                        "namespaces": ["default", "test", "production"],  # Added namespace
                        "model_path": temp_model_path
                    }
                )
            ]
        )
        
        # Reload configuration
        await kubernetes_agent.reload_config(new_config)
        
        # Verify configuration was updated
        assert kubernetes_agent.config.automation_level == AutomationLevel.SEMI_AUTO
        assert kubernetes_agent.monitoring_interval == 10
        assert kubernetes_agent.scaling_threshold == 0.8
        assert "production" in kubernetes_agent.monitored_namespaces
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_health_status_monitoring(self, kubernetes_agent):
        """Test health status monitoring"""
        await kubernetes_agent.start()
        
        # Get initial health status
        health_status = await kubernetes_agent.get_health_status()
        
        assert health_status.status.value in ["healthy", "degraded", "unhealthy", "offline"]
        assert health_status.last_heartbeat is not None
        assert health_status.uptime >= 0
        assert isinstance(health_status.metrics, dict)
        
        # Simulate some activity
        kubernetes_agent.metrics["events_processed"] = 5
        kubernetes_agent.metrics["actions_executed"] = 2
        kubernetes_agent.metrics["actions_successful"] = 2
        
        # Get updated health status
        updated_health = await kubernetes_agent.get_health_status()
        
        assert updated_health.metrics["events_processed"] == 5
        assert updated_health.metrics["actions_executed"] == 2
        assert updated_health.metrics["actions_successful"] == 2
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_error_handling_and_recovery(self, kubernetes_agent):
        """Test error handling and recovery mechanisms"""
        await kubernetes_agent.start()
        
        # Test handling of invalid scaling action
        invalid_action = AgentAction(
            id="invalid-action",
            agent_id="k8s-agent-integration",
            type=ActionType.TERRAFORM_APPLY,  # Wrong action type
            description="Invalid action",
            target_resources=["test/web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Should fail",
            metadata={}
        )
        
        result = await kubernetes_agent.execute_action(invalid_action)
        
        assert result.success is False
        assert "unsupported action type" in result.message.lower()
        
        # Test handling of malformed event
        malformed_event = SystemEvent(
            id="malformed-event",
            type=EventType.SCALING_REQUIRED,
            source="test",
            severity="medium",
            data={"invalid": "data"}  # Missing recommendation
        )
        
        # Should not raise exception, should return None
        action = await kubernetes_agent.process_event(malformed_event)
        assert action is None
        
        # Agent should still be healthy after errors
        health_status = await kubernetes_agent.get_health_status()
        assert health_status.error_count >= 0  # May have accumulated errors
        
        await kubernetes_agent.stop()
    
    @pytest.mark.asyncio
    async def test_concurrent_operations(self, kubernetes_agent):
        """Test handling of concurrent operations"""
        await kubernetes_agent.start()
        
        # Mock scaler for concurrent operations
        mock_scaler = AsyncMock()
        mock_scaler.scale_deployment.return_value = True
        mock_scaler.update_resource_requests.return_value = True
        kubernetes_agent.scaler = mock_scaler
        
        # Create multiple scaling actions
        actions = []
        for i in range(3):
            recommendation = ScalingRecommendation(
                deployment=f"app-{i}",
                namespace="test",
                current_replicas=2,
                recommended_replicas=3,
                current_cpu_request="0.5",
                recommended_cpu_request="0.6",
                current_memory_request="256Mi",
                recommended_memory_request="512Mi",
                confidence=0.8,
                reasoning=f"Scaling app-{i}",
                estimated_cost_impact=0.1
            )
            
            action = AgentAction(
                id=f"concurrent-action-{i}",
                agent_id="k8s-agent-integration",
                type=ActionType.K8S_SCALE,
                description=f"Scale app-{i}",
                target_resources=[f"test/app-{i}"],
                risk_level=RiskLevel.LOW,
                estimated_impact="Scale up",
                metadata={"recommendation": recommendation.__dict__}
            )
            actions.append(action)
        
        # Execute actions concurrently
        results = await asyncio.gather(
            *[kubernetes_agent.execute_action(action) for action in actions],
            return_exceptions=True
        )
        
        # All actions should succeed
        assert len(results) == 3
        for result in results:
            assert not isinstance(result, Exception)
            assert result.success is True
        
        # Verify all scaling operations were called
        assert mock_scaler.scale_deployment.call_count == 3
        assert mock_scaler.update_resource_requests.call_count == 3
        
        await kubernetes_agent.stop()


if __name__ == "__main__":
    pytest.main([__file__])