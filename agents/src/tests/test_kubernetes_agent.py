"""
Tests for the Kubernetes Agent implementation
"""
import asyncio
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import numpy as np
import pandas as pd

from ..agents.kubernetes_agent import (
    KubernetesAgent, KubernetesMetricsCollector, PredictiveScalingModel,
    KubernetesScaler, ResourceMetrics, ScalingRecommendation
)
from ..core.interfaces import (
    AgentConfig, AgentType, SystemEvent, EventType, ActionType,
    Integration, AutomationLevel, RiskLevel
)


class TestResourceMetrics:
    """Test ResourceMetrics dataclass"""
    
    def test_resource_metrics_creation(self):
        """Test creating ResourceMetrics instance"""
        metrics = ResourceMetrics(
            timestamp=datetime.utcnow(),
            namespace="test",
            deployment="web-app",
            pod_count=3,
            cpu_usage=0.5,
            memory_usage=512,
            cpu_requests=0.3,
            memory_requests=256,
            cpu_limits=1.0,
            memory_limits=1024,
            network_io=10.5,
            disk_io=5.2
        )
        
        assert metrics.namespace == "test"
        assert metrics.deployment == "web-app"
        assert metrics.pod_count == 3
        assert metrics.cpu_usage == 0.5


class TestScalingRecommendation:
    """Test ScalingRecommendation dataclass"""
    
    def test_scaling_recommendation_creation(self):
        """Test creating ScalingRecommendation instance"""
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=3,
            recommended_replicas=5,
            current_cpu_request="0.3",
            recommended_cpu_request="0.4",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization detected",
            estimated_cost_impact=0.15
        )
        
        assert recommendation.deployment == "web-app"
        assert recommendation.recommended_replicas == 5
        assert recommendation.confidence == 0.85


class TestKubernetesMetricsCollector:
    """Test KubernetesMetricsCollector class"""
    
    @pytest.fixture
    def metrics_collector(self):
        """Create metrics collector instance"""
        return KubernetesMetricsCollector()
    
    @pytest.mark.asyncio
    async def test_initialize_with_mock_client(self, metrics_collector):
        """Test initialization with mock Kubernetes client"""
        with patch('src.agents.kubernetes_agent.config') as mock_config, \
             patch('src.agents.kubernetes_agent.client') as mock_client:
            
            mock_config.load_kube_config.side_effect = Exception("No config")
            mock_config.load_incluster_config.side_effect = Exception("Not in cluster")
            
            # Mock the client classes
            mock_client.CoreV1Api.return_value = Mock()
            mock_client.AppsV1Api.return_value = Mock()
            mock_client.CustomObjectsApi.return_value = Mock()
            
            # Should raise exception when no config is available
            with pytest.raises(Exception):
                await metrics_collector.initialize()
    
    @pytest.mark.asyncio
    async def test_get_cluster_nodes_empty(self, metrics_collector):
        """Test getting cluster nodes when client is None"""
        metrics_collector.v1 = None
        nodes = await metrics_collector.get_cluster_nodes()
        assert nodes == []
    
    @pytest.mark.asyncio
    async def test_get_deployments_empty(self, metrics_collector):
        """Test getting deployments when client is None"""
        metrics_collector.apps_v1 = None
        deployments = await metrics_collector.get_deployments()
        assert deployments == []
    
    @pytest.mark.asyncio
    async def test_get_pod_metrics_mock_data(self, metrics_collector):
        """Test getting pod metrics with mock data"""
        metrics_collector.metrics_v1beta1 = None
        metrics = await metrics_collector.get_pod_metrics()
        
        assert len(metrics) > 0
        assert all(isinstance(m, ResourceMetrics) for m in metrics)
        assert all(m.timestamp is not None for m in metrics)
    
    def test_parse_pod_metrics(self, metrics_collector):
        """Test parsing pod metrics from Kubernetes API format"""
        mock_pod_metric = {
            "metadata": {
                "name": "test-pod",
                "namespace": "default"
            },
            "containers": [
                {
                    "name": "app",
                    "usage": {
                        "cpu": "100m",
                        "memory": "256Mi"
                    }
                }
            ]
        }
        
        metrics = metrics_collector._parse_pod_metrics(mock_pod_metric)
        
        assert metrics.namespace == "default"
        assert metrics.deployment == "test-pod"
        assert metrics.cpu_usage == 0.1  # 100m = 0.1 cores
        assert metrics.memory_usage == 256  # 256Mi
    
    def test_generate_mock_metrics(self, metrics_collector):
        """Test generating mock metrics"""
        metrics = metrics_collector._generate_mock_metrics()
        
        assert len(metrics) > 0
        assert all(isinstance(m, ResourceMetrics) for m in metrics)
        assert all(m.cpu_usage > 0 for m in metrics)
        assert all(m.memory_usage > 0 for m in metrics)


