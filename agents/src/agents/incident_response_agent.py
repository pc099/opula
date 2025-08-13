"""
Incident Response Agent implementation for the AIOps Platform

This agent handles:
- Multi-source alert correlation and incident detection
- Incident classification using NLP models on logs and alerts
- Automated runbook execution for common incident types
- Escalation logic for incidents requiring human intervention
"""
import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
import joblib
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer

from ..core.base_agent import BaseAgent
from ..core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, ActionStatus
)


@dataclass
class Alert:
    """Represents an alert from monitoring systems"""
    id: str
    source: str
    severity: str
    title: str
    description: str
    timestamp: datetime
    labels: Dict[str, str]
    metrics: Dict[str, float]
    raw_data: Dict[str, Any]


@dataclass
class Incident:
    """Represents a correlated incident"""
    id: str
    title: str
    description: str
    severity: str
    status: str
    affected_resources: List[str]
    alerts: List[Alert]
    detected_at: datetime
    resolved_at: Optional[datetime]
    resolution_steps: List[str]
    automated_resolution: bool
    escalated: bool
    root_cause: Optional[str]
    metadata: Dict[str, Any]


@dataclass
class Runbook:
    """Represents an automated runbook"""
    id: str
    name: str
    description: str
    incident_patterns: List[str]
    steps: List[Dict[str, Any]]
    success_criteria: List[str]
    rollback_steps: List[Dict[str, Any]]
    risk_level: str
    estimated_duration: int  # minutes
    success_rate: float


class AlertCorrelator:
    """Correlates alerts from multiple sources into incidents"""
    
    def __init__(self):
        self.correlation_window = timedelta(minutes=15)
        self.similarity_threshold = 0.7
        self.clustering_model = DBSCAN(eps=0.3, min_samples=2)
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.logger = logging.getLogger("incident.alert_correlator")
        
    async def correlate_alerts(self, alerts: List[Alert]) -> List[Incident]:
        """Correlate alerts into incidents"""
        try:
            if not alerts:
                return []
            
            # Group alerts by time window
            time_groups = self._group_alerts_by_time(alerts)
            
            incidents = []
            for group_alerts in time_groups:
                # Correlate alerts within each time group
                group_incidents = await self._correlate_alert_group(group_alerts)
                incidents.extend(group_incidents)
            
            return incidents
            
        except Exception as e:
            self.logger.error(f"Error correlating alerts: {str(e)}")
            return []
    
    def _group_alerts_by_time(self, alerts: List[Alert]) -> List[List[Alert]]:
        """Group alerts by time windows"""
        # Sort alerts by timestamp
        sorted_alerts = sorted(alerts, key=lambda a: a.timestamp)
        
        groups = []
        current_group = []
        current_window_start = None
        
        for alert in sorted_alerts:
            if not current_window_start:
                current_window_start = alert.timestamp
                current_group = [alert]
            elif alert.timestamp - current_window_start <= self.correlation_window:
                current_group.append(alert)
            else:
                # Start new group
                if current_group:
                    groups.append(current_group)
                current_group = [alert]
                current_window_start = alert.timestamp
        
        # Add final group
        if current_group:
            groups.append(current_group)
        
        return groups
    
    async def _correlate_alert_group(self, alerts: List[Alert]) -> List[Incident]:
        """Correlate alerts within a time group"""
        try:
            if len(alerts) == 1:
                # Single alert becomes single incident
                return [self._create_incident_from_alerts([alerts[0]])]
            
            # Extract features for clustering
            features = self._extract_alert_features(alerts)
            
            if len(features) == 0:
                # Fallback: create individual incidents
                return [self._create_incident_from_alerts([alert]) for alert in alerts]
            
            # Perform clustering
            clusters = self.clustering_model.fit_predict(features)
            
            # Group alerts by cluster
            clustered_alerts = defaultdict(list)
            for i, cluster_id in enumerate(clusters):
                if cluster_id == -1:  # Noise/outlier
                    # Create individual incident for outliers
                    clustered_alerts[f"outlier_{i}"] = [alerts[i]]
                else:
                    clustered_alerts[cluster_id].append(alerts[i])
            
            # Create incidents from clusters
            incidents = []
            for cluster_alerts in clustered_alerts.values():
                incident = self._create_incident_from_alerts(cluster_alerts)
                incidents.append(incident)
            
            return incidents
            
        except Exception as e:
            self.logger.error(f"Error correlating alert group: {str(e)}")
            # Fallback: create individual incidents
            return [self._create_incident_from_alerts([alert]) for alert in alerts]
    
    def _extract_alert_features(self, alerts: List[Alert]) -> np.ndarray:
        """Extract features from alerts for clustering"""
        try:
            # Combine text features
            texts = []
            for alert in alerts:
                text = f"{alert.title} {alert.description}"
                texts.append(text)
            
            # Vectorize text
            if len(texts) > 1:
                text_features = self.vectorizer.fit_transform(texts).toarray()
            else:
                text_features = np.zeros((1, 100))  # Default feature size
            
            # Add numerical features
            numerical_features = []
            for alert in alerts:
                # Severity as number
                severity_map = {"low": 1, "medium": 2, "high": 3, "critical": 4}
                severity_num = severity_map.get(alert.severity.lower(), 2)
                
                # Source similarity (simplified)
                source_hash = hash(alert.source) % 100
                
                # Time features
                hour = alert.timestamp.hour
                day_of_week = alert.timestamp.weekday()
                
                numerical_features.append([severity_num, source_hash, hour, day_of_week])
            
            numerical_features = np.array(numerical_features)
            
            # Combine features
            if text_features.shape[0] == numerical_features.shape[0]:
                features = np.hstack([text_features, numerical_features])
            else:
                features = text_features
            
            return features
            
        except Exception as e:
            self.logger.error(f"Error extracting alert features: {str(e)}")
            return np.array([])
    
    def _create_incident_from_alerts(self, alerts: List[Alert]) -> Incident:
        """Create an incident from correlated alerts"""
        # Determine incident severity (highest alert severity)
        severity_order = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        max_severity = max(alerts, key=lambda a: severity_order.get(a.severity.lower(), 1))
        
        # Generate incident title and description
        if len(alerts) == 1:
            title = alerts[0].title
            description = alerts[0].description
        else:
            # Combine multiple alerts
            sources = list(set(alert.source for alert in alerts))
            title = f"Multiple alerts from {', '.join(sources[:3])}"
            if len(sources) > 3:
                title += f" and {len(sources) - 3} more sources"
            
            description = f"Correlated incident from {len(alerts)} alerts: "
            description += "; ".join([f"{alert.source}: {alert.title}" for alert in alerts[:3]])
            if len(alerts) > 3:
                description += f" and {len(alerts) - 3} more alerts"
        
        # Extract affected resources
        affected_resources = []
        for alert in alerts:
            if 'resource' in alert.labels:
                affected_resources.append(alert.labels['resource'])
            if 'service' in alert.labels:
                affected_resources.append(alert.labels['service'])
        
        affected_resources = list(set(affected_resources))
        
        # Create incident
        incident_id = f"incident_{int(datetime.utcnow().timestamp())}_{hash(title) % 10000}"
        
        return Incident(
            id=incident_id,
            title=title,
            description=description,
            severity=max_severity.severity,
            status="open",
            affected_resources=affected_resources,
            alerts=alerts,
            detected_at=min(alert.timestamp for alert in alerts),
            resolved_at=None,
            resolution_steps=[],
            automated_resolution=False,
            escalated=False,
            root_cause=None,
            metadata={
                "alert_count": len(alerts),
                "sources": list(set(alert.source for alert in alerts))
            }
        )


