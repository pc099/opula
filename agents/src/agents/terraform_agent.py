"""
Terraform Agent implementation for the AIOps Platform

This agent handles:
- Terraform state monitoring and drift detection
- Automated plan generation and safe application workflows
- ML-based drift prediction using historical data
- Integration with Terraform Cloud and local state backends
"""
import asyncio
import json
import logging
import os
import tempfile
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import joblib
import python_terraform

from ..core.base_agent import BaseAgent
from ..core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, ActionStatus
)


class TerraformStateMonitor:
    """Monitors Terraform state for drift detection"""
    
    def __init__(self, workspace_path: str, backend_config: Dict[str, Any]):
        self.workspace_path = workspace_path
        self.backend_config = backend_config
        self.terraform = python_terraform.Terraform(working_dir=workspace_path)
        self.logger = logging.getLogger("terraform.state_monitor")
        
    async def get_current_state(self) -> Dict[str, Any]:
        """Get current Terraform state"""
        try:
            # Get state show output
            return_code, stdout, stderr = self.terraform.cmd('state', 'list')
            if return_code != 0:
                raise Exception(f"Failed to get state list: {stderr}")
            
            resources = stdout.strip().split('\n') if stdout.strip() else []
            state_data = {}
            
            for resource in resources:
                if resource:
                    return_code, resource_stdout, resource_stderr = self.terraform.cmd(
                        'state', 'show', resource
                    )
                    if return_code == 0:
                        state_data[resource] = resource_stdout
                    
            return state_data
            
        except Exception as e:
            self.logger.error(f"Error getting current state: {str(e)}")
            raise
    
    async def detect_drift(self) -> Dict[str, Any]:
        """Detect drift between current state and configuration"""
        try:
            # Generate plan to detect drift
            return_code, stdout, stderr = self.terraform.plan(
                capture_output=True,
                detailed_exitcode=True
            )
            
            drift_detected = return_code == 2  # Exit code 2 means changes detected
            
            drift_info = {
                "drift_detected": drift_detected,
                "plan_output": stdout,
                "error_output": stderr,
                "return_code": return_code,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            if drift_detected:
                drift_info["changes"] = self._parse_plan_changes(stdout)
                
            return drift_info
            
        except Exception as e:
            self.logger.error(f"Error detecting drift: {str(e)}")
            raise
    
    def _parse_plan_changes(self, plan_output: str) -> List[Dict[str, Any]]:
        """Parse Terraform plan output to extract changes"""
        changes = []
        lines = plan_output.split('\n')
        
        current_resource = None
        current_action = None
        
        for line in lines:
            line = line.strip()
            
            # Detect resource changes
            if line.startswith('# ') and (' will be ' in line):
                parts = line.split(' will be ')
                if len(parts) == 2:
                    resource = parts[0].replace('# ', '')
                    action = parts[1]
                    
                    changes.append({
                        "resource": resource,
                        "action": action,
                        "details": []
                    })
                    current_resource = len(changes) - 1
                    
            elif current_resource is not None and (line.startswith('~') or line.startswith('+') or line.startswith('-')):
                changes[current_resource]["details"].append(line)
                
        return changes


class TerraformCloudIntegration:
    """Integration with Terraform Cloud"""
    
    def __init__(self, organization: str, workspace: str, token: str):
        self.organization = organization
        self.workspace = workspace
        self.token = token
        self.base_url = "https://app.terraform.io/api/v2"
        self.logger = logging.getLogger("terraform.cloud_integration")
        
    async def get_workspace_info(self) -> Dict[str, Any]:
        """Get workspace information from Terraform Cloud"""
        import aiohttp
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/vnd.api+json"
        }
        
        url = f"{self.base_url}/organizations/{self.organization}/workspaces/{self.workspace}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to get workspace info: {response.status}")
    
    async def trigger_run(self, message: str = "Automated drift correction") -> str:
        """Trigger a Terraform Cloud run"""
        import aiohttp
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/vnd.api+json"
        }
        
        workspace_info = await self.get_workspace_info()
        workspace_id = workspace_info["data"]["id"]
        
        payload = {
            "data": {
                "attributes": {
                    "message": message,
                    "is-destroy": False
                },
                "type": "runs",
                "relationships": {
                    "workspace": {
                        "data": {
                            "type": "workspaces",
                            "id": workspace_id
                        }
                    }
                }
            }
        }
        
        url = f"{self.base_url}/runs"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status == 201:
                    result = await response.json()
                    return result["data"]["id"]
                else:
                    raise Exception(f"Failed to trigger run: {response.status}")