class TestPredictiveScalingModel:
    """Test PredictiveScalingModel class"""
    
    @pytest.fixture
    def scaling_model(self):
        """Create scaling model instance"""
        return PredictiveScalingModel()
    
    def test_model_initialization(self, scaling_model):
        """Test model initialization"""
        assert scaling_model.cpu_model is None
        assert scaling_model.memory_model is None
        assert scaling_model.replica_model is None
        assert scaling_model.scaler is None
        assert len(scaling_model.feature_columns) > 0
    
    def test_train_models(self, scaling_model):
        """Test training models with sample data"""
        # Create sample training data
        training_data = pd.DataFrame({
            'current_cpu_usage': [0.2, 0.5, 0.8, 0.3, 0.6],
            'current_memory_usage': [200, 400, 600, 300, 500],
            'current_replicas': [2, 3, 5, 2, 4],
            'cpu_trend_5min': [0.01, 0.05, -0.02, 0.03, -0.01],
            'memory_trend_5min': [5, 10, -8, 12, -3],
            'hour_of_day': [9, 14, 20, 11, 16],
            'day_of_week': [1, 2, 5, 3, 4],
            'avg_cpu_last_hour': [0.25, 0.45, 0.75, 0.35, 0.55],
            'avg_memory_last_hour': [220, 380, 580, 320, 480],
            'request_rate': [10, 25, 40, 15, 30],
            'future_cpu_usage': [0.25, 0.55, 0.75, 0.35, 0.58],
            'future_memory_usage': [220, 420, 580, 320, 520],
            'optimal_replicas': [2, 4, 5, 3, 4]
        })
        
        scaling_model.train_models(training_data)
        
        assert scaling_model.cpu_model is not None
        assert scaling_model.memory_model is not None
        assert scaling_model.replica_model is not None
        assert scaling_model.scaler is not None
    
    def test_predict_scaling_needs(self, scaling_model):
        """Test predicting scaling needs"""
        # Initialize with default models
        scaling_model._initialize_default_models()
        
        current_metrics = ResourceMetrics(
            timestamp=datetime.utcnow(),
            namespace="test",
            deployment="web-app",
            pod_count=3,
            cpu_usage=0.7,
            memory_usage=400,
            cpu_requests=0.5,
            memory_requests=256,
            cpu_limits=1.0,
            memory_limits=512,
            network_io=20,
            disk_io=10
        )
        
        historical_metrics = [
            ResourceMetrics(
                timestamp=datetime.utcnow() - timedelta(minutes=5),
                namespace="test",
                deployment="web-app",
                pod_count=3,
                cpu_usage=0.6,
                memory_usage=350,
                cpu_requests=0.5,
                memory_requests=256,
                cpu_limits=1.0,
                memory_limits=512,
                network_io=15,
                disk_io=8
            )
        ]
        
        recommendation = scaling_model.predict_scaling_needs(current_metrics, historical_metrics)
        
        assert isinstance(recommendation, ScalingRecommendation)
        assert recommendation.deployment == "web-app"
        assert recommendation.namespace == "test"
        assert 0.0 <= recommendation.confidence <= 1.0
    
    def test_extract_features(self, scaling_model):
        """Test feature extraction from metrics"""
        current_metrics = ResourceMetrics(
            timestamp=datetime.utcnow(),
            namespace="test",
            deployment="web-app",
            pod_count=3,
            cpu_usage=0.5,
            memory_usage=300,
            cpu_requests=0.3,
            memory_requests=256,
            cpu_limits=1.0,
            memory_limits=512,
            network_io=15,
            disk_io=8
        )
        
        historical_metrics = []
        features = scaling_model._extract_features(current_metrics, historical_metrics)
        
        assert 'current_cpu_usage' in features
        assert 'current_memory_usage' in features
        assert 'current_replicas' in features
        assert features['current_cpu_usage'] == 0.5
        assert features['current_memory_usage'] == 300
        assert features['current_replicas'] == 3.0
    
    def test_calculate_confidence(self, scaling_model):
        """Test confidence calculation"""
        scaling_model._initialize_default_models()
        
        feature_scaled = np.array([[0.5, 300, 3, 0.01, 5, 14, 2, 0.45, 280, 20]])
        current_metrics = ResourceMetrics(
            timestamp=datetime.utcnow(),
            namespace="test",
            deployment="web-app",
            pod_count=3,
            cpu_usage=0.5,
            memory_usage=300,
            cpu_requests=0.3,
            memory_requests=256,
            cpu_limits=1.0,
            memory_limits=512,
            network_io=15,
            disk_io=8
        )
        
        confidence = scaling_model._calculate_confidence(feature_scaled, current_metrics)
        
        assert 0.1 <= confidence <= 0.95
    
    def test_models_loaded(self, scaling_model):
        """Test checking if models are loaded"""
        assert not scaling_model._models_loaded()
        
        scaling_model._initialize_default_models()
        assert scaling_model._models_loaded()


