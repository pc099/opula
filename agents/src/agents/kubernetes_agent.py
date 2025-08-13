"""
Kubernetes Agent implementation for the AIOps Platform

This agent handles:
- Kubernetes cluster monitoring and metrics collection
- Predictive scaling algorithms using time-series analysis
- Horizontal and vertical pod autoscaling logic
- Resource optimization recommendations and automated adjustments
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error
import joblib

try:
    from kubernetes import client, config, watch
    from kubernetes.client.rest import ApiException
except ImportError:
    # Mock kubernetes client for development/testing
    class MockKubernetesClient:
        def __init__(self):
            pass
    client = MockKubernetesClient()
    config = MockKubernetesClient()
    watch = MockKubernetesClient()
    ApiException = Exception

from ..core.base_agent import BaseAgent
from ..core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, ActionStatus
)


@dataclass
class ResourceMetrics:
    """Container for resource metrics"""
    timestamp: datetime
    namespace: str
    deployment: str
    pod_count: int
    cpu_usage: float
    memory_usage: float
    cpu_requests: float
    memory_requests: float
    cpu_limits: float
    memory_limits: float
    network_io: float
    disk_io: float


@dataclass
class ScalingRecommendation:
    """Container for scaling recommendations"""
    deployment: str
    namespace: str
    current_replicas: int
    recommended_replicas: int
    current_cpu_request: str
    recommended_cpu_request: str
    current_memory_request: str
    recommended_memory_request: str
    confidence: float
    reasoning: str
    estimated_cost_impact: float


class KubernetesMetricsCollector:
    """Collects metrics from Kubernetes cluster"""
    
    def __init__(self, kubeconfig_path: Optional[str] = None):
        self.kubeconfig_path = kubeconfig_path
        self.v1 = None
        self.apps_v1 = None
        self.metrics_v1beta1 = None
        self.logger = logging.getLogger("k8s.metrics_collector")
        
    async def initialize(self) -> None:
        """Initialize Kubernetes client"""
        try:
            if self.kubeconfig_path:
                config.load_kube_config(config_file=self.kubeconfig_path)
            else:
                # Try in-cluster config first, then default kubeconfig
                try:
                    config.load_incluster_config()
                except:
                    config.load_kube_config()
            
            self.v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
            
            # Try to initialize metrics API
            try:
                self.metrics_v1beta1 = client.CustomObjectsApi()
            except:
                self.logger.warning("Metrics API not available, using mock data")
                
            self.logger.info("Kubernetes client initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Kubernetes client: {str(e)}")
            raise
    
    async def get_cluster_nodes(self) -> List[Dict[str, Any]]:
        """Get cluster node information"""
        try:
            if not self.v1:
                return []
                
            nodes = self.v1.list_node()
            node_info = []
            
            for node in nodes.items:
                node_info.append({
                    "name": node.metadata.name,
                    "status": node.status.conditions[-1].type if node.status.conditions else "Unknown",
                    "capacity": node.status.capacity,
                    "allocatable": node.status.allocatable,
                    "node_info": node.status.node_info.to_dict() if node.status.node_info else {}
                })
                
            return node_info
            
        except Exception as e:
            self.logger.error(f"Error getting cluster nodes: {str(e)}")
            return []
    
    async def get_deployments(self, namespace: str = None) -> List[Dict[str, Any]]:
        """Get deployment information"""
        try:
            if not self.apps_v1:
                return []
                
            if namespace:
                deployments = self.apps_v1.list_namespaced_deployment(namespace)
            else:
                deployments = self.apps_v1.list_deployment_for_all_namespaces()
                
            deployment_info = []
            
            for deployment in deployments.items:
                deployment_info.append({
                    "name": deployment.metadata.name,
                    "namespace": deployment.metadata.namespace,
                    "replicas": deployment.spec.replicas,
                    "ready_replicas": deployment.status.ready_replicas or 0,
                    "available_replicas": deployment.status.available_replicas or 0,
                    "containers": [
                        {
                            "name": container.name,
                            "image": container.image,
                            "resources": container.resources.to_dict() if container.resources else {}
                        }
                        for container in deployment.spec.template.spec.containers
                    ]
                })
                
            return deployment_info
            
        except Exception as e:
            self.logger.error(f"Error getting deployments: {str(e)}")
            return []
    
    async def get_pod_metrics(self, namespace: str = None) -> List[ResourceMetrics]:
        """Get pod resource metrics"""
        try:
            metrics = []
            
            # Get pod metrics from metrics API or mock data
            if self.metrics_v1beta1:
                try:
                    if namespace:
                        pod_metrics = self.metrics_v1beta1.list_namespaced_custom_object(
                            group="metrics.k8s.io",
                            version="v1beta1",
                            namespace=namespace,
                            plural="pods"
                        )
                    else:
                        pod_metrics = self.metrics_v1beta1.list_cluster_custom_object(
                            group="metrics.k8s.io",
                            version="v1beta1",
                            plural="pods"
                        )
                    
                    for pod_metric in pod_metrics.get("items", []):
                        metrics.append(self._parse_pod_metrics(pod_metric))
                        
                except Exception as e:
                    self.logger.warning(f"Could not get real metrics, using mock data: {str(e)}")
                    metrics = self._generate_mock_metrics()
            else:
                # Generate mock metrics for development
                metrics = self._generate_mock_metrics()
                
            return metrics
            
        except Exception as e:
            self.logger.error(f"Error getting pod metrics: {str(e)}")
            return []
    
    def _parse_pod_metrics(self, pod_metric: Dict[str, Any]) -> ResourceMetrics:
        """Parse pod metrics from Kubernetes metrics API"""
        metadata = pod_metric.get("metadata", {})
        containers = pod_metric.get("containers", [])
        
        # Aggregate container metrics
        total_cpu = 0
        total_memory = 0
        
        for container in containers:
            usage = container.get("usage", {})
            cpu_str = usage.get("cpu", "0")
            memory_str = usage.get("memory", "0")
            
            # Parse CPU (e.g., "100m" -> 0.1 cores)
            if cpu_str.endswith("m"):
                total_cpu += float(cpu_str[:-1]) / 1000
            else:
                total_cpu += float(cpu_str)
                
            # Parse memory (e.g., "100Mi" -> MB)
            if memory_str.endswith("Ki"):
                total_memory += float(memory_str[:-2]) / 1024
            elif memory_str.endswith("Mi"):
                total_memory += float(memory_str[:-2])
            elif memory_str.endswith("Gi"):
                total_memory += float(memory_str[:-2]) * 1024
            else:
                total_memory += float(memory_str) / (1024 * 1024)
        
        return ResourceMetrics(
            timestamp=datetime.utcnow(),
            namespace=metadata.get("namespace", "default"),
            deployment=metadata.get("name", "unknown"),
            pod_count=1,
            cpu_usage=total_cpu,
            memory_usage=total_memory,
            cpu_requests=0.1,  # Default values - would be fetched from pod spec
            memory_requests=128,
            cpu_limits=0.5,
            memory_limits=512,
            network_io=0.0,
            disk_io=0.0
        )
    
    def _generate_mock_metrics(self) -> List[ResourceMetrics]:
        """Generate mock metrics for development/testing"""
        mock_deployments = [
            ("web-app", "production"),
            ("api-service", "production"),
            ("worker", "production"),
            ("cache", "staging")
        ]
        
        metrics = []
        now = datetime.utcnow()
        
        for deployment, namespace in mock_deployments:
            # Generate realistic-looking metrics
            base_cpu = np.random.uniform(0.1, 0.8)
            base_memory = np.random.uniform(100, 800)
            
            metrics.append(ResourceMetrics(
                timestamp=now,
                namespace=namespace,
                deployment=deployment,
                pod_count=np.random.randint(2, 10),
                cpu_usage=base_cpu + np.random.normal(0, 0.1),
                memory_usage=base_memory + np.random.normal(0, 50),
                cpu_requests=base_cpu * 0.7,
                memory_requests=base_memory * 0.8,
                cpu_limits=base_cpu * 1.5,
                memory_limits=base_memory * 1.2,
                network_io=np.random.uniform(0, 100),
                disk_io=np.random.uniform(0, 50)
            ))
            
        return metrics


class PredictiveScalingModel:
    """ML model for predictive scaling decisions"""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or "k8s_scaling_model.joblib"
        self.cpu_model = None
        self.memory_model = None
        self.replica_model = None
        self.scaler = None
        self.feature_columns = [
            'current_cpu_usage', 'current_memory_usage', 'current_replicas',
            'cpu_trend_5min', 'memory_trend_5min', 'hour_of_day', 'day_of_week',
            'avg_cpu_last_hour', 'avg_memory_last_hour', 'request_rate'
        ]
        self.logger = logging.getLogger("k8s.scaling_model")
        
    def train_models(self, historical_data: pd.DataFrame) -> None:
        """Train the predictive scaling models"""
        try:
            # Prepare features
            X = historical_data[self.feature_columns]
            
            # Scale features
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            # Train CPU prediction model
            y_cpu = historical_data['future_cpu_usage']
            self.cpu_model = RandomForestRegressor(n_estimators=100, random_state=42)
            self.cpu_model.fit(X_scaled, y_cpu)
            
            # Train memory prediction model
            y_memory = historical_data['future_memory_usage']
            self.memory_model = RandomForestRegressor(n_estimators=100, random_state=42)
            self.memory_model.fit(X_scaled, y_memory)
            
            # Train replica recommendation model
            y_replicas = historical_data['optimal_replicas']
            self.replica_model = RandomForestRegressor(n_estimators=100, random_state=42)
            self.replica_model.fit(X_scaled, y_replicas)
            
            # Save models
            self._save_models()
            
            self.logger.info("Predictive scaling models trained successfully")
            
        except Exception as e:
            self.logger.error(f"Error training models: {str(e)}")
            raise
    
    def predict_scaling_needs(self, current_metrics: ResourceMetrics, 
                            historical_metrics: List[ResourceMetrics]) -> ScalingRecommendation:
        """Predict scaling needs based on current and historical metrics"""
        try:
            if not self._models_loaded():
                self._load_models()
            
            # Extract features
            features = self._extract_features(current_metrics, historical_metrics)
            feature_array = np.array([[features[col] for col in self.feature_columns]])
            feature_scaled = self.scaler.transform(feature_array)
            
            # Make predictions
            predicted_cpu = self.cpu_model.predict(feature_scaled)[0]
            predicted_memory = self.memory_model.predict(feature_scaled)[0]
            predicted_replicas = max(1, int(self.replica_model.predict(feature_scaled)[0]))
            
            # Calculate confidence based on model uncertainty
            confidence = self._calculate_confidence(feature_scaled, current_metrics)
            
            # Generate recommendations
            recommendation = self._generate_recommendation(
                current_metrics, predicted_cpu, predicted_memory, 
                predicted_replicas, confidence
            )
            
            return recommendation
            
        except Exception as e:
            self.logger.error(f"Error predicting scaling needs: {str(e)}")
            # Return safe default recommendation
            return ScalingRecommendation(
                deployment=current_metrics.deployment,
                namespace=current_metrics.namespace,
                current_replicas=current_metrics.pod_count,
                recommended_replicas=current_metrics.pod_count,
                current_cpu_request=f"{current_metrics.cpu_requests}",
                recommended_cpu_request=f"{current_metrics.cpu_requests}",
                current_memory_request=f"{current_metrics.memory_requests}Mi",
                recommended_memory_request=f"{current_metrics.memory_requests}Mi",
                confidence=0.5,
                reasoning="Error in prediction, maintaining current configuration",
                estimated_cost_impact=0.0
            )
    
    def _extract_features(self, current_metrics: ResourceMetrics, 
                         historical_metrics: List[ResourceMetrics]) -> Dict[str, float]:
        """Extract features for ML model"""
        now = datetime.utcnow()
        
        # Calculate trends from historical data
        cpu_trend_5min = 0.0
        memory_trend_5min = 0.0
        avg_cpu_last_hour = current_metrics.cpu_usage
        avg_memory_last_hour = current_metrics.memory_usage
        
        if len(historical_metrics) > 1:
            recent_metrics = [m for m in historical_metrics 
                            if (now - m.timestamp).total_seconds() <= 300]  # 5 minutes
            hour_metrics = [m for m in historical_metrics 
                          if (now - m.timestamp).total_seconds() <= 3600]  # 1 hour
            
            if len(recent_metrics) > 1:
                cpu_values = [m.cpu_usage for m in recent_metrics]
                memory_values = [m.memory_usage for m in recent_metrics]
                cpu_trend_5min = (cpu_values[-1] - cpu_values[0]) / len(cpu_values)
                memory_trend_5min = (memory_values[-1] - memory_values[0]) / len(memory_values)
            
            if hour_metrics:
                avg_cpu_last_hour = np.mean([m.cpu_usage for m in hour_metrics])
                avg_memory_last_hour = np.mean([m.memory_usage for m in hour_metrics])
        
        return {
            'current_cpu_usage': current_metrics.cpu_usage,
            'current_memory_usage': current_metrics.memory_usage,
            'current_replicas': float(current_metrics.pod_count),
            'cpu_trend_5min': cpu_trend_5min,
            'memory_trend_5min': memory_trend_5min,
            'hour_of_day': float(now.hour),
            'day_of_week': float(now.weekday()),
            'avg_cpu_last_hour': avg_cpu_last_hour,
            'avg_memory_last_hour': avg_memory_last_hour,
            'request_rate': current_metrics.network_io  # Proxy for request rate
        }
    
    def _calculate_confidence(self, feature_scaled: np.ndarray, 
                            current_metrics: ResourceMetrics) -> float:
        """Calculate confidence in the prediction"""
        try:
            # Use model prediction variance as confidence indicator
            cpu_predictions = []
            memory_predictions = []
            replica_predictions = []
            
            # Get predictions from multiple trees (if available)
            if hasattr(self.cpu_model, 'estimators_'):
                for estimator in self.cpu_model.estimators_[:10]:  # Sample 10 trees
                    cpu_predictions.append(estimator.predict(feature_scaled)[0])
                    
            if hasattr(self.memory_model, 'estimators_'):
                for estimator in self.memory_model.estimators_[:10]:
                    memory_predictions.append(estimator.predict(feature_scaled)[0])
                    
            if hasattr(self.replica_model, 'estimators_'):
                for estimator in self.replica_model.estimators_[:10]:
                    replica_predictions.append(estimator.predict(feature_scaled)[0])
            
            # Calculate confidence based on prediction variance
            cpu_variance = np.var(cpu_predictions) if cpu_predictions else 0.1
            memory_variance = np.var(memory_predictions) if memory_predictions else 0.1
            replica_variance = np.var(replica_predictions) if replica_predictions else 0.1
            
            # Lower variance = higher confidence
            confidence = 1.0 / (1.0 + cpu_variance + memory_variance + replica_variance)
            
            return min(max(confidence, 0.1), 0.95)  # Clamp between 0.1 and 0.95
            
        except Exception as e:
            self.logger.warning(f"Error calculating confidence: {str(e)}")
            return 0.5
    
    def _generate_recommendation(self, current_metrics: ResourceMetrics,
                               predicted_cpu: float, predicted_memory: float,
                               predicted_replicas: int, confidence: float) -> ScalingRecommendation:
        """Generate scaling recommendation based on predictions"""
        
        # Calculate resource recommendations
        cpu_utilization = current_metrics.cpu_usage / max(current_metrics.cpu_requests, 0.001)
        memory_utilization = current_metrics.memory_usage / max(current_metrics.memory_requests, 1)
        
        # Recommend CPU request adjustment
        target_cpu_utilization = 0.7  # Target 70% utilization
        recommended_cpu = current_metrics.cpu_requests
        if cpu_utilization > 0.8:  # Over 80% utilization
            recommended_cpu = current_metrics.cpu_requests * 1.2
        elif cpu_utilization < 0.3:  # Under 30% utilization
            recommended_cpu = current_metrics.cpu_requests * 0.8
            
        # Recommend memory request adjustment
        target_memory_utilization = 0.7
        recommended_memory = current_metrics.memory_requests
        if memory_utilization > 0.8:
            recommended_memory = current_metrics.memory_requests * 1.2
        elif memory_utilization < 0.3:
            recommended_memory = current_metrics.memory_requests * 0.8
        
        # Generate reasoning
        reasoning_parts = []
        if predicted_replicas != current_metrics.pod_count:
            reasoning_parts.append(f"Replica count change from {current_metrics.pod_count} to {predicted_replicas}")
        if abs(recommended_cpu - current_metrics.cpu_requests) > 0.05:
            reasoning_parts.append(f"CPU request adjustment due to {cpu_utilization:.1%} utilization")
        if abs(recommended_memory - current_metrics.memory_requests) > 10:
            reasoning_parts.append(f"Memory request adjustment due to {memory_utilization:.1%} utilization")
            
        reasoning = "; ".join(reasoning_parts) if reasoning_parts else "No changes recommended"
        
        # Estimate cost impact (simplified)
        replica_cost_change = (predicted_replicas - current_metrics.pod_count) * 0.05  # $0.05 per replica per hour
        cpu_cost_change = (recommended_cpu - current_metrics.cpu_requests) * current_metrics.pod_count * 0.02
        memory_cost_change = (recommended_memory - current_metrics.memory_requests) * current_metrics.pod_count * 0.001
        
        estimated_cost_impact = replica_cost_change + cpu_cost_change + memory_cost_change
        
        return ScalingRecommendation(
            deployment=current_metrics.deployment,
            namespace=current_metrics.namespace,
            current_replicas=current_metrics.pod_count,
            recommended_replicas=predicted_replicas,
            current_cpu_request=f"{current_metrics.cpu_requests:.3f}",
            recommended_cpu_request=f"{recommended_cpu:.3f}",
            current_memory_request=f"{current_metrics.memory_requests:.0f}Mi",
            recommended_memory_request=f"{recommended_memory:.0f}Mi",
            confidence=confidence,
            reasoning=reasoning,
            estimated_cost_impact=estimated_cost_impact
        )
    
    def _models_loaded(self) -> bool:
        """Check if models are loaded"""
        return (self.cpu_model is not None and 
                self.memory_model is not None and 
                self.replica_model is not None and 
                self.scaler is not None)
    
    def _save_models(self) -> None:
        """Save trained models"""
        model_data = {
            'cpu_model': self.cpu_model,
            'memory_model': self.memory_model,
            'replica_model': self.replica_model,
            'scaler': self.scaler,
            'feature_columns': self.feature_columns
        }
        joblib.dump(model_data, self.model_path)
    
    def _load_models(self) -> None:
        """Load trained models"""
        try:
            if os.path.exists(self.model_path):
                model_data = joblib.load(self.model_path)
                self.cpu_model = model_data['cpu_model']
                self.memory_model = model_data['memory_model']
                self.replica_model = model_data['replica_model']
                self.scaler = model_data['scaler']
                self.feature_columns = model_data['feature_columns']
            else:
                self._initialize_default_models()
        except Exception as e:
            self.logger.warning(f"Could not load models: {str(e)}, using defaults")
            self._initialize_default_models()
    
    def _initialize_default_models(self) -> None:
        """Initialize with default models"""
        # Create dummy training data for initial models
        dummy_data = pd.DataFrame({
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
        
        self.train_models(dummy_data)


class KubernetesScaler:
    """Handles actual scaling operations in Kubernetes"""
    
    def __init__(self, apps_v1_client):
        self.apps_v1 = apps_v1_client
        self.logger = logging.getLogger("k8s.scaler")
    
    async def scale_deployment(self, namespace: str, deployment_name: str, 
                             replicas: int) -> bool:
        """Scale deployment to specified replica count"""
        try:
            if not self.apps_v1:
                self.logger.warning("Kubernetes client not available, simulating scale operation")
                return True
                
            # Get current deployment
            deployment = self.apps_v1.read_namespaced_deployment(
                name=deployment_name, 
                namespace=namespace
            )
            
            # Update replica count
            deployment.spec.replicas = replicas
            
            # Apply the change
            self.apps_v1.patch_namespaced_deployment(
                name=deployment_name,
                namespace=namespace,
                body=deployment
            )
            
            self.logger.info(f"Scaled deployment {namespace}/{deployment_name} to {replicas} replicas")
            return True
            
        except Exception as e:
            self.logger.error(f"Error scaling deployment {namespace}/{deployment_name}: {str(e)}")
            return False
    
    async def update_resource_requests(self, namespace: str, deployment_name: str,
                                     cpu_request: str, memory_request: str) -> bool:
        """Update resource requests for deployment"""
        try:
            if not self.apps_v1:
                self.logger.warning("Kubernetes client not available, simulating resource update")
                return True
                
            # Get current deployment
            deployment = self.apps_v1.read_namespaced_deployment(
                name=deployment_name,
                namespace=namespace
            )
            
            # Update resource requests for all containers
            for container in deployment.spec.template.spec.containers:
                if not container.resources:
                    container.resources = client.V1ResourceRequirements()
                if not container.resources.requests:
                    container.resources.requests = {}
                    
                container.resources.requests['cpu'] = cpu_request
                container.resources.requests['memory'] = memory_request
            
            # Apply the change
            self.apps_v1.patch_namespaced_deployment(
                name=deployment_name,
                namespace=namespace,
                body=deployment
            )
            
            self.logger.info(f"Updated resources for {namespace}/{deployment_name}: CPU={cpu_request}, Memory={memory_request}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error updating resources for {namespace}/{deployment_name}: {str(e)}")
            return False


class KubernetesAgent(BaseAgent):
    """
    AI Agent for Kubernetes cluster management
    
    Handles predictive scaling, resource optimization, and cluster monitoring
    """
    
    def __init__(self, agent_id: str, event_bus, config_service, audit_service):
        super().__init__(agent_id, event_bus, config_service, audit_service)
        
        # Kubernetes-specific components
        self.metrics_collector: Optional[KubernetesMetricsCollector] = None
        self.scaling_model: Optional[PredictiveScalingModel] = None
        self.scaler: Optional[KubernetesScaler] = None
        
        # Configuration
        self.kubeconfig_path: Optional[str] = None
        self.monitoring_interval = 60  # 1 minute
        self.scaling_threshold = 0.7  # Scale when confidence > 70%
        self.monitored_namespaces: List[str] = ["default", "production", "staging"]
        
        # State tracking
        self.metrics_history: Dict[str, List[ResourceMetrics]] = {}
        self.scaling_history: List[Dict[str, Any]] = []
        self.last_scaling_decisions: Dict[str, datetime] = {}
        
        # Background tasks
        self._monitoring_task: Optional[asyncio.Task] = None
        
    async def _initialize_agent_specific(self) -> None:
        """Initialize Kubernetes-specific components"""
        try:
            if not self.config:
                raise RuntimeError("No configuration provided")
            
            # Extract Kubernetes configuration
            k8s_config = None
            for integration in self.config.integrations:
                if integration.type == "kubernetes":
                    k8s_config = integration.config
                    break
            
            if not k8s_config:
                raise RuntimeError("No Kubernetes integration configuration found")
            
            # Set up configuration
            self.kubeconfig_path = k8s_config.get("kubeconfig_path")
            self.monitored_namespaces = k8s_config.get("namespaces", ["default"])
            
            # Initialize metrics collector
            self.metrics_collector = KubernetesMetricsCollector(self.kubeconfig_path)
            await self.metrics_collector.initialize()
            
            # Initialize scaling model
            model_path = k8s_config.get("model_path")
            self.scaling_model = PredictiveScalingModel(model_path)
            
            # Initialize scaler
            if self.metrics_collector.apps_v1:
                self.scaler = KubernetesScaler(self.metrics_collector.apps_v1)
            
            # Load configuration thresholds
            self.monitoring_interval = self.config.thresholds.get("monitoring_interval", 60)
            self.scaling_threshold = self.config.thresholds.get("scaling_threshold", 0.7)
            
            self.logger.info("Kubernetes agent initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Kubernetes agent: {str(e)}")
            raise
    
    async def _start_agent_specific(self) -> None:
        """Start Kubernetes-specific monitoring"""
        try:
            # Start monitoring task
            self._monitoring_task = asyncio.create_task(
                self._monitoring_loop()
            )
            
            self.logger.info("Kubernetes agent started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start Kubernetes agent: {str(e)}")
            raise
    
    async def _stop_agent_specific(self) -> None:
        """Stop Kubernetes-specific monitoring"""
        try:
            # Cancel monitoring task
            if self._monitoring_task:
                self._monitoring_task.cancel()
                try:
                    await self._monitoring_task
                except asyncio.CancelledError:
                    pass
            
            self.logger.info("Kubernetes agent stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping Kubernetes agent: {str(e)}")
    
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        """Process Kubernetes-related events"""
        try:
            if event.type == EventType.SCALING_REQUIRED:
                return await self._handle_scaling_event(event)
            elif event.type == EventType.RESOURCE_ANOMALY:
                return await self._handle_resource_anomaly_event(event)
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error processing event {event.id}: {str(e)}")
            return None
    
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        """Execute Kubernetes-specific actions"""
        try:
            if action.type == ActionType.K8S_SCALE:
                return await self._execute_scaling_action(action)
            elif action.type == ActionType.K8S_RESTART:
                return await self._execute_restart_action(action)
            else:
                return ActionResult(
                    success=False,
                    message=f"Unsupported action type: {action.type}",
                    error="Action type not supported by Kubernetes agent"
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Action execution failed",
                error=str(e)
            )
    
    async def _reload_config_specific(self, old_config: Optional[AgentConfig], new_config: AgentConfig) -> None:
        """Reload Kubernetes-specific configuration"""
        try:
            # Reinitialize with new configuration
            await self._initialize_agent_specific()
            
            self.logger.info("Kubernetes agent configuration reloaded")
            
        except Exception as e:
            self.logger.error(f"Failed to reload Kubernetes agent config: {str(e)}")
            raise
    
    def _get_subscribed_event_types(self) -> List[EventType]:
        """Return event types this agent subscribes to"""
        return [EventType.SCALING_REQUIRED, EventType.RESOURCE_ANOMALY]
    
    async def _monitoring_loop(self) -> None:
        """Background task for continuous cluster monitoring"""
        while self.is_running:
            try:
                await self._collect_and_analyze_metrics()
                await asyncio.sleep(self.monitoring_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {str(e)}")
                await asyncio.sleep(self.monitoring_interval)
    
    async def _collect_and_analyze_metrics(self) -> None:
        """Collect metrics and analyze for scaling opportunities"""
        try:
            if not self.metrics_collector or not self.scaling_model:
                return
            
            self.logger.debug("Collecting Kubernetes metrics")
            
            # Collect metrics for all monitored namespaces
            all_metrics = []
            for namespace in self.monitored_namespaces:
                metrics = await self.metrics_collector.get_pod_metrics(namespace)
                all_metrics.extend(metrics)
            
            # Group metrics by deployment
            deployment_metrics = {}
            for metric in all_metrics:
                key = f"{metric.namespace}/{metric.deployment}"
                if key not in deployment_metrics:
                    deployment_metrics[key] = []
                deployment_metrics[key].append(metric)
            
            # Analyze each deployment for scaling opportunities
            for deployment_key, metrics in deployment_metrics.items():
                await self._analyze_deployment_scaling(deployment_key, metrics)
                
        except Exception as e:
            self.logger.error(f"Error collecting and analyzing metrics: {str(e)}")
    
    async def _analyze_deployment_scaling(self, deployment_key: str, 
                                        current_metrics: List[ResourceMetrics]) -> None:
        """Analyze a specific deployment for scaling opportunities"""
        try:
            if not current_metrics:
                return
                
            # Get the latest metrics
            latest_metric = max(current_metrics, key=lambda m: m.timestamp)
            
            # Get historical metrics for this deployment
            if deployment_key not in self.metrics_history:
                self.metrics_history[deployment_key] = []
            
            # Add current metrics to history
            self.metrics_history[deployment_key].extend(current_metrics)
            
            # Keep only last 24 hours of metrics
            cutoff_time = datetime.utcnow() - timedelta(hours=24)
            self.metrics_history[deployment_key] = [
                m for m in self.metrics_history[deployment_key] 
                if m.timestamp > cutoff_time
            ]
            
            # Get scaling recommendation
            recommendation = self.scaling_model.predict_scaling_needs(
                latest_metric, 
                self.metrics_history[deployment_key]
            )
            
            # Check if scaling is needed and confidence is high enough
            if self._should_scale(recommendation):
                await self._create_scaling_event(recommendation)
                
        except Exception as e:
            self.logger.error(f"Error analyzing deployment {deployment_key}: {str(e)}")
    
    def _should_scale(self, recommendation: ScalingRecommendation) -> bool:
        """Determine if scaling should be performed based on recommendation"""
        # Check confidence threshold
        if recommendation.confidence < self.scaling_threshold:
            return False
        
        # Check if significant change is recommended
        replica_change = abs(recommendation.recommended_replicas - recommendation.current_replicas)
        if replica_change == 0:
            # Check resource changes
            current_cpu = float(recommendation.current_cpu_request)
            recommended_cpu = float(recommendation.recommended_cpu_request)
            cpu_change_pct = abs(recommended_cpu - current_cpu) / max(current_cpu, 0.001)
            
            current_memory = float(recommendation.current_memory_request.replace('Mi', ''))
            recommended_memory = float(recommendation.recommended_memory_request.replace('Mi', ''))
            memory_change_pct = abs(recommended_memory - current_memory) / max(current_memory, 1)
            
            if cpu_change_pct < 0.1 and memory_change_pct < 0.1:  # Less than 10% change
                return False
        
        # Check cooldown period (don't scale too frequently)
        deployment_key = f"{recommendation.namespace}/{recommendation.deployment}"
        if deployment_key in self.last_scaling_decisions:
            last_scaling = self.last_scaling_decisions[deployment_key]
            if (datetime.utcnow() - last_scaling).total_seconds() < 300:  # 5 minute cooldown
                return False
        
        return True
    
    async def _create_scaling_event(self, recommendation: ScalingRecommendation) -> None:
        """Create a scaling event based on recommendation"""
        try:
            event = SystemEvent(
                id=f"k8s_scaling_{self.agent_id}_{int(datetime.utcnow().timestamp())}",
                type=EventType.SCALING_REQUIRED,
                source=self.agent_id,
                severity=self._assess_scaling_severity(recommendation),
                data={
                    "recommendation": recommendation.__dict__,
                    "deployment": f"{recommendation.namespace}/{recommendation.deployment}"
                }
            )
            
            await self.event_bus.publish_event(event)
            
        except Exception as e:
            self.logger.error(f"Error creating scaling event: {str(e)}")
    
    def _assess_scaling_severity(self, recommendation: ScalingRecommendation) -> str:
        """Assess the severity of scaling recommendation"""
        replica_change_pct = abs(recommendation.recommended_replicas - recommendation.current_replicas) / max(recommendation.current_replicas, 1)
        
        if replica_change_pct >= 1.0:  # 100% or more change
            return "high"
        elif replica_change_pct > 0.5:  # More than 50% change
            return "medium"
        else:
            return "low"
    
    async def _handle_scaling_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Handle scaling required event"""
        try:
            recommendation_data = event.data.get("recommendation", {})
            recommendation = ScalingRecommendation(**recommendation_data)
            
            # Determine action type based on automation level
            if self.config.automation_level.value == "full_auto" and recommendation.confidence > 0.8:
                # Auto-scale if high confidence
                risk_level = RiskLevel.LOW
                description = f"Auto-scaling {recommendation.deployment} (confidence: {recommendation.confidence:.2f})"
            else:
                # Require approval for scaling
                risk_level = RiskLevel.MEDIUM if recommendation.confidence > 0.6 else RiskLevel.HIGH
                description = f"Scaling recommendation for {recommendation.deployment} (confidence: {recommendation.confidence:.2f})"
            
            action = AgentAction(
                id=f"k8s_scale_{int(datetime.utcnow().timestamp())}",
                agent_id=self.agent_id,
                type=ActionType.K8S_SCALE,
                description=description,
                target_resources=[f"{recommendation.namespace}/{recommendation.deployment}"],
                risk_level=risk_level,
                estimated_impact=f"Replicas: {recommendation.current_replicas} → {recommendation.recommended_replicas}; {recommendation.reasoning}",
                metadata={
                    "recommendation": recommendation.__dict__,
                    "event_id": event.id
                }
            )
            
            return action
            
        except Exception as e:
            self.logger.error(f"Error handling scaling event: {str(e)}")
            return None
    
    async def _handle_resource_anomaly_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Handle resource anomaly event"""
        try:
            anomaly_data = event.data
            deployment = anomaly_data.get("deployment", "unknown")
            namespace = anomaly_data.get("namespace", "default")
            
            action = AgentAction(
                id=f"k8s_restart_{int(datetime.utcnow().timestamp())}",
                agent_id=self.agent_id,
                type=ActionType.K8S_RESTART,
                description=f"Restart deployment {deployment} due to resource anomaly",
                target_resources=[f"{namespace}/{deployment}"],
                risk_level=RiskLevel.MEDIUM,
                estimated_impact="Temporary service disruption during pod restart",
                metadata={
                    "anomaly_data": anomaly_data,
                    "event_id": event.id
                }
            )
            
            return action
            
        except Exception as e:
            self.logger.error(f"Error handling resource anomaly event: {str(e)}")
            return None
    
    async def _execute_scaling_action(self, action: AgentAction) -> ActionResult:
        """Execute scaling action"""
        try:
            if not self.scaler:
                return ActionResult(
                    success=False,
                    message="Kubernetes scaler not available",
                    error="Scaler not initialized"
                )
            
            recommendation_data = action.metadata.get("recommendation", {})
            recommendation = ScalingRecommendation(**recommendation_data)
            
            # Record scaling decision
            deployment_key = f"{recommendation.namespace}/{recommendation.deployment}"
            self.last_scaling_decisions[deployment_key] = datetime.utcnow()
            
            # Perform scaling operations
            results = []
            
            # Scale replicas if needed
            if recommendation.recommended_replicas != recommendation.current_replicas:
                replica_success = await self.scaler.scale_deployment(
                    recommendation.namespace,
                    recommendation.deployment,
                    recommendation.recommended_replicas
                )
                results.append(f"Replica scaling: {'success' if replica_success else 'failed'}")
            
            # Update resource requests if needed
            if (recommendation.recommended_cpu_request != recommendation.current_cpu_request or
                recommendation.recommended_memory_request != recommendation.current_memory_request):
                resource_success = await self.scaler.update_resource_requests(
                    recommendation.namespace,
                    recommendation.deployment,
                    recommendation.recommended_cpu_request,
                    recommendation.recommended_memory_request
                )
                results.append(f"Resource update: {'success' if resource_success else 'failed'}")
            
            # Record scaling history
            scaling_record = {
                "timestamp": datetime.utcnow().isoformat(),
                "deployment": deployment_key,
                "action": action.id,
                "recommendation": recommendation.__dict__,
                "results": results
            }
            self.scaling_history.append(scaling_record)
            
            # Keep only last 100 scaling records
            if len(self.scaling_history) > 100:
                self.scaling_history = self.scaling_history[-100:]
            
            success = all("success" in result for result in results)
            
            return ActionResult(
                success=success,
                message=f"Scaling action completed: {'; '.join(results)}",
                data={
                    "scaling_record": scaling_record,
                    "recommendation": recommendation.__dict__
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute scaling action",
                error=str(e)
            )
    
    async def _execute_restart_action(self, action: AgentAction) -> ActionResult:
        """Execute restart action"""
        try:
            if not self.scaler:
                return ActionResult(
                    success=False,
                    message="Kubernetes scaler not available",
                    error="Scaler not initialized"
                )
            
            # Extract deployment info from target resources
            target_resource = action.target_resources[0]  # Format: namespace/deployment
            namespace, deployment = target_resource.split('/')
            
            # Restart by scaling to 0 then back to original replica count
            # First get current replica count
            deployments = await self.metrics_collector.get_deployments(namespace)
            current_replicas = 1  # Default
            
            for dep in deployments:
                if dep["name"] == deployment:
                    current_replicas = dep["replicas"]
                    break
            
            # Scale to 0
            scale_down_success = await self.scaler.scale_deployment(namespace, deployment, 0)
            
            if scale_down_success:
                # Wait a moment
                await asyncio.sleep(5)
                
                # Scale back up
                scale_up_success = await self.scaler.scale_deployment(namespace, deployment, current_replicas)
                
                if scale_up_success:
                    return ActionResult(
                        success=True,
                        message=f"Successfully restarted deployment {namespace}/{deployment}",
                        data={"original_replicas": current_replicas}
                    )
                else:
                    return ActionResult(
                        success=False,
                        message="Failed to scale deployment back up after restart",
                        error="Scale up operation failed"
                    )
            else:
                return ActionResult(
                    success=False,
                    message="Failed to scale deployment down for restart",
                    error="Scale down operation failed"
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute restart action",
                error=str(e)
            )