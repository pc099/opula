"""
Cost Optimization Agent implementation for the AIOps Platform

This agent handles:
- Cloud resource utilization analysis and monitoring
- Cost optimization recommendation engine
- Automated right-sizing and resource cleanup
- Cost forecasting and budget alert functionality
"""
import asyncio
import json
import logging
import joblib
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum

from ..core.base_agent import BaseAgent
from ..core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, ActionStatus
)


class OptimizationType(str, Enum):
    """Types of cost optimizations"""
    RIGHT_SIZING = "right_sizing"
    RESERVED_INSTANCES = "reserved_instances"
    STORAGE_OPTIMIZATION = "storage_optimization"
    RESOURCE_CLEANUP = "resource_cleanup"
    SCHEDULING = "scheduling"


class CloudProvider(str, Enum):
    """Supported cloud providers"""
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"


@dataclass
class ResourceUtilization:
    """Resource utilization data"""
    resource_id: str
    resource_type: str
    provider: CloudProvider
    cpu_utilization: float
    memory_utilization: float
    network_utilization: float
    storage_utilization: float
    cost_per_hour: float
    timestamp: datetime


@dataclass
class CostOptimizationRecommendation:
    """Cost optimization recommendation"""
    id: str
    type: OptimizationType
    title: str
    description: str
    potential_savings: float
    confidence: float
    risk_level: RiskLevel
    affected_resources: List[str]
    implementation_steps: List[str]
    estimated_duration: str
    rollback_possible: bool
    priority: str
    created_at: datetime