class TestKubernetesScaler:
    """Test KubernetesScaler class"""
    
    @pytest.fixture
    def mock_apps_v1(self):
        """Create mock Kubernetes apps v1 client"""
        mock_client = Mock()
        mock_deployment = Mock()
        mock_deployment.spec.replicas = 3
        mock_deployment.spec.template.spec.containers = [Mock()]
        mock_deployment.spec.template.spec.containers[0].resources = Mock()
        mock_deployment.spec.template.spec.containers[0].resources.requests = {}
        
        mock_client.read_namespaced_deployment.return_value = mock_deployment
        mock_client.patch_namespaced_deployment.return_value = None
        
        return mock_client
    
    @pytest.fixture
    def scaler(self, mock_apps_v1):
        """Create scaler instance"""
        return KubernetesScaler(mock_apps_v1)
    
    @pytest.mark.asyncio
    async def test_scale_deployment_success(self, scaler, mock_apps_v1):
        """Test successful deployment scaling"""
        result = await scaler.scale_deployment("default", "web-app", 5)
        
        assert result is True
        mock_apps_v1.read_namespaced_deployment.assert_called_once_with(
            name="web-app", namespace="default"
        )
        mock_apps_v1.patch_namespaced_deployment.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_scale_deployment_no_client(self):
        """Test scaling when client is None"""
        scaler = KubernetesScaler(None)
        result = await scaler.scale_deployment("default", "web-app", 5)
        
        assert result is True  # Should simulate success
    
    @pytest.mark.asyncio
    async def test_update_resource_requests_success(self, scaler, mock_apps_v1):
        """Test successful resource request update"""
        result = await scaler.update_resource_requests(
            "default", "web-app", "500m", "512Mi"
        )
        
        assert result is True
        mock_apps_v1.read_namespaced_deployment.assert_called_once()
        mock_apps_v1.patch_namespaced_deployment.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_resource_requests_no_client(self):
        """Test updating resources when client is None"""
        scaler = KubernetesScaler(None)
        result = await scaler.update_resource_requests(
            "default", "web-app", "500m", "512Mi"
        )
        
        assert result is True  # Should simulate success