class DriftPredictionModel:
    """ML model for predicting Terraform drift"""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or "terraform_drift_model.joblib"
        self.model = None
        self.scaler = None
        self.feature_columns = [
            'resource_count', 'last_apply_hours_ago', 'config_changes_count',
            'external_changes_count', 'avg_drift_frequency', 'resource_complexity'
        ]
        self.logger = logging.getLogger("terraform.drift_prediction")
        
    def train_model(self, historical_data: pd.DataFrame) -> None:
        """Train the drift prediction model"""
        try:
            # Prepare features
            X = historical_data[self.feature_columns]
            y = historical_data['drift_occurred']
            
            # Scale features
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            # Train model
            self.model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42
            )
            self.model.fit(X_scaled, y)
            
            # Save model
            self._save_model()
            
            self.logger.info("Drift prediction model trained successfully")
            
        except Exception as e:
            self.logger.error(f"Error training model: {str(e)}")
            raise
    
    def predict_drift_probability(self, features: Dict[str, float]) -> float:
        """Predict probability of drift occurring"""
        try:
            if not self.model or not self.scaler:
                self._load_model()
            
            # Prepare features
            feature_array = np.array([[features[col] for col in self.feature_columns]])
            feature_scaled = self.scaler.transform(feature_array)
            
            # Predict probability
            probability = self.model.predict_proba(feature_scaled)[0][1]
            
            return float(probability)
            
        except Exception as e:
            self.logger.error(f"Error predicting drift: {str(e)}")
            return 0.5  # Default to medium probability
    
    def _save_model(self) -> None:
        """Save the trained model"""
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'feature_columns': self.feature_columns
        }
        joblib.dump(model_data, self.model_path)
    
    def _load_model(self) -> None:
        """Load the trained model"""
        try:
            if os.path.exists(self.model_path):
                model_data = joblib.load(self.model_path)
                self.model = model_data['model']
                self.scaler = model_data['scaler']
                self.feature_columns = model_data['feature_columns']
            else:
                # Initialize with default model if no trained model exists
                self._initialize_default_model()
        except Exception as e:
            self.logger.warning(f"Could not load model: {str(e)}, using default")
            self._initialize_default_model()
    
    def _initialize_default_model(self) -> None:
        """Initialize with a basic default model"""
        # Create dummy training data for initial model
        dummy_data = pd.DataFrame({
            'resource_count': [10, 20, 5, 15, 30],
            'last_apply_hours_ago': [1, 24, 168, 72, 12],
            'config_changes_count': [0, 2, 1, 0, 3],
            'external_changes_count': [0, 1, 0, 2, 1],
            'avg_drift_frequency': [0.1, 0.3, 0.2, 0.4, 0.5],
            'resource_complexity': [1.0, 2.5, 1.5, 3.0, 2.0],
            'drift_occurred': [0, 1, 0, 1, 1]
        })
        
        self.train_model(dummy_data)