class IncidentClassifier:
    """Classifies incidents using NLP models"""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or "incident_classifier_model.joblib"
        self.model = None
        self.vectorizer = None
        self.label_encoder = None
        self.incident_types = [
            "service_down", "high_latency", "resource_exhaustion", 
            "database_issue", "network_issue", "security_incident",
            "deployment_failure", "configuration_error", "unknown"
        ]
        self.logger = logging.getLogger("incident.classifier")
        
        # Initialize NLTK components
        try:
            nltk.download('punkt', quiet=True)
            nltk.download('stopwords', quiet=True)
            nltk.download('wordnet', quiet=True)
            self.lemmatizer = WordNetLemmatizer()
            self.stop_words = set(stopwords.words('english'))
        except Exception as e:
            self.logger.warning(f"Could not initialize NLTK: {str(e)}")
            self.lemmatizer = None
            self.stop_words = set()
    
    async def classify_incident(self, incident: Incident) -> Tuple[str, float]:
        """Classify incident type and return confidence score"""
        try:
            if not self.model:
                self._load_or_create_model()
            
            # Prepare text for classification
            text = self._prepare_text_for_classification(incident)
            
            # Vectorize text
            text_vector = self.vectorizer.transform([text])
            
            # Predict
            prediction = self.model.predict(text_vector)[0]
            confidence = max(self.model.predict_proba(text_vector)[0])
            
            return prediction, float(confidence)
            
        except Exception as e:
            self.logger.error(f"Error classifying incident: {str(e)}")
            return "unknown", 0.5
    
    def _prepare_text_for_classification(self, incident: Incident) -> str:
        """Prepare incident text for NLP processing"""
        # Combine incident text
        text = f"{incident.title} {incident.description}"
        
        # Add alert information
        for alert in incident.alerts:
            text += f" {alert.title} {alert.description}"
        
        # Clean and preprocess text
        text = self._preprocess_text(text)
        
        return text
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for NLP"""
        try:
            # Convert to lowercase
            text = text.lower()
            
            # Remove special characters and numbers
            text = re.sub(r'[^a-zA-Z\s]', ' ', text)
            
            # Tokenize
            if self.lemmatizer:
                tokens = word_tokenize(text)
                
                # Remove stopwords and lemmatize
                tokens = [
                    self.lemmatizer.lemmatize(token) 
                    for token in tokens 
                    if token not in self.stop_words and len(token) > 2
                ]
                
                text = ' '.join(tokens)
            
            return text
            
        except Exception as e:
            self.logger.warning(f"Error preprocessing text: {str(e)}")
            return text.lower()
    
    def _load_or_create_model(self) -> None:
        """Load existing model or create a new one"""
        try:
            if self.model_path and os.path.exists(self.model_path):
                model_data = joblib.load(self.model_path)
                self.model = model_data['model']
                self.vectorizer = model_data['vectorizer']
                self.label_encoder = model_data['label_encoder']
                self.logger.info("Loaded existing incident classification model")
            else:
                self._create_default_model()
                self.logger.info("Created default incident classification model")
        except Exception as e:
            self.logger.warning(f"Could not load model: {str(e)}, creating default")
            self._create_default_model()
    
    def _create_default_model(self) -> None:
        """Create a default model with synthetic training data"""
        # Create synthetic training data
        training_data = [
            ("service is down not responding", "service_down"),
            ("application crashed error 500", "service_down"),
            ("high response time slow performance", "high_latency"),
            ("cpu usage 100 percent memory full", "resource_exhaustion"),
            ("disk space full storage exhausted", "resource_exhaustion"),
            ("database connection timeout", "database_issue"),
            ("sql query slow deadlock", "database_issue"),
            ("network timeout connection refused", "network_issue"),
            ("packet loss high latency network", "network_issue"),
            ("deployment failed build error", "deployment_failure"),
            ("configuration invalid syntax error", "configuration_error"),
            ("security breach unauthorized access", "security_incident"),
            ("unknown error unexpected behavior", "unknown")
        ]
        
        # Prepare training data
        texts = [item[0] for item in training_data]
        labels = [item[1] for item in training_data]
        
        # Vectorize text
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        X = self.vectorizer.fit_transform(texts)
        
        # Train model
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.model.fit(X, labels)
        
        # Save model
        self._save_model()
    
    def _save_model(self) -> None:
        """Save the trained model"""
        try:
            model_data = {
                'model': self.model,
                'vectorizer': self.vectorizer,
                'label_encoder': self.label_encoder
            }
            joblib.dump(model_data, self.model_path)
        except Exception as e:
            self.logger.warning(f"Could not save model: {str(e)}")


class RunbookExecutor:
    """Executes automated runbooks for incident resolution"""
    
    def __init__(self):
        self.runbooks: Dict[str, Runbook] = {}
        self.execution_history: List[Dict[str, Any]] = []
        self.logger = logging.getLogger("incident.runbook_executor")
        
        # Initialize default runbooks
        self._initialize_default_runbooks()
    
    def _initialize_default_runbooks(self) -> None:
        """Initialize default runbooks for common incident types"""
        # Service Down Runbook
        service_down_runbook = Runbook(
            id="service_down_basic",
            name="Basic Service Recovery",
            description="Restart service and check health",
            incident_patterns=["service_down", "application_crashed"],
            steps=[
                {
                    "type": "check_service_status",
                    "description": "Check service health",
                    "command": "kubectl get pods -l app={service_name}",
                    "timeout": 30
                },
                {
                    "type": "restart_service",
                    "description": "Restart the service",
                    "command": "kubectl rollout restart deployment/{service_name}",
                    "timeout": 300
                },
                {
                    "type": "verify_health",
                    "description": "Verify service is healthy",
                    "command": "kubectl wait --for=condition=ready pod -l app={service_name} --timeout=300s",
                    "timeout": 300
                }
            ],
            success_criteria=[
                "All pods are running",
                "Health check returns 200",
                "No error logs in last 5 minutes"
            ],
            rollback_steps=[
                {
                    "type": "rollback_deployment",
                    "description": "Rollback to previous version",
                    "command": "kubectl rollout undo deployment/{service_name}",
                    "timeout": 300
                }
            ],
            risk_level="medium",
            estimated_duration=10,
            success_rate=0.8
        )
        
        # High Latency Runbook
        high_latency_runbook = Runbook(
            id="high_latency_basic",
            name="High Latency Mitigation",
            description="Scale up resources to handle high latency",
            incident_patterns=["high_latency", "slow_performance"],
            steps=[
                {
                    "type": "check_metrics",
                    "description": "Check current resource usage",
                    "command": "kubectl top pods -l app={service_name}",
                    "timeout": 30
                },
                {
                    "type": "scale_up",
                    "description": "Scale up the service",
                    "command": "kubectl scale deployment/{service_name} --replicas={target_replicas}",
                    "timeout": 180
                },
                {
                    "type": "monitor_latency",
                    "description": "Monitor latency improvement",
                    "command": "sleep 120",  # Wait for scaling to take effect
                    "timeout": 180
                }
            ],
            success_criteria=[
                "Average latency below threshold",
                "All pods are ready",
                "CPU usage normalized"
            ],
            rollback_steps=[
                {
                    "type": "scale_down",
                    "description": "Scale back to original size",
                    "command": "kubectl scale deployment/{service_name} --replicas={original_replicas}",
                    "timeout": 180
                }
            ],
            risk_level="low",
            estimated_duration=5,
            success_rate=0.9
        )
        
        # Resource Exhaustion Runbook
        resource_exhaustion_runbook = Runbook(
            id="resource_exhaustion_basic",
            name="Resource Exhaustion Recovery",
            description="Clean up resources and scale if needed",
            incident_patterns=["resource_exhaustion", "memory_full", "disk_full"],
            steps=[
                {
                    "type": "cleanup_logs",
                    "description": "Clean up old logs",
                    "command": "find /var/log -name '*.log' -mtime +7 -delete",
                    "timeout": 60
                },
                {
                    "type": "cleanup_temp",
                    "description": "Clean up temporary files",
                    "command": "find /tmp -mtime +1 -delete",
                    "timeout": 60
                },
                {
                    "type": "restart_if_needed",
                    "description": "Restart service if memory usage still high",
                    "command": "kubectl rollout restart deployment/{service_name}",
                    "timeout": 300
                }
            ],
            success_criteria=[
                "Memory usage below 80%",
                "Disk usage below 85%",
                "Service is responsive"
            ],
            rollback_steps=[],
            risk_level="low",
            estimated_duration=8,
            success_rate=0.85
        )
        
        self.runbooks = {
            "service_down": service_down_runbook,
            "high_latency": high_latency_runbook,
            "resource_exhaustion": resource_exhaustion_runbook
        }
    
    async def find_applicable_runbooks(self, incident: Incident, incident_type: str) -> List[Runbook]:
        """Find runbooks applicable to the incident"""
        applicable_runbooks = []
        
        for runbook in self.runbooks.values():
            if incident_type in runbook.incident_patterns:
                applicable_runbooks.append(runbook)
        
        # Sort by success rate (highest first)
        applicable_runbooks.sort(key=lambda r: r.success_rate, reverse=True)
        
        return applicable_runbooks
    
    async def execute_runbook(self, runbook: Runbook, incident: Incident, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a runbook for incident resolution"""
        execution_id = f"exec_{int(datetime.utcnow().timestamp())}"
        execution_start = datetime.utcnow()
        
        execution_result = {
            "execution_id": execution_id,
            "runbook_id": runbook.id,
            "incident_id": incident.id,
            "start_time": execution_start,
            "end_time": None,
            "success": False,
            "steps_executed": [],
            "error": None,
            "rollback_performed": False
        }
        
        try:
            self.logger.info(f"Executing runbook {runbook.id} for incident {incident.id}")
            
            # Execute each step
            for i, step in enumerate(runbook.steps):
                step_result = await self._execute_step(step, context)
                execution_result["steps_executed"].append(step_result)
                
                if not step_result["success"]:
                    self.logger.warning(f"Step {i+1} failed: {step_result['error']}")
                    
                    # Decide whether to continue or rollback
                    if step.get("critical", False):
                        # Critical step failed, perform rollback
                        await self._perform_rollback(runbook, context, execution_result)
                        execution_result["rollback_performed"] = True
                        break
                    else:
                        # Non-critical step, continue
                        self.logger.info(f"Non-critical step failed, continuing...")
            
            # Check success criteria
            success = await self._check_success_criteria(runbook, incident, context)
            execution_result["success"] = success
            
            if success:
                self.logger.info(f"Runbook {runbook.id} executed successfully")
            else:
                self.logger.warning(f"Runbook {runbook.id} completed but success criteria not met")
            
        except Exception as e:
            self.logger.error(f"Error executing runbook {runbook.id}: {str(e)}")
            execution_result["error"] = str(e)
            
            # Attempt rollback on error
            try:
                await self._perform_rollback(runbook, context, execution_result)
                execution_result["rollback_performed"] = True
            except Exception as rollback_error:
                self.logger.error(f"Rollback also failed: {str(rollback_error)}")
        
        finally:
            execution_result["end_time"] = datetime.utcnow()
            self.execution_history.append(execution_result)
        
        return execution_result
    
    async def _execute_step(self, step: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a single runbook step"""
        step_start = datetime.utcnow()
        step_result = {
            "step_type": step["type"],
            "description": step["description"],
            "start_time": step_start,
            "end_time": None,
            "success": False,
            "output": "",
            "error": None
        }
        
        try:
            # Replace variables in command
            command = step["command"]
            for key, value in context.items():
                command = command.replace(f"{{{key}}}", str(value))
            
            self.logger.info(f"Executing step: {step['description']}")
            self.logger.debug(f"Command: {command}")
            
            # Simulate command execution (in real implementation, this would execute actual commands)
            await asyncio.sleep(1)  # Simulate execution time
            
            # For demo purposes, simulate success/failure based on step type
            if step["type"] in ["check_service_status", "check_metrics"]:
                step_result["output"] = "Service status: Running"
                step_result["success"] = True
            elif step["type"] in ["restart_service", "scale_up", "scale_down"]:
                step_result["output"] = "Operation completed successfully"
                step_result["success"] = True
            elif step["type"] in ["cleanup_logs", "cleanup_temp"]:
                step_result["output"] = "Cleanup completed"
                step_result["success"] = True
            else:
                step_result["output"] = "Step completed"
                step_result["success"] = True
            
        except Exception as e:
            step_result["error"] = str(e)
            self.logger.error(f"Step execution failed: {str(e)}")
        
        finally:
            step_result["end_time"] = datetime.utcnow()
        
        return step_result
    
    async def _perform_rollback(self, runbook: Runbook, context: Dict[str, Any], execution_result: Dict[str, Any]) -> None:
        """Perform rollback steps"""
        if not runbook.rollback_steps:
            return
        
        self.logger.info(f"Performing rollback for runbook {runbook.id}")
        
        rollback_steps = []
        for step in runbook.rollback_steps:
            step_result = await self._execute_step(step, context)
            rollback_steps.append(step_result)
        
        execution_result["rollback_steps"] = rollback_steps
    
    async def _check_success_criteria(self, runbook: Runbook, incident: Incident, context: Dict[str, Any]) -> bool:
        """Check if runbook execution met success criteria"""
        # For demo purposes, simulate success criteria checking
        # In real implementation, this would check actual system state
        
        success_count = 0
        for criteria in runbook.success_criteria:
            # Simulate criteria checking
            if "running" in criteria.lower() or "ready" in criteria.lower():
                success_count += 1
            elif "latency" in criteria.lower() or "usage" in criteria.lower():
                success_count += 1
            elif "error" in criteria.lower() or "logs" in criteria.lower():
                success_count += 1
        
        # Consider successful if at least 70% of criteria are met
        success_rate = success_count / len(runbook.success_criteria) if runbook.success_criteria else 1.0
        return success_rate >= 0.7


class EscalationManager:
    """Manages incident escalation logic"""
    
    def __init__(self):
        self.escalation_rules = []
        self.notification_channels = {}
        self.logger = logging.getLogger("incident.escalation")
        
        # Initialize default escalation rules
        self._initialize_escalation_rules()
    
    def _initialize_escalation_rules(self) -> None:
        """Initialize default escalation rules"""
        self.escalation_rules = [
            {
                "name": "Critical Incident Immediate Escalation",
                "condition": lambda incident: incident.severity == "critical",
                "escalation_delay": 0,  # Immediate
                "notification_level": "critical"
            },
            {
                "name": "High Severity Escalation",
                "condition": lambda incident: incident.severity == "high",
                "escalation_delay": 300,  # 5 minutes
                "notification_level": "high"
            },
            {
                "name": "Failed Automation Escalation",
                "condition": lambda incident: not incident.automated_resolution and incident.status == "open",
                "escalation_delay": 900,  # 15 minutes
                "notification_level": "medium"
            },
            {
                "name": "Long Running Incident",
                "condition": lambda incident: self._incident_duration(incident) > 1800,  # 30 minutes
                "escalation_delay": 0,
                "notification_level": "high"
            }
        ]
    
    def _incident_duration(self, incident: Incident) -> int:
        """Calculate incident duration in seconds"""
        if incident.resolved_at:
            return int((incident.resolved_at - incident.detected_at).total_seconds())
        else:
            return int((datetime.utcnow() - incident.detected_at).total_seconds())
    
    async def should_escalate(self, incident: Incident) -> Tuple[bool, str]:
        """Check if incident should be escalated"""
        for rule in self.escalation_rules:
            try:
                if rule["condition"](incident):
                    # Check if enough time has passed for escalation
                    incident_age = self._incident_duration(incident)
                    if incident_age >= rule["escalation_delay"]:
                        return True, rule["name"]
            except Exception as e:
                self.logger.error(f"Error evaluating escalation rule {rule['name']}: {str(e)}")
        
        return False, ""
    
    async def escalate_incident(self, incident: Incident, reason: str) -> Dict[str, Any]:
        """Escalate incident to human operators"""
        try:
            escalation_result = {
                "incident_id": incident.id,
                "escalated_at": datetime.utcnow(),
                "reason": reason,
                "notifications_sent": [],
                "success": False
            }
            
            # Mark incident as escalated
            incident.escalated = True
            incident.metadata["escalation_reason"] = reason
            incident.metadata["escalated_at"] = datetime.utcnow().isoformat()
            
            # Send notifications (simulated)
            notifications = await self._send_escalation_notifications(incident, reason)
            escalation_result["notifications_sent"] = notifications
            escalation_result["success"] = len(notifications) > 0
            
            self.logger.info(f"Incident {incident.id} escalated: {reason}")
            
            return escalation_result
            
        except Exception as e:
            self.logger.error(f"Error escalating incident {incident.id}: {str(e)}")
            return {
                "incident_id": incident.id,
                "success": False,
                "error": str(e)
            }
    
    async def _send_escalation_notifications(self, incident: Incident, reason: str) -> List[Dict[str, Any]]:
        """Send escalation notifications"""
        notifications = []
        
        # Simulate sending notifications to different channels
        channels = ["slack", "email", "pagerduty"]
        
        for channel in channels:
            try:
                # Simulate notification sending
                notification = {
                    "channel": channel,
                    "sent_at": datetime.utcnow(),
                    "success": True,
                    "message": f"Incident {incident.id} escalated: {reason}"
                }
                notifications.append(notification)
                
                self.logger.info(f"Sent escalation notification via {channel}")
                
            except Exception as e:
                self.logger.error(f"Failed to send notification via {channel}: {str(e)}")
                notifications.append({
                    "channel": channel,
                    "sent_at": datetime.utcnow(),
                    "success": False,
                    "error": str(e)
                })
        
        return notifications


class IncidentResponseAgent(BaseAgent):
    """
    AI Agent for automated incident response
    
    Handles alert correlation, incident classification, automated resolution,
    and escalation to human operators when needed
    """
    
    def __init__(self, agent_id: str, event_bus, config_service, audit_service):
        super().__init__(agent_id, event_bus, config_service, audit_service)
        
        # Incident response components
        self.alert_correlator: Optional[AlertCorrelator] = None
        self.incident_classifier: Optional[IncidentClassifier] = None
        self.runbook_executor: Optional[RunbookExecutor] = None
        self.escalation_manager: Optional[EscalationManager] = None
        
        # State tracking
        self.active_incidents: Dict[str, Incident] = {}
        self.alert_buffer: List[Alert] = []
        self.correlation_interval = 60  # seconds
        
        # Configuration
        self.auto_resolution_enabled = True
        self.escalation_enabled = True
        self.max_resolution_attempts = 3
        
        # Background tasks
        self._correlation_task: Optional[asyncio.Task] = None
        self._escalation_monitoring_task: Optional[asyncio.Task] = None
    
    async def _initialize_agent_specific(self) -> None:
        """Initialize incident response specific components"""
        try:
            if not self.config:
                raise RuntimeError("No configuration provided")
            
            # Initialize components
            self.alert_correlator = AlertCorrelator()
            
            # Get model path from config if available
            model_path = None
            for integration in self.config.integrations:
                if integration.type == "incident_response":
                    model_path = integration.config.get("model_path")
                    break
            
            self.incident_classifier = IncidentClassifier(model_path)
            self.runbook_executor = RunbookExecutor()
            self.escalation_manager = EscalationManager()
            
            # Load configuration settings
            self.correlation_interval = self.config.thresholds.get("correlation_interval", 60)
            self.auto_resolution_enabled = bool(self.config.thresholds.get("auto_resolution_enabled", True))
            self.escalation_enabled = bool(self.config.thresholds.get("escalation_enabled", True))
            self.max_resolution_attempts = int(self.config.thresholds.get("max_resolution_attempts", 3))
            
            self.logger.info("Incident Response agent initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Incident Response agent: {str(e)}")
            raise
    
    async def _start_agent_specific(self) -> None:
        """Start incident response specific monitoring"""
        try:
            # Start alert correlation task
            self._correlation_task = asyncio.create_task(
                self._alert_correlation_loop()
            )
            
            # Start escalation monitoring task
            if self.escalation_enabled:
                self._escalation_monitoring_task = asyncio.create_task(
                    self._escalation_monitoring_loop()
                )
            
            self.logger.info("Incident Response agent started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start Incident Response agent: {str(e)}")
            raise
    
    async def _stop_agent_specific(self) -> None:
        """Stop incident response specific monitoring"""
        try:
            # Cancel correlation task
            if self._correlation_task:
                self._correlation_task.cancel()
                try:
                    await self._correlation_task
                except asyncio.CancelledError:
                    pass
            
            # Cancel escalation monitoring task
            if self._escalation_monitoring_task:
                self._escalation_monitoring_task.cancel()
                try:
                    await self._escalation_monitoring_task
                except asyncio.CancelledError:
                    pass
            
            self.logger.info("Incident Response agent stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping Incident Response agent: {str(e)}")
    
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        """Process incident-related events"""
        try:
            if event.type == EventType.INCIDENT_DETECTED:
                return await self._handle_incident_detected_event(event)
            elif event.type in [EventType.RESOURCE_ANOMALY, EventType.INFRASTRUCTURE_DRIFT]:
                # Convert other events to alerts for correlation
                await self._convert_event_to_alert(event)
                return None
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error processing event {event.id}: {str(e)}")
            return None
    
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        """Execute incident response specific actions"""
        try:
            if action.type == ActionType.INCIDENT_RESOLVE:
                return await self._execute_incident_resolution(action)
            else:
                return ActionResult(
                    success=False,
                    message=f"Unsupported action type: {action.type}",
                    error="Action type not supported by Incident Response agent"
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Action execution failed",
                error=str(e)
            )
    
    async def _reload_config_specific(self, old_config: Optional[AgentConfig], new_config: AgentConfig) -> None:
        """Reload incident response specific configuration"""
        try:
            # Reinitialize with new configuration
            await self._initialize_agent_specific()
            
            self.logger.info("Incident Response agent configuration reloaded")
            
        except Exception as e:
            self.logger.error(f"Failed to reload Incident Response agent config: {str(e)}")
            raise
    
    def _get_subscribed_event_types(self) -> List[EventType]:
        """Return event types this agent subscribes to"""
        return [
            EventType.INCIDENT_DETECTED,
            EventType.RESOURCE_ANOMALY,
            EventType.INFRASTRUCTURE_DRIFT
        ]
    
    async def _alert_correlation_loop(self) -> None:
        """Background task for alert correlation"""
        while self.is_running:
            try:
                if self.alert_buffer:
                    await self._process_alert_buffer()
                
                await asyncio.sleep(self.correlation_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in alert correlation loop: {str(e)}")
                await asyncio.sleep(self.correlation_interval)
    
    async def _escalation_monitoring_loop(self) -> None:
        """Background task for monitoring incident escalation"""
        while self.is_running:
            try:
                await self._check_incidents_for_escalation()
                await asyncio.sleep(60)  # Check every minute
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in escalation monitoring loop: {str(e)}")
                await asyncio.sleep(60)
    
    async def _convert_event_to_alert(self, event: SystemEvent) -> None:
        """Convert system event to alert for correlation"""
        try:
            alert = Alert(
                id=f"alert_{event.id}",
                source=event.source,
                severity=event.severity,
                title=f"{event.type.value} detected",
                description=f"Event from {event.source}: {event.data}",
                timestamp=event.timestamp,
                labels={"event_type": event.type.value},
                metrics={},
                raw_data=event.data
            )
            
            self.alert_buffer.append(alert)
            
        except Exception as e:
            self.logger.error(f"Error converting event to alert: {str(e)}")
    
    async def _process_alert_buffer(self) -> None:
        """Process buffered alerts for correlation"""
        try:
            if not self.alert_correlator or not self.alert_buffer:
                return
            
            self.logger.debug(f"Processing {len(self.alert_buffer)} alerts for correlation")
            
            # Correlate alerts into incidents
            incidents = await self.alert_correlator.correlate_alerts(self.alert_buffer.copy())
            
            # Process each new incident
            for incident in incidents:
                await self._process_new_incident(incident)
            
            # Clear processed alerts
            self.alert_buffer.clear()
            
        except Exception as e:
            self.logger.error(f"Error processing alert buffer: {str(e)}")
    
    async def _process_new_incident(self, incident: Incident) -> None:
        """Process a newly detected incident"""
        try:
            self.logger.info(f"Processing new incident: {incident.id}")
            
            # Add to active incidents
            self.active_incidents[incident.id] = incident
            
            # Classify the incident
            incident_type, confidence = await self.incident_classifier.classify_incident(incident)
            incident.metadata["incident_type"] = incident_type
            incident.metadata["classification_confidence"] = confidence
            
            self.logger.info(f"Incident {incident.id} classified as {incident_type} (confidence: {confidence:.2f})")
            
            # Create incident detection event
            await self._create_incident_event(incident, incident_type, confidence)
            
        except Exception as e:
            self.logger.error(f"Error processing new incident {incident.id}: {str(e)}")
    
    async def _create_incident_event(self, incident: Incident, incident_type: str, confidence: float) -> None:
        """Create an incident detected event"""
        try:
            event = SystemEvent(
                id=f"incident_event_{incident.id}",
                type=EventType.INCIDENT_DETECTED,
                source=self.agent_id,
                severity=incident.severity,
                data={
                    "incident_id": incident.id,
                    "incident_type": incident_type,
                    "classification_confidence": confidence,
                    "affected_resources": incident.affected_resources,
                    "alert_count": len(incident.alerts),
                    "incident_data": {
                        "title": incident.title,
                        "description": incident.description,
                        "detected_at": incident.detected_at.isoformat()
                    }
                }
            )
            
            await self.event_bus.publish_event(event)
            
        except Exception as e:
            self.logger.error(f"Error creating incident event: {str(e)}")
    
    async def _handle_incident_detected_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Handle incident detected event"""
        try:
            incident_data = event.data
            incident_id = incident_data.get("incident_id")
            incident_type = incident_data.get("incident_type", "unknown")
            
            if not incident_id or incident_id not in self.active_incidents:
                self.logger.warning(f"Incident {incident_id} not found in active incidents")
                return None
            
            incident = self.active_incidents[incident_id]
            
            # Determine if we should attempt automated resolution
            if not self.auto_resolution_enabled:
                self.logger.info(f"Auto-resolution disabled, skipping incident {incident_id}")
                return None
            
            # Check if incident type has applicable runbooks
            applicable_runbooks = await self.runbook_executor.find_applicable_runbooks(incident, incident_type)
            
            if not applicable_runbooks:
                self.logger.info(f"No applicable runbooks found for incident {incident_id} of type {incident_type}")
                return None
            
            # Create resolution action
            action = AgentAction(
                id=f"incident_resolve_{incident_id}_{int(datetime.utcnow().timestamp())}",
                agent_id=self.agent_id,
                type=ActionType.INCIDENT_RESOLVE,
                description=f"Automated resolution for {incident_type} incident: {incident.title}",
                target_resources=incident.affected_resources,
                risk_level=self._assess_resolution_risk(incident, applicable_runbooks[0]),
                estimated_impact=f"Attempt to resolve incident using {applicable_runbooks[0].name}",
                metadata={
                    "incident_id": incident_id,
                    "incident_type": incident_type,
                    "runbook_id": applicable_runbooks[0].id,
                    "event_id": event.id
                }
            )
            
            return action
            
        except Exception as e:
            self.logger.error(f"Error handling incident detected event: {str(e)}")
            return None
    
    def _assess_resolution_risk(self, incident: Incident, runbook: Runbook) -> RiskLevel:
        """Assess the risk level of automated resolution"""
        # Base risk on incident severity and runbook risk
        if incident.severity == "critical":
            return RiskLevel.HIGH
        elif incident.severity == "high" or runbook.risk_level == "high":
            return RiskLevel.MEDIUM
        else:
            return RiskLevel.LOW
    
    async def _execute_incident_resolution(self, action: AgentAction) -> ActionResult:
        """Execute incident resolution action"""
        try:
            incident_id = action.metadata.get("incident_id")
            runbook_id = action.metadata.get("runbook_id")
            
            if not incident_id or incident_id not in self.active_incidents:
                return ActionResult(
                    success=False,
                    message="Incident not found",
                    error=f"Incident {incident_id} not in active incidents"
                )
            
            incident = self.active_incidents[incident_id]
            runbook = self.runbook_executor.runbooks.get(runbook_id)
            
            if not runbook:
                return ActionResult(
                    success=False,
                    message="Runbook not found",
                    error=f"Runbook {runbook_id} not found"
                )
            
            # Prepare execution context
            context = self._prepare_execution_context(incident, action)
            
            # Execute runbook
            execution_result = await self.runbook_executor.execute_runbook(runbook, incident, context)
            
            # Update incident based on execution result
            if execution_result["success"]:
                incident.status = "resolved"
                incident.resolved_at = datetime.utcnow()
                incident.automated_resolution = True
                incident.resolution_steps = [
                    step["description"] for step in execution_result["steps_executed"]
                ]
                
                # Remove from active incidents
                del self.active_incidents[incident_id]
                
                return ActionResult(
                    success=True,
                    message=f"Incident {incident_id} resolved successfully using {runbook.name}",
                    data={
                        "incident_id": incident_id,
                        "runbook_used": runbook.name,
                        "execution_result": execution_result,
                        "resolution_time": (incident.resolved_at - incident.detected_at).total_seconds()
                    }
                )
            else:
                # Resolution failed, update incident
                incident.metadata["resolution_attempts"] = incident.metadata.get("resolution_attempts", 0) + 1
                incident.metadata["last_resolution_attempt"] = datetime.utcnow().isoformat()
                incident.metadata["last_resolution_error"] = execution_result.get("error", "Unknown error")
                
                # Check if we should escalate
                if incident.metadata["resolution_attempts"] >= self.max_resolution_attempts:
                    if self.escalation_enabled:
                        escalation_result = await self.escalation_manager.escalate_incident(
                            incident, 
                            f"Failed to resolve after {self.max_resolution_attempts} attempts"
                        )
                        incident.metadata["escalation_result"] = escalation_result
                
                return ActionResult(
                    success=False,
                    message=f"Failed to resolve incident {incident_id}",
                    error=execution_result.get("error", "Runbook execution failed"),
                    data={
                        "incident_id": incident_id,
                        "runbook_used": runbook.name,
                        "execution_result": execution_result,
                        "resolution_attempts": incident.metadata["resolution_attempts"]
                    }
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                message="Incident resolution execution failed",
                error=str(e)
            )
    
    def _prepare_execution_context(self, incident: Incident, action: AgentAction) -> Dict[str, Any]:
        """Prepare context for runbook execution"""
        context = {
            "incident_id": incident.id,
            "service_name": "unknown",  # Default
            "target_replicas": 3,       # Default
            "original_replicas": 2      # Default
        }
        
        # Extract service name from affected resources
        for resource in incident.affected_resources:
            if "service" in resource.lower() or "deployment" in resource.lower():
                context["service_name"] = resource
                break
        
        # Extract additional context from incident metadata
        if "service" in incident.metadata:
            context["service_name"] = incident.metadata["service"]
        
        return context
    
    async def _check_incidents_for_escalation(self) -> None:
        """Check active incidents for escalation conditions"""
        try:
            for incident in list(self.active_incidents.values()):
                if incident.escalated:
                    continue  # Already escalated
                
                should_escalate, reason = await self.escalation_manager.should_escalate(incident)
                
                if should_escalate:
                    self.logger.info(f"Escalating incident {incident.id}: {reason}")
                    escalation_result = await self.escalation_manager.escalate_incident(incident, reason)
                    incident.metadata["escalation_result"] = escalation_result
                    
        except Exception as e:
            self.logger.error(f"Error checking incidents for escalation: {str(e)}")