class TestKubernetesAgent:
    """Test KubernetesAgent class"""
    
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
    def agent_config(self):
        """Create agent configuration"""
        return AgentConfig(
            id="k8s-agent-1",
            name="Kubernetes Agent",
            type=AgentType.KUBERNETES,
            enabled=True,
            automation_level=AutomationLevel.SEMI_AUTO,
            thresholds={
                "monitoring_interval": 30,
                "scaling_threshold": 0.7
            },
            integrations=[
                Integration(
                    name="kubernetes",
                    type="kubernetes",
                    config={
                        "kubeconfig_path": "/tmp/kubeconfig",
                        "namespaces": ["default", "production"],
                        "model_path": "/tmp/k8s_model.joblib"
                    }
                )
            ]
        )
    
    @pytest.fixture
    def kubernetes_agent(self, mock_event_bus, mock_config_service, mock_audit_service):
        """Create Kubernetes agent instance"""
        return KubernetesAgent(
            "k8s-agent-1",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
    
    @pytest.mark.asyncio
    async def test_initialize_agent_specific(self, kubernetes_agent, agent_config):
        """Test agent-specific initialization"""
        kubernetes_agent.config = agent_config
        
        with patch.object(KubernetesMetricsCollector, 'initialize') as mock_init:
            mock_init.return_value = AsyncMock()
            
            await kubernetes_agent._initialize_agent_specific()
            
            assert kubernetes_agent.metrics_collector is not None
            assert kubernetes_agent.scaling_model is not None
            assert kubernetes_agent.kubeconfig_path == "/tmp/kubeconfig"
            assert kubernetes_agent.monitored_namespaces == ["default", "production"]
    
    @pytest.mark.asyncio
    async def test_initialize_no_k8s_config(self, kubernetes_agent, agent_config):
        """Test initialization without Kubernetes configuration"""
        # Remove Kubernetes integration
        agent_config.integrations = []
        kubernetes_agent.config = agent_config
        
        with pytest.raises(RuntimeError, match="No Kubernetes integration configuration found"):
            await kubernetes_agent._initialize_agent_specific()
    
    @pytest.mark.asyncio
    async def test_start_agent_specific(self, kubernetes_agent, agent_config):
        """Test starting agent-specific components"""
        kubernetes_agent.config = agent_config
        
        with patch.object(kubernetes_agent, '_monitoring_loop') as mock_loop:
            mock_loop.return_value = AsyncMock()
            
            await kubernetes_agent._start_agent_specific()
            
            assert kubernetes_agent._monitoring_task is not None
    
    @pytest.mark.asyncio
    async def test_stop_agent_specific(self, kubernetes_agent):
        """Test stopping agent-specific components"""
        # Create a mock task
        mock_task = AsyncMock()
        kubernetes_agent._monitoring_task = mock_task
        
        await kubernetes_agent._stop_agent_specific()
        
        mock_task.cancel.assert_called_once()
    
    def test_get_subscribed_event_types(self, kubernetes_agent):
        """Test getting subscribed event types"""
        event_types = kubernetes_agent._get_subscribed_event_types()
        
        assert EventType.SCALING_REQUIRED in event_types
        assert EventType.RESOURCE_ANOMALY in event_types
    
    @pytest.mark.asyncio
    async def test_process_scaling_event(self, kubernetes_agent, agent_config):
        """Test processing scaling required event"""
        kubernetes_agent.config = agent_config
        
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=3,
            recommended_replicas=5,
            current_cpu_request="0.3",
            recommended_cpu_request="0.4",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization",
            estimated_cost_impact=0.15
        )
        
        event = SystemEvent(
            id="scaling-event-1",
            type=EventType.SCALING_REQUIRED,
            source="k8s-monitor",
            severity="medium",
            data={"recommendation": recommendation.__dict__}
        )
        
        action = await kubernetes_agent._process_event_specific(event)
        
        assert action is not None
        assert action.type == ActionType.K8S_SCALE
        assert action.agent_id == "k8s-agent-1"
        assert "web-app" in action.description
    
    @pytest.mark.asyncio
    async def test_process_resource_anomaly_event(self, kubernetes_agent, agent_config):
        """Test processing resource anomaly event"""
        kubernetes_agent.config = agent_config
        
        event = SystemEvent(
            id="anomaly-event-1",
            type=EventType.RESOURCE_ANOMALY,
            source="monitoring",
            severity="high",
            data={
                "deployment": "api-service",
                "namespace": "production",
                "anomaly_type": "memory_leak"
            }
        )
        
        action = await kubernetes_agent._process_event_specific(event)
        
        assert action is not None
        assert action.type == ActionType.K8S_RESTART
        assert action.agent_id == "k8s-agent-1"
        assert "api-service" in action.description
    
    def test_should_scale_high_confidence(self, kubernetes_agent, agent_config):
        """Test should_scale with high confidence recommendation"""
        kubernetes_agent.config = agent_config
        
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=3,
            recommended_replicas=5,
            current_cpu_request="0.3",
            recommended_cpu_request="0.4",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization",
            estimated_cost_impact=0.15
        )
        
        should_scale = kubernetes_agent._should_scale(recommendation)
        assert should_scale is True
    
    def test_should_scale_low_confidence(self, kubernetes_agent, agent_config):
        """Test should_scale with low confidence recommendation"""
        kubernetes_agent.config = agent_config
        
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=3,
            recommended_replicas=3,  # No change
            current_cpu_request="0.3",
            recommended_cpu_request="0.31",  # Minimal change
            current_memory_request="256Mi",
            recommended_memory_request="260Mi",  # Minimal change
            confidence=0.5,  # Below threshold
            reasoning="Uncertain prediction",
            estimated_cost_impact=0.01
        )
        
        should_scale = kubernetes_agent._should_scale(recommendation)
        assert should_scale is False
    
    def test_assess_scaling_severity(self, kubernetes_agent):
        """Test assessing scaling severity"""
        # High severity - more than 100% replica change
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=2,
            recommended_replicas=5,  # 150% increase
            current_cpu_request="0.3",
            recommended_cpu_request="0.4",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High load",
            estimated_cost_impact=0.25
        )
        
        severity = kubernetes_agent._assess_scaling_severity(recommendation)
        assert severity == "high"
        
        # Medium severity - more than 50% replica change
        recommendation.recommended_replicas = 4  # 100% increase
        severity = kubernetes_agent._assess_scaling_severity(recommendation)
        assert severity == "high"  # 100% change should be high severity
        
        # Medium severity - between 50% and 100% change
        recommendation.current_replicas = 3
        recommendation.recommended_replicas = 5  # 67% increase
        severity = kubernetes_agent._assess_scaling_severity(recommendation)
        assert severity == "medium"
        
        # Low severity - small replica change
        recommendation.current_replicas = 2
        recommendation.recommended_replicas = 2  # No change
        severity = kubernetes_agent._assess_scaling_severity(recommendation)
        assert severity == "low"
    
    @pytest.mark.asyncio
    async def test_execute_scaling_action(self, kubernetes_agent, agent_config):
        """Test executing scaling action"""
        kubernetes_agent.config = agent_config
        
        # Mock the scaler
        mock_scaler = AsyncMock()
        mock_scaler.scale_deployment.return_value = True
        mock_scaler.update_resource_requests.return_value = True
        kubernetes_agent.scaler = mock_scaler
        
        recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=3,
            recommended_replicas=5,
            current_cpu_request="0.3",
            recommended_cpu_request="0.4",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization",
            estimated_cost_impact=0.15
        )
        
        from ..core.interfaces import AgentAction
        action = AgentAction(
            id="scale-action-1",
            agent_id="k8s-agent-1",
            type=ActionType.K8S_SCALE,
            description="Scale web-app",
            target_resources=["production/web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Scale from 3 to 5 replicas",
            metadata={"recommendation": recommendation.__dict__}
        )
        
        result = await kubernetes_agent._execute_action_specific(action)
        
        assert result.success is True
        assert "success" in result.message
        mock_scaler.scale_deployment.assert_called_once_with("production", "web-app", 5)
        mock_scaler.update_resource_requests.assert_called_once_with(
            "production", "web-app", "0.4", "512Mi"
        )
    
    @pytest.mark.asyncio
    async def test_execute_scaling_action_no_scaler(self, kubernetes_agent, agent_config):
        """Test executing scaling action without scaler"""
        kubernetes_agent.config = agent_config
        kubernetes_agent.scaler = None
        
        from ..core.interfaces import AgentAction
        action = AgentAction(
            id="scale-action-1",
            agent_id="k8s-agent-1",
            type=ActionType.K8S_SCALE,
            description="Scale web-app",
            target_resources=["production/web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Scale from 3 to 5 replicas",
            metadata={"recommendation": {}}
        )
        
        result = await kubernetes_agent._execute_action_specific(action)
        
        assert result.success is False
        assert "scaler not available" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_execute_restart_action(self, kubernetes_agent, agent_config):
        """Test executing restart action"""
        kubernetes_agent.config = agent_config
        
        # Mock the scaler and metrics collector
        mock_scaler = AsyncMock()
        mock_scaler.scale_deployment.return_value = True
        kubernetes_agent.scaler = mock_scaler
        
        mock_metrics_collector = AsyncMock()
        mock_metrics_collector.get_deployments.return_value = [
            {"name": "api-service", "replicas": 3}
        ]
        kubernetes_agent.metrics_collector = mock_metrics_collector
        
        from ..core.interfaces import AgentAction
        action = AgentAction(
            id="restart-action-1",
            agent_id="k8s-agent-1",
            type=ActionType.K8S_RESTART,
            description="Restart api-service",
            target_resources=["production/api-service"],
            risk_level=RiskLevel.MEDIUM,
            estimated_impact="Temporary service disruption",
            metadata={}
        )
        
        result = await kubernetes_agent._execute_action_specific(action)
        
        assert result.success is True
        assert "restarted" in result.message.lower()
        
        # Should call scale_deployment twice (down to 0, then back up to 3)
        assert mock_scaler.scale_deployment.call_count == 2
        mock_scaler.scale_deployment.assert_any_call("production", "api-service", 0)
        mock_scaler.scale_deployment.assert_any_call("production", "api-service", 3)
    
    @pytest.mark.asyncio
    async def test_collect_and_analyze_metrics(self, kubernetes_agent, agent_config):
        """Test collecting and analyzing metrics"""
        kubernetes_agent.config = agent_config
        
        # Mock components
        mock_metrics_collector = AsyncMock()
        mock_metrics = [
            ResourceMetrics(
                timestamp=datetime.utcnow(),
                namespace="production",
                deployment="web-app",
                pod_count=3,
                cpu_usage=0.7,
                memory_usage=400,
                cpu_requests=0.5,
                memory_requests=256,
                cpu_limits=1.0,
                memory_limits=512,
                network_io=20,
                disk_io=10
            )
        ]
        mock_metrics_collector.get_pod_metrics.return_value = mock_metrics
        kubernetes_agent.metrics_collector = mock_metrics_collector
        
        mock_scaling_model = Mock()
        kubernetes_agent.scaling_model = mock_scaling_model
        
        with patch.object(kubernetes_agent, '_analyze_deployment_scaling') as mock_analyze:
            mock_analyze.return_value = AsyncMock()
            
            await kubernetes_agent._collect_and_analyze_metrics()
            
            # Should call get_pod_metrics for each monitored namespace
            assert mock_metrics_collector.get_pod_metrics.call_count == len(kubernetes_agent.monitored_namespaces)
            
            # Should analyze the deployment
            mock_analyze.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_analyze_deployment_scaling(self, kubernetes_agent, agent_config):
        """Test analyzing deployment for scaling opportunities"""
        kubernetes_agent.config = agent_config
        
        # Mock scaling model
        mock_scaling_model = Mock()
        mock_recommendation = ScalingRecommendation(
            deployment="web-app",
            namespace="production",
            current_replicas=3,
            recommended_replicas=5,
            current_cpu_request="0.3",
            recommended_cpu_request="0.4",
            current_memory_request="256Mi",
            recommended_memory_request="512Mi",
            confidence=0.85,
            reasoning="High CPU utilization",
            estimated_cost_impact=0.15
        )
        mock_scaling_model.predict_scaling_needs.return_value = mock_recommendation
        kubernetes_agent.scaling_model = mock_scaling_model
        
        current_metrics = [
            ResourceMetrics(
                timestamp=datetime.utcnow(),
                namespace="production",
                deployment="web-app",
                pod_count=3,
                cpu_usage=0.7,
                memory_usage=400,
                cpu_requests=0.5,
                memory_requests=256,
                cpu_limits=1.0,
                memory_limits=512,
                network_io=20,
                disk_io=10
            )
        ]
        
        with patch.object(kubernetes_agent, '_should_scale', return_value=True):
            with patch.object(kubernetes_agent, '_create_scaling_event') as mock_create_event:
                mock_create_event.return_value = AsyncMock()
                
                await kubernetes_agent._analyze_deployment_scaling("production/web-app", current_metrics)
                
                # Should add metrics to history
                assert "production/web-app" in kubernetes_agent.metrics_history
                
                # Should create scaling event
                mock_create_event.assert_called_once_with(mock_recommendation)


if __name__ == "__main__":
    pytest.main([__file__])