class TerraformAgent(BaseAgent):
    """
    AI Agent for Terraform infrastructure management
    
    Handles drift detection, automated remediation, and predictive analysis
    """
    
    def __init__(self, agent_id: str, event_bus, config_service, audit_service):
        super().__init__(agent_id, event_bus, config_service, audit_service)
        
        # Terraform-specific components
        self.state_monitor: Optional[TerraformStateMonitor] = None
        self.cloud_integration: Optional[TerraformCloudIntegration] = None
        self.drift_model: Optional[DriftPredictionModel] = None
        
        # Configuration
        self.workspace_path: Optional[str] = None
        self.backend_config: Dict[str, Any] = {}
        self.drift_check_interval = 300  # 5 minutes
        self.auto_apply_threshold = 0.8  # Auto-apply if confidence > 80%
        
        # State tracking
        self.last_drift_check: Optional[datetime] = None
        self.drift_history: List[Dict[str, Any]] = []
        self.pending_plans: Dict[str, Dict[str, Any]] = {}
        
        # Background tasks
        self._drift_monitoring_task: Optional[asyncio.Task] = None
        
    async def _initialize_agent_specific(self) -> None:
        """Initialize Terraform-specific components"""
        try:
            if not self.config:
                raise RuntimeError("No configuration provided")
            
            # Extract Terraform configuration
            tf_config = None
            for integration in self.config.integrations:
                if integration.type == "terraform":
                    tf_config = integration.config
                    break
            
            if not tf_config:
                raise RuntimeError("No Terraform integration configuration found")
            
            # Set up workspace path
            self.workspace_path = tf_config.get("workspace_path", "/tmp/terraform")
            self.backend_config = tf_config.get("backend_config", {})
            
            # Initialize state monitor
            self.state_monitor = TerraformStateMonitor(
                self.workspace_path, 
                self.backend_config
            )
            
            # Initialize Terraform Cloud integration if configured
            if tf_config.get("terraform_cloud"):
                cloud_config = tf_config["terraform_cloud"]
                self.cloud_integration = TerraformCloudIntegration(
                    organization=cloud_config["organization"],
                    workspace=cloud_config["workspace"],
                    token=cloud_config["token"]
                )
            
            # Initialize drift prediction model
            model_path = tf_config.get("model_path")
            self.drift_model = DriftPredictionModel(model_path)
            
            # Load configuration thresholds
            self.drift_check_interval = self.config.thresholds.get("drift_check_interval", 300)
            self.auto_apply_threshold = self.config.thresholds.get("auto_apply_threshold", 0.8)
            
            self.logger.info("Terraform agent initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Terraform agent: {str(e)}")
            raise
    
    async def _start_agent_specific(self) -> None:
        """Start Terraform-specific monitoring"""
        try:
            # Start drift monitoring task
            self._drift_monitoring_task = asyncio.create_task(
                self._drift_monitoring_loop()
            )
            
            self.logger.info("Terraform agent started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start Terraform agent: {str(e)}")
            raise
    
    async def _stop_agent_specific(self) -> None:
        """Stop Terraform-specific monitoring"""
        try:
            # Cancel drift monitoring task
            if self._drift_monitoring_task:
                self._drift_monitoring_task.cancel()
                try:
                    await self._drift_monitoring_task
                except asyncio.CancelledError:
                    pass
            
            self.logger.info("Terraform agent stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping Terraform agent: {str(e)}")
    
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        """Process Terraform-related events"""
        try:
            if event.type == EventType.INFRASTRUCTURE_DRIFT:
                return await self._handle_drift_event(event)
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error processing event {event.id}: {str(e)}")
            return None
    
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        """Execute Terraform-specific actions"""
        try:
            if action.type == ActionType.TERRAFORM_PLAN:
                return await self._execute_terraform_plan(action)
            elif action.type == ActionType.TERRAFORM_APPLY:
                return await self._execute_terraform_apply(action)
            else:
                return ActionResult(
                    success=False,
                    message=f"Unsupported action type: {action.type}",
                    error="Action type not supported by Terraform agent"
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Action execution failed",
                error=str(e)
            )
    
    async def _reload_config_specific(self, old_config: Optional[AgentConfig], new_config: AgentConfig) -> None:
        """Reload Terraform-specific configuration"""
        try:
            # Reinitialize with new configuration
            await self._initialize_agent_specific()
            
            self.logger.info("Terraform agent configuration reloaded")
            
        except Exception as e:
            self.logger.error(f"Failed to reload Terraform agent config: {str(e)}")
            raise
    
    def _get_subscribed_event_types(self) -> List[EventType]:
        """Return event types this agent subscribes to"""
        return [EventType.INFRASTRUCTURE_DRIFT]
    
    async def _drift_monitoring_loop(self) -> None:
        """Background task for continuous drift monitoring"""
        while self.is_running:
            try:
                await self._check_for_drift()
                await asyncio.sleep(self.drift_check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in drift monitoring loop: {str(e)}")
                await asyncio.sleep(self.drift_check_interval)
    
    async def _check_for_drift(self) -> None:
        """Check for Terraform state drift"""
        try:
            if not self.state_monitor:
                return
            
            self.logger.debug("Checking for Terraform drift")
            
            # Detect drift
            drift_info = await self.state_monitor.detect_drift()
            self.last_drift_check = datetime.utcnow()
            
            # Store drift history
            self.drift_history.append(drift_info)
            
            # Keep only last 100 drift checks
            if len(self.drift_history) > 100:
                self.drift_history = self.drift_history[-100:]
            
            # If drift detected, create event
            if drift_info["drift_detected"]:
                await self._create_drift_event(drift_info)
                
        except Exception as e:
            self.logger.error(f"Error checking for drift: {str(e)}")
    
    async def _create_drift_event(self, drift_info: Dict[str, Any]) -> None:
        """Create a drift detection event"""
        try:
            event = SystemEvent(
                id=f"drift_{self.agent_id}_{int(datetime.utcnow().timestamp())}",
                type=EventType.INFRASTRUCTURE_DRIFT,
                source=self.agent_id,
                severity=self._assess_drift_severity(drift_info),
                data=drift_info
            )
            
            await self.event_bus.publish_event(event)
            
        except Exception as e:
            self.logger.error(f"Error creating drift event: {str(e)}")
    
    def _assess_drift_severity(self, drift_info: Dict[str, Any]) -> str:
        """Assess the severity of detected drift"""
        changes = drift_info.get("changes", [])
        
        # Count different types of changes
        destructive_changes = sum(1 for change in changes if "destroyed" in change.get("action", ""))
        create_changes = sum(1 for change in changes if "created" in change.get("action", ""))
        modify_changes = sum(1 for change in changes if "modified" in change.get("action", ""))
        
        # Determine severity
        if destructive_changes > 0:
            return "critical"
        elif create_changes > 5 or modify_changes > 10:
            return "high"
        elif create_changes > 2 or modify_changes > 5:
            return "medium"
        else:
            return "low"
    
    async def _handle_drift_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Handle infrastructure drift event"""
        try:
            drift_info = event.data
            
            # Predict if this drift should be auto-corrected
            drift_probability = await self._predict_drift_correction_success(drift_info)
            
            # Determine action based on automation level and risk
            if self.config.automation_level.value == "full_auto" and drift_probability > self.auto_apply_threshold:
                # Auto-apply if high confidence
                action_type = ActionType.TERRAFORM_APPLY
                risk_level = RiskLevel.LOW
                description = f"Auto-applying Terraform changes (confidence: {drift_probability:.2f})"
            else:
                # Generate plan for review
                action_type = ActionType.TERRAFORM_PLAN
                risk_level = RiskLevel.MEDIUM if drift_probability > 0.5 else RiskLevel.HIGH
                description = f"Generating Terraform plan for drift correction (confidence: {drift_probability:.2f})"
            
            action = AgentAction(
                id=f"terraform_{action_type.value}_{int(datetime.utcnow().timestamp())}",
                agent_id=self.agent_id,
                type=action_type,
                description=description,
                target_resources=self._extract_target_resources(drift_info),
                risk_level=risk_level,
                estimated_impact=self._estimate_impact(drift_info),
                metadata={
                    "drift_info": drift_info,
                    "confidence": drift_probability,
                    "event_id": event.id
                }
            )
            
            return action
            
        except Exception as e:
            self.logger.error(f"Error handling drift event: {str(e)}")
            return None
    
    async def _predict_drift_correction_success(self, drift_info: Dict[str, Any]) -> float:
        """Predict success probability of drift correction"""
        try:
            if not self.drift_model:
                return 0.5  # Default medium confidence
            
            # Extract features for prediction
            features = self._extract_drift_features(drift_info)
            
            # Get prediction
            probability = self.drift_model.predict_drift_probability(features)
            
            return probability
            
        except Exception as e:
            self.logger.error(f"Error predicting drift correction success: {str(e)}")
            return 0.5
    
    def _extract_drift_features(self, drift_info: Dict[str, Any]) -> Dict[str, float]:
        """Extract features for ML model from drift information"""
        changes = drift_info.get("changes", [])
        
        # Calculate features
        resource_count = len(changes)
        
        # Estimate time since last apply (simplified)
        last_apply_hours_ago = 24.0  # Default assumption
        
        # Count different types of changes
        config_changes = sum(1 for change in changes if "modified" in change.get("action", ""))
        external_changes = sum(1 for change in changes if "created" in change.get("action", "") or "destroyed" in change.get("action", ""))
        
        # Calculate average drift frequency from history
        recent_drifts = [d for d in self.drift_history[-10:] if d.get("drift_detected")]
        avg_drift_frequency = len(recent_drifts) / 10.0
        
        # Estimate resource complexity
        resource_complexity = min(resource_count / 10.0, 5.0)  # Normalized complexity score
        
        return {
            'resource_count': float(resource_count),
            'last_apply_hours_ago': last_apply_hours_ago,
            'config_changes_count': float(config_changes),
            'external_changes_count': float(external_changes),
            'avg_drift_frequency': avg_drift_frequency,
            'resource_complexity': resource_complexity
        }
    
    def _extract_target_resources(self, drift_info: Dict[str, Any]) -> List[str]:
        """Extract target resources from drift information"""
        changes = drift_info.get("changes", [])
        return [change.get("resource", "") for change in changes if change.get("resource")]
    
    def _estimate_impact(self, drift_info: Dict[str, Any]) -> str:
        """Estimate the impact of applying drift corrections"""
        changes = drift_info.get("changes", [])
        
        if not changes:
            return "No changes detected"
        
        destructive = sum(1 for change in changes if "destroyed" in change.get("action", ""))
        creates = sum(1 for change in changes if "created" in change.get("action", ""))
        modifies = sum(1 for change in changes if "modified" in change.get("action", ""))
        
        impact_parts = []
        if destructive > 0:
            impact_parts.append(f"{destructive} resources will be destroyed")
        if creates > 0:
            impact_parts.append(f"{creates} resources will be created")
        if modifies > 0:
            impact_parts.append(f"{modifies} resources will be modified")
        
        return "; ".join(impact_parts)
    
    async def _execute_terraform_plan(self, action: AgentAction) -> ActionResult:
        """Execute Terraform plan action"""
        try:
            if not self.state_monitor:
                raise RuntimeError("State monitor not initialized")
            
            # Generate plan
            drift_info = await self.state_monitor.detect_drift()
            
            if not drift_info["drift_detected"]:
                return ActionResult(
                    success=True,
                    message="No drift detected, no plan needed",
                    data={"plan_output": "No changes required"}
                )
            
            # Store plan for potential application
            plan_id = f"plan_{int(datetime.utcnow().timestamp())}"
            self.pending_plans[plan_id] = {
                "drift_info": drift_info,
                "created_at": datetime.utcnow(),
                "action_id": action.id
            }
            
            return ActionResult(
                success=True,
                message="Terraform plan generated successfully",
                data={
                    "plan_id": plan_id,
                    "plan_output": drift_info["plan_output"],
                    "changes": drift_info.get("changes", [])
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to generate Terraform plan",
                error=str(e)
            )
    
    async def _execute_terraform_apply(self, action: AgentAction) -> ActionResult:
        """Execute Terraform apply action"""
        try:
            if not self.state_monitor:
                raise RuntimeError("State monitor not initialized")
            
            # Check if we have Terraform Cloud integration
            if self.cloud_integration:
                return await self._execute_terraform_cloud_apply(action)
            else:
                return await self._execute_local_terraform_apply(action)
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to apply Terraform changes",
                error=str(e)
            )
    
    async def _execute_local_terraform_apply(self, action: AgentAction) -> ActionResult:
        """Execute local Terraform apply"""
        try:
            # Apply changes
            return_code, stdout, stderr = self.state_monitor.terraform.apply(
                capture_output=True,
                skip_plan=False,
                auto_approve=True
            )
            
            if return_code == 0:
                # Verify changes were applied successfully
                post_apply_drift = await self.state_monitor.detect_drift()
                
                return ActionResult(
                    success=True,
                    message="Terraform changes applied successfully",
                    data={
                        "apply_output": stdout,
                        "post_apply_drift_detected": post_apply_drift["drift_detected"]
                    }
                )
            else:
                return ActionResult(
                    success=False,
                    message="Terraform apply failed",
                    error=stderr,
                    data={"apply_output": stdout}
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to execute local Terraform apply",
                error=str(e)
            )
    
    async def _execute_terraform_cloud_apply(self, action: AgentAction) -> ActionResult:
        """Execute Terraform Cloud apply"""
        try:
            if not self.cloud_integration:
                raise RuntimeError("Terraform Cloud integration not configured")
            
            # Trigger run in Terraform Cloud
            run_id = await self.cloud_integration.trigger_run(
                message=f"Automated drift correction - {action.description}"
            )
            
            return ActionResult(
                success=True,
                message="Terraform Cloud run triggered successfully",
                data={
                    "run_id": run_id,
                    "cloud_workspace": self.cloud_integration.workspace
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                message="Failed to trigger Terraform Cloud run",
                error=str(e)
            )