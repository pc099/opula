"""
Tests for the Incident Response Agent
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import tempfile
import os

from ..agents.incident_response_agent import (
    IncidentResponseAgent, AlertCorrelator, IncidentClassifier,
    RunbookExecutor, EscalationManager, Alert, Incident, Runbook
)
from ..core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, AgentType, AutomationLevel, Integration
)


@pytest.fixture
def mock_event_bus():
    """Mock event bus"""
    event_bus = Mock()
    event_bus.publish_event = AsyncMock()
    event_bus.subscribe_to_events = AsyncMock()
    event_bus.publish_action = AsyncMock()
    return event_bus


@pytest.fixture
def mock_config_service():
    """Mock configuration service"""
    config_service = Mock()
    config_service.load_config = AsyncMock()
    config_service.save_config = AsyncMock()
    config_service.watch_config_changes = AsyncMock()
    return config_service


@pytest.fixture
def mock_audit_service():
    """Mock audit service"""
    audit_service = Mock()
    audit_service.log_action = AsyncMock()
    audit_service.log_event = AsyncMock()
    audit_service.log_health_status = AsyncMock()
    return audit_service


@pytest.fixture
def sample_agent_config():
    """Sample agent configuration"""
    return AgentConfig(
        id="incident_response_agent_1",
        name="Test Incident Response Agent",
        type=AgentType.INCIDENT_RESPONSE,
        enabled=True,
        automation_level=AutomationLevel.SEMI_AUTO,
        thresholds={
            "correlation_interval": 30,
            "auto_resolution_enabled": True,
            "escalation_enabled": True,
            "max_resolution_attempts": 2
        },
        approval_required=False,
        integrations=[
            Integration(
                name="incident_response",
                type="incident_response",
                config={"model_path": "/tmp/test_model.joblib"},
                enabled=True
            )
        ]
    )


@pytest.fixture
def sample_alerts():
    """Sample alerts for testing"""
    now = datetime.utcnow()
    return [
        Alert(
            id="alert_1",
            source="prometheus",
            severity="high",
            title="High CPU Usage",
            description="CPU usage above 90% for 5 minutes",
            timestamp=now,
            labels={"service": "web-app", "resource": "cpu"},
            metrics={"cpu_usage": 95.0},
            raw_data={"query": "cpu_usage > 90"}
        ),
        Alert(
            id="alert_2",
            source="prometheus",
            severity="high",
            title="High Memory Usage",
            description="Memory usage above 85% for 3 minutes",
            timestamp=now + timedelta(seconds=30),
            labels={"service": "web-app", "resource": "memory"},
            metrics={"memory_usage": 88.0},
            raw_data={"query": "memory_usage > 85"}
        ),
        Alert(
            id="alert_3",
            source="kubernetes",
            severity="critical",
            title="Pod Crash Loop",
            description="Pod web-app-deployment-xyz is in crash loop",
            timestamp=now + timedelta(seconds=60),
            labels={"service": "web-app", "resource": "pod"},
            metrics={"restart_count": 5},
            raw_data={"pod_name": "web-app-deployment-xyz"}
        )
    ]


@pytest.fixture
def sample_incident(sample_alerts):
    """Sample incident for testing"""
    return Incident(
        id="incident_123",
        title="Web App Performance Issues",
        description="Multiple alerts indicating performance degradation",
        severity="high",
        status="open",
        affected_resources=["web-app"],
        alerts=sample_alerts[:2],  # First two alerts
        detected_at=datetime.utcnow(),
        resolved_at=None,
        resolution_steps=[],
        automated_resolution=False,
        escalated=False,
        root_cause=None,
        metadata={"alert_count": 2, "sources": ["prometheus"]}
    )


class TestAlertCorrelator:
    """Test cases for AlertCorrelator"""
    
    def test_init(self):
        """Test AlertCorrelator initialization"""
        correlator = AlertCorrelator()
        assert correlator.correlation_window == timedelta(minutes=15)
        assert correlator.similarity_threshold == 0.7
        assert correlator.clustering_model is not None
        assert correlator.vectorizer is not None
    
    @pytest.mark.asyncio
    async def test_correlate_alerts_empty(self):
        """Test correlating empty alert list"""
        correlator = AlertCorrelator()
        incidents = await correlator.correlate_alerts([])
        assert incidents == []
    
    @pytest.mark.asyncio
    async def test_correlate_single_alert(self, sample_alerts):
        """Test correlating single alert"""
        correlator = AlertCorrelator()
        incidents = await correlator.correlate_alerts([sample_alerts[0]])
        
        assert len(incidents) == 1
        assert incidents[0].title == sample_alerts[0].title
        assert len(incidents[0].alerts) == 1
        assert incidents[0].alerts[0].id == sample_alerts[0].id
    
    @pytest.mark.asyncio
    async def test_correlate_multiple_alerts(self, sample_alerts):
        """Test correlating multiple related alerts"""
        correlator = AlertCorrelator()
        
        # Use alerts with same timestamp to ensure they're in same time window
        for alert in sample_alerts:
            alert.timestamp = datetime.utcnow()
        
        incidents = await correlator.correlate_alerts(sample_alerts)
        
        assert len(incidents) >= 1
        # Should have correlated some alerts
        total_alerts = sum(len(incident.alerts) for incident in incidents)
        assert total_alerts == len(sample_alerts)
    
    def test_group_alerts_by_time(self, sample_alerts):
        """Test grouping alerts by time windows"""
        correlator = AlertCorrelator()
        
        # Set up alerts with different timestamps
        now = datetime.utcnow()
        sample_alerts[0].timestamp = now
        sample_alerts[1].timestamp = now + timedelta(minutes=5)  # Same window
        sample_alerts[2].timestamp = now + timedelta(minutes=20)  # Different window
        
        groups = correlator._group_alerts_by_time(sample_alerts)
        
        assert len(groups) == 2  # Two time windows
        assert len(groups[0]) == 2  # First two alerts
        assert len(groups[1]) == 1  # Last alert
    
    def test_create_incident_from_single_alert(self, sample_alerts):
        """Test creating incident from single alert"""
        correlator = AlertCorrelator()
        incident = correlator._create_incident_from_alerts([sample_alerts[0]])
        
        assert incident.title == sample_alerts[0].title
        assert incident.description == sample_alerts[0].description
        assert incident.severity == sample_alerts[0].severity
        assert len(incident.alerts) == 1
        assert incident.status == "open"
    
    def test_create_incident_from_multiple_alerts(self, sample_alerts):
        """Test creating incident from multiple alerts"""
        correlator = AlertCorrelator()
        incident = correlator._create_incident_from_alerts(sample_alerts[:2])
        
        assert "Multiple alerts" in incident.title
        assert len(incident.alerts) == 2
        assert incident.severity == "high"  # Highest severity from alerts
        assert incident.status == "open"


class TestIncidentClassifier:
    """Test cases for IncidentClassifier"""
    
    def test_init(self):
        """Test IncidentClassifier initialization"""
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = os.path.join(temp_dir, "test_model.joblib")
            classifier = IncidentClassifier(model_path)
            assert classifier.model_path == model_path
            assert len(classifier.incident_types) > 0
    
    @pytest.mark.asyncio
    async def test_classify_incident(self, sample_incident):
        """Test incident classification"""
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = os.path.join(temp_dir, "test_model.joblib")
            classifier = IncidentClassifier(model_path)
            
            incident_type, confidence = await classifier.classify_incident(sample_incident)
            
            assert incident_type in classifier.incident_types
            assert 0.0 <= confidence <= 1.0
    
    def test_preprocess_text(self):
        """Test text preprocessing"""
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = os.path.join(temp_dir, "test_model.joblib")
            classifier = IncidentClassifier(model_path)
            
            text = "High CPU Usage! Service is DOWN 123"
            processed = classifier._preprocess_text(text)
            
            assert processed.islower()
            assert "123" not in processed  # Numbers removed
            assert "!" not in processed    # Special chars removed
    
    def test_prepare_text_for_classification(self, sample_incident):
        """Test preparing incident text for classification"""
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = os.path.join(temp_dir, "test_model.joblib")
            classifier = IncidentClassifier(model_path)
            
            text = classifier._prepare_text_for_classification(sample_incident)
            
            # Check that key words from title and description are present
            assert "web app" in text.lower()
            assert "performance" in text.lower()
            assert "multiple alert" in text.lower()


class TestRunbookExecutor:
    """Test cases for RunbookExecutor"""
    
    def test_init(self):
        """Test RunbookExecutor initialization"""
        executor = RunbookExecutor()
        assert len(executor.runbooks) > 0
        assert "service_down" in executor.runbooks
        assert "high_latency" in executor.runbooks
        assert "resource_exhaustion" in executor.runbooks
    
    @pytest.mark.asyncio
    async def test_find_applicable_runbooks(self, sample_incident):
        """Test finding applicable runbooks"""
        executor = RunbookExecutor()
        
        runbooks = await executor.find_applicable_runbooks(sample_incident, "service_down")
        
        assert len(runbooks) > 0
        assert any("service_down" in rb.incident_patterns for rb in runbooks)
    
    @pytest.mark.asyncio
    async def test_execute_runbook(self, sample_incident):
        """Test runbook execution"""
        executor = RunbookExecutor()
        runbook = executor.runbooks["service_down"]
        context = {"service_name": "web-app", "target_replicas": 3}
        
        result = await executor.execute_runbook(runbook, sample_incident, context)
        
        assert "execution_id" in result
        assert "runbook_id" in result
        assert "incident_id" in result
        assert "success" in result
        assert "steps_executed" in result
        assert len(result["steps_executed"]) > 0
    
    @pytest.mark.asyncio
    async def test_execute_step(self):
        """Test individual step execution"""
        executor = RunbookExecutor()
        step = {
            "type": "check_service_status",
            "description": "Check service health",
            "command": "kubectl get pods -l app={service_name}",
            "timeout": 30
        }
        context = {"service_name": "web-app"}
        
        result = await executor._execute_step(step, context)
        
        assert result["step_type"] == "check_service_status"
        assert result["success"] is True  # Simulated success
        assert "output" in result


class TestEscalationManager:
    """Test cases for EscalationManager"""
    
    def test_init(self):
        """Test EscalationManager initialization"""
        manager = EscalationManager()
        assert len(manager.escalation_rules) > 0
        assert any("Critical" in rule["name"] for rule in manager.escalation_rules)
    
    @pytest.mark.asyncio
    async def test_should_escalate_critical(self, sample_incident):
        """Test escalation for critical incident"""
        manager = EscalationManager()
        sample_incident.severity = "critical"
        
        should_escalate, reason = await manager.should_escalate(sample_incident)
        
        assert should_escalate is True
        assert "Critical" in reason
    
    @pytest.mark.asyncio
    async def test_should_escalate_long_running(self, sample_incident):
        """Test escalation for long-running incident"""
        manager = EscalationManager()
        # Set incident as detected 45 minutes ago and configure to avoid other rules
        sample_incident.detected_at = datetime.utcnow() - timedelta(minutes=45)
        sample_incident.severity = "medium"
        sample_incident.automated_resolution = True  # Avoid failed automation rule
        sample_incident.status = "investigating"  # Avoid failed automation rule
        
        should_escalate, reason = await manager.should_escalate(sample_incident)
        
        assert should_escalate is True
        assert "Long Running" in reason
    
    @pytest.mark.asyncio
    async def test_escalate_incident(self, sample_incident):
        """Test incident escalation"""
        manager = EscalationManager()
        
        result = await manager.escalate_incident(sample_incident, "Test escalation")
        
        assert result["success"] is True
        assert result["incident_id"] == sample_incident.id
        assert len(result["notifications_sent"]) > 0
        assert sample_incident.escalated is True
    
    def test_incident_duration(self, sample_incident):
        """Test incident duration calculation"""
        manager = EscalationManager()
        
        # Test ongoing incident
        sample_incident.detected_at = datetime.utcnow() - timedelta(minutes=10)
        duration = manager._incident_duration(sample_incident)
        assert 580 <= duration <= 620  # Around 10 minutes (600 seconds)
        
        # Test resolved incident
        sample_incident.resolved_at = sample_incident.detected_at + timedelta(minutes=5)
        duration = manager._incident_duration(sample_incident)
        assert duration == 300  # Exactly 5 minutes


class TestIncidentResponseAgent:
    """Test cases for IncidentResponseAgent"""
    
    @pytest.mark.asyncio
    async def test_init(self, mock_event_bus, mock_config_service, mock_audit_service):
        """Test agent initialization"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        assert agent.agent_id == "test_agent"
        assert agent.event_bus == mock_event_bus
        assert agent.config_service == mock_config_service
        assert agent.audit_service == mock_audit_service
        assert agent.active_incidents == {}
        assert agent.alert_buffer == []
    
    @pytest.mark.asyncio
    async def test_initialize_agent_specific(self, mock_event_bus, mock_config_service, 
                                           mock_audit_service, sample_agent_config):
        """Test agent-specific initialization"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        assert agent.alert_correlator is not None
        assert agent.incident_classifier is not None
        assert agent.runbook_executor is not None
        assert agent.escalation_manager is not None
        assert agent.correlation_interval == 30  # From config
        assert agent.auto_resolution_enabled is True
        assert agent.escalation_enabled is True
        assert agent.max_resolution_attempts == 2
    
    @pytest.mark.asyncio
    async def test_start_agent_specific(self, mock_event_bus, mock_config_service,
                                      mock_audit_service, sample_agent_config):
        """Test agent-specific startup"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        await agent.start()
        
        assert agent.is_running is True
        assert agent._correlation_task is not None
        assert agent._escalation_monitoring_task is not None
        
        # Clean up
        await agent.stop()
    
    @pytest.mark.asyncio
    async def test_convert_event_to_alert(self, mock_event_bus, mock_config_service,
                                        mock_audit_service, sample_agent_config):
        """Test converting system event to alert"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        event = SystemEvent(
            id="test_event",
            type=EventType.RESOURCE_ANOMALY,
            source="test_source",
            severity="high",
            data={"resource": "cpu", "value": 95.0}
        )
        
        await agent._convert_event_to_alert(event)
        
        assert len(agent.alert_buffer) == 1
        alert = agent.alert_buffer[0]
        assert alert.id == "alert_test_event"
        assert alert.source == "test_source"
        assert alert.severity == "high"
    
    @pytest.mark.asyncio
    async def test_process_new_incident(self, mock_event_bus, mock_config_service,
                                      mock_audit_service, sample_agent_config, sample_incident):
        """Test processing a new incident"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        await agent._process_new_incident(sample_incident)
        
        assert sample_incident.id in agent.active_incidents
        assert "incident_type" in sample_incident.metadata
        assert "classification_confidence" in sample_incident.metadata
        
        # Verify event was published
        mock_event_bus.publish_event.assert_called_once()
        published_event = mock_event_bus.publish_event.call_args[0][0]
        assert published_event.type == EventType.INCIDENT_DETECTED
    
    @pytest.mark.asyncio
    async def test_handle_incident_detected_event(self, mock_event_bus, mock_config_service,
                                                mock_audit_service, sample_agent_config, sample_incident):
        """Test handling incident detected event"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        # Add incident to active incidents
        agent.active_incidents[sample_incident.id] = sample_incident
        
        event = SystemEvent(
            id="incident_event",
            type=EventType.INCIDENT_DETECTED,
            source="test_agent",
            severity="high",
            data={
                "incident_id": sample_incident.id,
                "incident_type": "service_down",
                "classification_confidence": 0.8
            }
        )
        
        action = await agent._handle_incident_detected_event(event)
        
        assert action is not None
        assert action.type == ActionType.INCIDENT_RESOLVE
        assert action.agent_id == "test_agent"
        assert sample_incident.id in action.metadata["incident_id"]
    
    @pytest.mark.asyncio
    async def test_execute_incident_resolution_success(self, mock_event_bus, mock_config_service,
                                                     mock_audit_service, sample_agent_config, sample_incident):
        """Test successful incident resolution"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        # Add incident to active incidents
        agent.active_incidents[sample_incident.id] = sample_incident
        
        action = AgentAction(
            id="test_action",
            agent_id="test_agent",
            type=ActionType.INCIDENT_RESOLVE,
            description="Test resolution",
            target_resources=["web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test impact",
            metadata={
                "incident_id": sample_incident.id,
                "runbook_id": "service_down"
            }
        )
        
        # Mock successful runbook execution
        with patch.object(agent.runbook_executor, 'execute_runbook') as mock_execute:
            mock_execute.return_value = {
                "execution_id": "test_exec",
                "success": True,
                "steps_executed": [{"description": "Test step", "success": True}],
                "error": None
            }
            
            result = await agent._execute_incident_resolution(action)
            
            assert result.success is True
            assert sample_incident.id not in agent.active_incidents  # Removed after resolution
            assert sample_incident.status == "resolved"
            assert sample_incident.automated_resolution is True
    
    @pytest.mark.asyncio
    async def test_execute_incident_resolution_failure(self, mock_event_bus, mock_config_service,
                                                     mock_audit_service, sample_agent_config, sample_incident):
        """Test failed incident resolution"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        await agent.initialize(sample_agent_config)
        
        # Add incident to active incidents
        agent.active_incidents[sample_incident.id] = sample_incident
        
        action = AgentAction(
            id="test_action",
            agent_id="test_agent",
            type=ActionType.INCIDENT_RESOLVE,
            description="Test resolution",
            target_resources=["web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test impact",
            metadata={
                "incident_id": sample_incident.id,
                "runbook_id": "service_down"
            }
        )
        
        # Mock failed runbook execution
        with patch.object(agent.runbook_executor, 'execute_runbook') as mock_execute:
            mock_execute.return_value = {
                "execution_id": "test_exec",
                "success": False,
                "steps_executed": [{"description": "Test step", "success": False}],
                "error": "Test error"
            }
            
            result = await agent._execute_incident_resolution(action)
            
            assert result.success is False
            assert sample_incident.id in agent.active_incidents  # Still active
            assert sample_incident.metadata["resolution_attempts"] == 1
    
    def test_get_subscribed_event_types(self, mock_event_bus, mock_config_service, mock_audit_service):
        """Test getting subscribed event types"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        event_types = agent._get_subscribed_event_types()
        
        assert EventType.INCIDENT_DETECTED in event_types
        assert EventType.RESOURCE_ANOMALY in event_types
        assert EventType.INFRASTRUCTURE_DRIFT in event_types
    
    def test_assess_resolution_risk(self, mock_event_bus, mock_config_service,
                                  mock_audit_service, sample_incident):
        """Test resolution risk assessment"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        runbook = Runbook(
            id="test_runbook",
            name="Test Runbook",
            description="Test",
            incident_patterns=["test"],
            steps=[],
            success_criteria=[],
            rollback_steps=[],
            risk_level="low",
            estimated_duration=5,
            success_rate=0.9
        )
        
        # Test critical incident
        sample_incident.severity = "critical"
        risk = agent._assess_resolution_risk(sample_incident, runbook)
        assert risk == RiskLevel.HIGH
        
        # Test high severity incident
        sample_incident.severity = "high"
        risk = agent._assess_resolution_risk(sample_incident, runbook)
        assert risk == RiskLevel.MEDIUM
        
        # Test low severity incident
        sample_incident.severity = "low"
        risk = agent._assess_resolution_risk(sample_incident, runbook)
        assert risk == RiskLevel.LOW
    
    def test_prepare_execution_context(self, mock_event_bus, mock_config_service,
                                     mock_audit_service, sample_incident):
        """Test preparing execution context"""
        agent = IncidentResponseAgent(
            "test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        action = AgentAction(
            id="test_action",
            agent_id="test_agent",
            type=ActionType.INCIDENT_RESOLVE,
            description="Test",
            target_resources=["web-app"],
            risk_level=RiskLevel.LOW,
            estimated_impact="Test"
        )
        
        context = agent._prepare_execution_context(sample_incident, action)
        
        assert "incident_id" in context
        assert "service_name" in context
        assert "target_replicas" in context
        assert "original_replicas" in context
        assert context["incident_id"] == sample_incident.id


if __name__ == "__main__":
    pytest.main([__file__])