class CloudResourceMonitor:
    """Monitor cloud resources for utilization and cost data"""
    
    def __init__(self, provider: CloudProvider, credentials: Dict[str, Any]):
        self.provider = provider
        self.credentials = credentials
        self.logger = logging.getLogger(f"{__name__}.CloudResourceMonitor")
    
    async def get_resource_utilization(self, hours_back: int = 24) -> List[ResourceUtilization]:
        """Get resource utilization data for the specified time period"""
        try:
            # Mock implementation - in real scenario, would call cloud provider APIs
            mock_data = []
            
            if self.provider == CloudProvider.AWS:
                mock_data = [
                    ResourceUtilization(
                        resource_id="i-1234567890abcdef0",
                        resource_type="ec2.instance",
                        provider=self.provider,
                        cpu_utilization=15.5,
                        memory_utilization=25.3,
                        network_utilization=8.2,
                        storage_utilization=45.0,
                        cost_per_hour=0.096,
                        timestamp=datetime.utcnow() - timedelta(hours=1)
                    ),
                    ResourceUtilization(
                        resource_id="i-0987654321fedcba0",
                        resource_type="ec2.instance",
                        provider=self.provider,
                        cpu_utilization=85.2,
                        memory_utilization=78.9,
                        network_utilization=65.4,
                        storage_utilization=82.1,
                        cost_per_hour=0.192,
                        timestamp=datetime.utcnow() - timedelta(hours=1)
                    )
                ]
            
            return mock_data
            
        except Exception as e:
            self.logger.error(f"Error getting resource utilization: {str(e)}")
            return []
    
    async def get_cost_data(self, days_back: int = 30) -> Dict[str, Any]:
        """Get cost data for the specified time period"""
        try:
            # Mock implementation - in real scenario, would call cloud billing APIs
            mock_cost_data = {
                "total_cost": 5000.0,
                "daily_costs": [
                    {"date": (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d"), 
                     "cost": 150.0 + (i * 5)} 
                    for i in range(days_back)
                ],
                "service_breakdown": {
                    "compute": 3000.0,
                    "storage": 1500.0,
                    "network": 500.0
                }
            }
            
            return mock_cost_data
            
        except Exception as e:
            self.logger.error(f"Error getting cost data: {str(e)}")
            return {}


class CostOptimizationEngine:
    """Engine for analyzing utilization and generating cost optimization recommendations"""
    
    def __init__(self, utilization_threshold_low: float = 20.0, utilization_threshold_high: float = 80.0):
        self.utilization_threshold_low = utilization_threshold_low
        self.utilization_threshold_high = utilization_threshold_high
        self.logger = logging.getLogger(f"{__name__}.CostOptimizationEngine")
    
    async def analyze_utilization(self, utilization_data: List[ResourceUtilization]) -> List[CostOptimizationRecommendation]:
        """Analyze resource utilization and generate optimization recommendations"""
        try:
            recommendations = []
            
            for resource in utilization_data:
                # Check for right-sizing opportunities
                if (resource.cpu_utilization < self.utilization_threshold_low or 
                    resource.memory_utilization < self.utilization_threshold_low):
                    
                    # Calculate potential savings (mock calculation)
                    potential_savings = resource.cost_per_hour * 24 * 30 * 0.5  # 50% savings
                    
                    recommendation = CostOptimizationRecommendation(
                        id=f"rightsizing_{resource.resource_id}_{int(datetime.utcnow().timestamp())}",
                        type=OptimizationType.RIGHT_SIZING,
                        title=f"Right-size {resource.resource_type}",
                        description=f"Resource {resource.resource_id} is under-utilized (CPU: {resource.cpu_utilization}%, Memory: {resource.memory_utilization}%)",
                        potential_savings=potential_savings,
                        confidence=0.85,
                        risk_level=RiskLevel.LOW,
                        affected_resources=[resource.resource_id],
                        implementation_steps=[
                            "Stop the resource",
                            "Change to smaller instance type",
                            "Start the resource",
                            "Monitor performance"
                        ],
                        estimated_duration="30 minutes",
                        rollback_possible=True,
                        priority="medium",
                        created_at=datetime.utcnow()
                    )
                    
                    recommendations.append(recommendation)
                
                # Check for storage optimization
                if resource.storage_utilization < 30.0:
                    potential_savings = resource.cost_per_hour * 24 * 30 * 0.2  # 20% savings
                    
                    recommendation = CostOptimizationRecommendation(
                        id=f"storage_{resource.resource_id}_{int(datetime.utcnow().timestamp())}",
                        type=OptimizationType.STORAGE_OPTIMIZATION,
                        title=f"Optimize storage for {resource.resource_type}",
                        description=f"Storage utilization is low ({resource.storage_utilization}%) for {resource.resource_id}",
                        potential_savings=potential_savings,
                        confidence=0.75,
                        risk_level=RiskLevel.LOW,
                        affected_resources=[resource.resource_id],
                        implementation_steps=[
                            "Analyze storage usage patterns",
                            "Resize or change storage type",
                            "Verify data integrity"
                        ],
                        estimated_duration="15 minutes",
                        rollback_possible=True,
                        priority="low",
                        created_at=datetime.utcnow()
                    )
                    
                    recommendations.append(recommendation)
            
            return recommendations
            
        except Exception as e:
            self.logger.error(f"Error analyzing utilization: {str(e)}")
            return []


class CostForecastingModel:
    """ML model for cost forecasting and budget alerts"""
    
    def __init__(self, model_path: str = "cost_forecasting_model.joblib"):
        self.model_path = model_path
        self.model = None
        self.feature_columns = [
            'daily_cost', 'cpu_utilization_avg', 'memory_utilization_avg', 
            'resource_count', 'day_of_week', 'month'
        ]
        self.logger = logging.getLogger(f"{__name__}.CostForecastingModel")
        
        # Try to load existing model
        try:
            self.model = joblib.load(model_path)
        except FileNotFoundError:
            self.logger.warning(f"Model file {model_path} not found, using mock predictions")
            self.model = None
    
    def forecast_costs(self, current_data: Dict[str, Any], days_ahead: int = 7) -> List[Dict[str, Any]]:
        """Forecast costs for the specified number of days ahead"""
        try:
            forecasts = []
            base_cost = current_data.get('daily_cost', 500.0)
            
            for i in range(days_ahead):
                future_date = datetime.utcnow() + timedelta(days=i+1)
                
                if self.model is not None:
                    # Use actual ML model if available
                    features = self._prepare_features(current_data, future_date)
                    predicted_cost = self.model.predict([features])[0]
                    confidence = 0.85
                else:
                    # Mock prediction with some variation
                    variation = np.random.normal(0, 0.1)  # 10% standard deviation
                    predicted_cost = base_cost * (1 + variation)
                    confidence = 0.70
                
                forecasts.append({
                    'date': future_date.strftime('%Y-%m-%d'),
                    'predicted_cost': max(0, predicted_cost),
                    'confidence': confidence
                })
            
            return forecasts
            
        except Exception as e:
            self.logger.error(f"Error forecasting costs: {str(e)}")
            return []
    
    def check_budget_alerts(self, current_spend: float, budget: float, 
                          forecasted_costs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Check for budget alerts based on current spend and forecasts"""
        try:
            alerts = []
            
            # Calculate projected monthly spend
            total_forecasted = sum(forecast['predicted_cost'] for forecast in forecasted_costs)
            projected_monthly_spend = current_spend + total_forecasted
            
            # Check various alert thresholds
            if projected_monthly_spend > budget:
                alerts.append({
                    'level': 'critical',
                    'message': f'Projected monthly spend (${projected_monthly_spend:.2f}) exceeds budget (${budget:.2f})',
                    'current_spend': current_spend,
                    'projected_spend': projected_monthly_spend,
                    'budget': budget,
                    'overage': projected_monthly_spend - budget
                })
            elif projected_monthly_spend > budget * 0.9:
                alerts.append({
                    'level': 'warning',
                    'message': f'Projected monthly spend (${projected_monthly_spend:.2f}) is approaching budget limit (${budget:.2f})',
                    'current_spend': current_spend,
                    'projected_spend': projected_monthly_spend,
                    'budget': budget,
                    'percentage_used': (projected_monthly_spend / budget) * 100
                })
            elif projected_monthly_spend > budget * 0.8:
                alerts.append({
                    'level': 'info',
                    'message': f'Projected monthly spend (${projected_monthly_spend:.2f}) is at 80% of budget (${budget:.2f})',
                    'current_spend': current_spend,
                    'projected_spend': projected_monthly_spend,
                    'budget': budget,
                    'percentage_used': (projected_monthly_spend / budget) * 100
                })
            
            return alerts
            
        except Exception as e:
            self.logger.error(f"Error checking budget alerts: {str(e)}")
            return []
    
    def _prepare_features(self, current_data: Dict[str, Any], future_date: datetime) -> List[float]:
        """Prepare features for ML model prediction"""
        features = []
        
        for column in self.feature_columns:
            if column == 'day_of_week':
                features.append(float(future_date.weekday()))
            elif column == 'month':
                features.append(float(future_date.month))
            else:
                features.append(float(current_data.get(column, 0.0)))
        
        return features


class CostOptimizationAgent(BaseAgent):
    """
    AI Agent for cloud cost optimization
    
    Handles resource utilization analysis, cost optimization recommendations,
    automated right-sizing, resource cleanup, and cost forecasting
    """
    
    def __init__(self, agent_id: str, event_bus, config_service, audit_service):
        super().__init__(agent_id, event_bus, config_service, audit_service)
        
        # Configuration
        self.monitoring_interval = 3600  # 1 hour
        self.optimization_threshold = 100.0  # Minimum savings to trigger optimization
        self.auto_apply_threshold = 0.9  # Auto-apply if confidence > 90%
        
        # State tracking
        self.last_analysis: Optional[datetime] = None
        self.active_recommendations: List[CostOptimizationRecommendation] = []
        self.cost_history: List[Dict[str, Any]] = []
        
        # Core components
        self.resource_monitors: Dict[CloudProvider, CloudResourceMonitor] = {}
        self.optimization_engine: Optional[CostOptimizationEngine] = None
        self.forecasting_model: Optional[CostForecastingModel] = None
        
        # Background tasks
        self._monitoring_task: Optional[asyncio.Task] = None
    
    async def _initialize_agent_specific(self) -> None:
        """Initialize cost optimization specific components"""
        try:
            if not self.config:
                raise RuntimeError("No configuration provided")
            
            # Load configuration thresholds
            self.monitoring_interval = self.config.thresholds.get("monitoring_interval", 3600)
            self.optimization_threshold = self.config.thresholds.get("optimization_threshold", 100.0)
            self.auto_apply_threshold = self.config.thresholds.get("auto_apply_threshold", 0.9)
            
            # Initialize resource monitors for each configured provider
            cost_integration = None
            for integration in self.config.integrations:
                if integration.name == "cost_optimization":
                    cost_integration = integration
                    break
            
            if cost_integration and cost_integration.config:
                providers = cost_integration.config.get("providers", [])
                for provider_config in providers:
                    provider_name = provider_config.get("name")
                    credentials = provider_config.get("credentials", {})
                    
                    if provider_name in ["aws", "azure", "gcp"]:
                        provider = CloudProvider(provider_name)
                        self.resource_monitors[provider] = CloudResourceMonitor(provider, credentials)
            
            # Initialize optimization engine
            utilization_low = self.config.thresholds.get("utilization_threshold_low", 20.0)
            utilization_high = self.config.thresholds.get("utilization_threshold_high", 80.0)
            self.optimization_engine = CostOptimizationEngine(utilization_low, utilization_high)
            
            # Initialize forecasting model
            model_path = "cost_forecasting_model.joblib"
            if cost_integration and cost_integration.config:
                model_path = cost_integration.config.get("forecasting_model_path", model_path)
            self.forecasting_model = CostForecastingModel(model_path)
            
            self.logger.info("Cost optimization agent initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize cost optimization agent: {str(e)}")
            raise
    
    async def _start_agent_specific(self) -> None:
        """Start cost optimization specific monitoring"""
        try:
            # Start resource monitoring task
            self._monitoring_task = asyncio.create_task(
                self._resource_monitoring_loop()
            )
            
            self.logger.info("Cost optimization agent started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start cost optimization agent: {str(e)}")
            raise
    
    async def _stop_agent_specific(self) -> None:
        """Stop cost optimization specific monitoring"""
        try:
            # Cancel monitoring task
            if self._monitoring_task:
                self._monitoring_task.cancel()
                try:
                    await self._monitoring_task
                except asyncio.CancelledError:
                    pass
            
            self.logger.info("Cost optimization agent stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping cost optimization agent: {str(e)}")
    
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        """Process cost optimization related events"""
        try:
            if event.type == EventType.COST_THRESHOLD_EXCEEDED:
                return await self._handle_cost_threshold_event(event)
            elif event.type == EventType.RESOURCE_ANOMALY:
                return await self._handle_resource_anomaly_event(event)
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error processing event {event.id}: {str(e)}")
            return None
    
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        """Execute cost optimization specific actions"""
        try:
            if action.type == ActionType.COST_OPTIMIZE:
                return await self._execute_cost_optimization(action)
            elif action.type == ActionType.RESOURCE_CLEANUP:
                return await self._execute_resource_cleanup(action)
            else:
                return ActionResult(
                    success=False,
                    message=f"Unsupported action type: {action.type}",
                    error="Action type not supported by cost optimization agent"
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Action execution failed",
                error=str(e)
            )
    
    async def _reload_config_specific(self, old_config: Optional[AgentConfig], new_config: AgentConfig) -> None:
        """Reload cost optimization specific configuration"""
        try:
            # Reinitialize with new configuration
            await self._initialize_agent_specific()
            
            self.logger.info("Cost optimization agent configuration reloaded")
            
        except Exception as e:
            self.logger.error(f"Failed to reload cost optimization agent config: {str(e)}")
            raise
    
    def _get_subscribed_event_types(self) -> List[EventType]:
        """Return event types this agent subscribes to"""
        return [EventType.COST_THRESHOLD_EXCEEDED, EventType.RESOURCE_ANOMALY]
    
    async def _resource_monitoring_loop(self) -> None:
        """Background task for continuous resource monitoring"""
        while self.is_running:
            try:
                await self._analyze_resource_utilization()
                await asyncio.sleep(self.monitoring_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in resource monitoring loop: {str(e)}")
                await asyncio.sleep(self.monitoring_interval)
    
    async def _analyze_resource_utilization(self) -> None:
        """Analyze resource utilization and generate recommendations"""
        try:
            self.logger.debug("Analyzing resource utilization")
            
            # Collect utilization data from all configured providers
            all_utilization_data = []
            for provider, monitor in self.resource_monitors.items():
                utilization_data = await monitor.get_resource_utilization(24)
                all_utilization_data.extend(utilization_data)
            
            # Generate recommendations using the optimization engine
            if self.optimization_engine and all_utilization_data:
                recommendations = await self.optimization_engine.analyze_utilization(all_utilization_data)
                
                # Process recommendations that meet the threshold
                for recommendation in recommendations:
                    if recommendation.potential_savings >= self.optimization_threshold:
                        self.active_recommendations.append(recommendation)
                        await self._create_cost_optimization_event(recommendation)
            
            # Update cost history and check budget alerts
            await self._update_cost_history()
            await self._check_budget_alerts()
            
            self.last_analysis = datetime.utcnow()
                
        except Exception as e:
            self.logger.error(f"Error analyzing resource utilization: {str(e)}")
    
    async def _create_cost_optimization_event(self, recommendation: CostOptimizationRecommendation) -> None:
        """Create a cost optimization event"""
        try:
            event = SystemEvent(
                id=f"cost_opt_{recommendation.id}",
                type=EventType.COST_THRESHOLD_EXCEEDED,
                source=self.agent_id,
                severity=self._assess_recommendation_severity(recommendation),
                data={
                    "recommendation": {
                        "id": recommendation.id,
                        "type": recommendation.type.value,
                        "title": recommendation.title,
                        "description": recommendation.description,
                        "potential_savings": recommendation.potential_savings,
                        "confidence": recommendation.confidence,
                        "risk_level": recommendation.risk_level.value,
                        "affected_resources": recommendation.affected_resources,
                        "priority": recommendation.priority
                    }
                }
            )
            
            await self.event_bus.publish_event(event)
            
        except Exception as e:
            self.logger.error(f"Error creating cost optimization event: {str(e)}")
    
    def _assess_recommendation_severity(self, recommendation: CostOptimizationRecommendation) -> str:
        """Assess the severity of a cost optimization recommendation"""
        if recommendation.potential_savings > 5000:
            return "critical"
        elif recommendation.potential_savings > 2000:
            return "high"
        elif recommendation.potential_savings > 500:
            return "medium"
        else:
            return "low"
    
    async def _handle_cost_threshold_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Handle cost threshold exceeded event"""
        try:
            event_data = event.data
            
            if "recommendation" in event_data:
                recommendation_data = event_data["recommendation"]
                
                # Determine if we should auto-apply based on confidence and automation level
                confidence = recommendation_data.get("confidence", 0.0)
                risk_level = RiskLevel(recommendation_data.get("risk_level", "medium"))
                
                should_auto_apply = (
                    self.config.automation_level.value == "full_auto" and
                    confidence >= self.auto_apply_threshold and
                    risk_level == RiskLevel.LOW
                )
                
                action_type = ActionType.COST_OPTIMIZE
                description = f"Apply cost optimization: {recommendation_data.get('title', 'Unknown')}"
                
                if not should_auto_apply:
                    description = f"Review cost optimization recommendation: {recommendation_data.get('title', 'Unknown')}"
                
                action = AgentAction(
                    id=f"cost_opt_action_{int(datetime.utcnow().timestamp())}",
                    agent_id=self.agent_id,
                    type=action_type,
                    description=description,
                    target_resources=recommendation_data.get("affected_resources", []),
                    risk_level=risk_level,
                    estimated_impact=f"Potential savings: ${recommendation_data.get('potential_savings', 0):.2f}",
                    metadata={
                        "recommendation_id": recommendation_data.get("id"),
                        "auto_apply": should_auto_apply,
                        "confidence": confidence,
                        "event_id": event.id
                    }
                )
                
                return action
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error handling cost threshold event: {str(e)}")
            return None
    
    async def _handle_resource_anomaly_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Handle resource anomaly event"""
        try:
            # Analyze if the anomaly indicates cost optimization opportunity
            anomaly_data = event.data
            
            # Create a resource cleanup action if anomaly indicates unused resources
            if anomaly_data.get("anomaly_type") == "low_utilization":
                action = AgentAction(
                    id=f"resource_cleanup_{int(datetime.utcnow().timestamp())}",
                    agent_id=self.agent_id,
                    type=ActionType.RESOURCE_CLEANUP,
                    description="Clean up under-utilized resources detected by anomaly",
                    target_resources=anomaly_data.get("affected_resources", []),
                    risk_level=RiskLevel.MEDIUM,
                    estimated_impact="Potential cost savings from removing unused resources",
                    metadata={
                        "anomaly_data": anomaly_data,
                        "event_id": event.id
                    }
                )
                
                return action
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error handling resource anomaly event: {str(e)}")
            return None
    
    async def _execute_cost_optimization(self, action: AgentAction) -> ActionResult:
        """Execute cost optimization action"""
        try:
            recommendation_id = action.metadata.get("recommendation_id")
            if not recommendation_id:
                return ActionResult(
                    success=False,
                    message="No recommendation ID provided",
                    error="Missing recommendation ID in action metadata"
                )
            
            # Find the recommendation
            recommendation = None
            for rec in self.active_recommendations:
                if rec.id == recommendation_id:
                    recommendation = rec
                    break
            
            if not recommendation:
                return ActionResult(
                    success=False,
                    message="Recommendation not found",
                    error=f"Could not find recommendation with ID: {recommendation_id}"
                )
            
            # Execute based on optimization type
            if recommendation.type == OptimizationType.RIGHT_SIZING:
                return await self._execute_right_sizing(action)
            elif recommendation.type == OptimizationType.STORAGE_OPTIMIZATION:
                return await self._execute_storage_optimization(action)
            else:
                # Generic optimization execution
                affected_resources = recommendation.affected_resources
                
                optimized_resources = []
                for resource_id in affected_resources:
                    # Simulate optimization
                    self.logger.info(f"Optimizing resource: {resource_id}")
                    optimized_resources.append(resource_id)
                
                return ActionResult(
                    success=True,
                    message=f"Successfully optimized {len(optimized_resources)} resources",
                    data={
                        "optimized_resources": optimized_resources,
                        "estimated_savings": recommendation.potential_savings,
                        "optimization_type": recommendation.type.value
                    }
                )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute cost optimization",
                error=str(e)
            )
    
    async def _execute_storage_optimization(self, action: AgentAction) -> ActionResult:
        """Execute storage optimization"""
        try:
            target_resources = action.target_resources
            
            if not target_resources:
                return ActionResult(
                    success=False,
                    message="No target resources specified for storage optimization",
                    error="Target resources list is empty"
                )
            
            # Mock implementation - in real scenario, would interact with cloud APIs
            optimized_resources = []
            failed_resources = []
            total_savings = 0.0
            
            for resource_id in target_resources:
                try:
                    # Simulate storage optimization
                    self.logger.info(f"Optimizing storage for resource: {resource_id}")
                    
                    # Mock savings calculation
                    estimated_savings = 25.0  # Mock savings per resource
                    total_savings += estimated_savings
                    
                    optimized_resources.append({
                        "resource_id": resource_id,
                        "old_storage_type": "gp2",  # Mock
                        "new_storage_type": "gp3",  # Mock
                        "estimated_savings": estimated_savings
                    })
                    
                except Exception as e:
                    self.logger.error(f"Failed to optimize storage for resource {resource_id}: {str(e)}")
                    failed_resources.append(resource_id)
            
            success = len(failed_resources) == 0
            message = f"Successfully optimized storage for {len(optimized_resources)} resources"
            if failed_resources:
                message += f", failed to optimize {len(failed_resources)} resources"
            
            return ActionResult(
                success=success,
                message=message,
                data={
                    "optimized_resources": optimized_resources,
                    "failed_resources": failed_resources,
                    "total_savings": total_savings,
                    "optimization_type": "storage_optimization"
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute storage optimization",
                error=str(e)
            )
    
    async def _execute_resource_cleanup(self, action: AgentAction) -> ActionResult:
        """Execute resource cleanup action"""
        try:
            target_resources = action.target_resources
            
            if not target_resources:
                return ActionResult(
                    success=False,
                    message="No target resources specified",
                    error="Target resources list is empty"
                )
            
            # Mock implementation - in real scenario, would interact with cloud APIs
            cleaned_resources = []
            failed_resources = []
            
            for resource_id in target_resources:
                try:
                    # Simulate resource cleanup
                    self.logger.info(f"Cleaning up resource: {resource_id}")
                    cleaned_resources.append(resource_id)
                except Exception as e:
                    self.logger.error(f"Failed to clean up resource {resource_id}: {str(e)}")
                    failed_resources.append(resource_id)
            
            success = len(failed_resources) == 0
            message = f"Cleaned up {len(cleaned_resources)} resources"
            if failed_resources:
                message += f", failed to clean up {len(failed_resources)} resources"
            
            return ActionResult(
                success=success,
                message=message,
                data={
                    "cleaned_resources": cleaned_resources,
                    "failed_resources": failed_resources,
                    "total_cleaned": len(cleaned_resources)
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute resource cleanup",
                error=str(e)
            )
    
    async def _update_cost_history(self) -> None:
        """Update cost history with current data"""
        try:
            # Collect cost data from all providers
            total_cost = 0.0
            cost_breakdown = {}
            
            for provider, monitor in self.resource_monitors.items():
                cost_data = await monitor.get_cost_data(1)  # Get today's cost
                if cost_data:
                    daily_costs = cost_data.get("daily_costs", [])
                    if daily_costs:
                        today_cost = daily_costs[0].get("cost", 0.0)
                        total_cost += today_cost
                        cost_breakdown[provider.value] = today_cost
            
            # Generate forecasts if we have the model
            forecasts = []
            if self.forecasting_model:
                current_data = {
                    'daily_cost': total_cost,
                    'cpu_utilization_avg': 50.0,  # Mock average
                    'memory_utilization_avg': 60.0,  # Mock average
                    'resource_count': len(self.resource_monitors) * 10  # Mock count
                }
                forecasts = self.forecasting_model.forecast_costs(current_data, 7)
            
            # Add to cost history
            cost_entry = {
                'date': datetime.utcnow().strftime('%Y-%m-%d'),
                'actual_cost': total_cost,
                'cost_breakdown': cost_breakdown,
                'forecasts': forecasts,
                'timestamp': datetime.utcnow()
            }
            
            self.cost_history.append(cost_entry)
            
            # Keep only last 30 days
            if len(self.cost_history) > 30:
                self.cost_history = self.cost_history[-30:]
                
        except Exception as e:
            self.logger.error(f"Error updating cost history: {str(e)}")
    
    async def _check_budget_alerts(self) -> None:
        """Check for budget alerts and create events if needed"""
        try:
            if not self.cost_history or not self.forecasting_model:
                return
            
            # Get budget limits from configuration
            cost_integration = None
            for integration in self.config.integrations:
                if integration.name == "cost_optimization":
                    cost_integration = integration
                    break
            
            if not cost_integration or not cost_integration.config:
                return
            
            budget_limits = cost_integration.config.get("budget_limits", {})
            
            # Calculate current month spend
            current_month = datetime.utcnow().strftime('%Y-%m')
            current_month_spend = sum(
                entry['actual_cost'] for entry in self.cost_history
                if entry['date'].startswith(current_month)
            )
            
            # Check each budget
            for budget_name, budget_limit in budget_limits.items():
                latest_entry = self.cost_history[-1]
                forecasts = latest_entry.get('forecasts', [])
                
                if forecasts:
                    alerts = self.forecasting_model.check_budget_alerts(
                        current_month_spend, budget_limit, forecasts
                    )
                    
                    # Create events for alerts
                    for alert in alerts:
                        await self._create_budget_alert_event(budget_name, alert)
                        
        except Exception as e:
            self.logger.error(f"Error checking budget alerts: {str(e)}")
    
    async def _create_budget_alert_event(self, budget_name: str, alert: Dict[str, Any]) -> None:
        """Create a budget alert event"""
        try:
            event = SystemEvent(
                id=f"budget_alert_{budget_name}_{int(datetime.utcnow().timestamp())}",
                type=EventType.COST_THRESHOLD_EXCEEDED,
                source=self.agent_id,
                severity=alert['level'],
                data={
                    "budget_alert": {
                        "budget_name": budget_name,
                        "level": alert['level'],
                        "message": alert['message'],
                        "current_spend": alert['current_spend'],
                        "projected_spend": alert['projected_spend'],
                        "budget": alert['budget']
                    }
                }
            )
            
            await self.event_bus.publish_event(event)
            
        except Exception as e:
            self.logger.error(f"Error creating budget alert event: {str(e)}")
    
    async def _execute_right_sizing(self, action: AgentAction) -> ActionResult:
        """Execute right-sizing optimization"""
        try:
            target_resources = action.target_resources
            
            if not target_resources:
                return ActionResult(
                    success=False,
                    message="No target resources specified for right-sizing",
                    error="Target resources list is empty"
                )
            
            # Mock implementation - in real scenario, would interact with cloud APIs
            resized_resources = []
            failed_resources = []
            total_savings = 0.0
            
            for resource_id in target_resources:
                try:
                    # Simulate right-sizing operation
                    self.logger.info(f"Right-sizing resource: {resource_id}")
                    
                    # Mock savings calculation
                    estimated_savings = 50.0  # Mock savings per resource
                    total_savings += estimated_savings
                    
                    resized_resources.append({
                        "resource_id": resource_id,
                        "old_type": "t3.large",  # Mock
                        "new_type": "t3.medium",  # Mock
                        "estimated_savings": estimated_savings
                    })
                    
                except Exception as e:
                    self.logger.error(f"Failed to right-size resource {resource_id}: {str(e)}")
                    failed_resources.append(resource_id)
            
            success = len(failed_resources) == 0
            message = f"Successfully right-sized {len(resized_resources)} resources"
            if failed_resources:
                message += f", failed to resize {len(failed_resources)} resources"
            
            return ActionResult(
                success=success,
                message=message,
                data={
                    "resized_resources": resized_resources,
                    "failed_resources": failed_resources,
                    "total_savings": total_savings,
                    "optimization_type": "right_sizing"
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute right-sizing",
                error=str(e)
            )