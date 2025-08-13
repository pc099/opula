"""
Integration tests for the Incident Response Agent
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import tempfile
import os

from ..agents.incident_response_agent import (
    IncidentResponseAgent, Alert, Incident
)
from ..core.interfaces import (
    AgentConfig, SystemEvent, AgentAction, ActionResult,
    EventType, ActionType, RiskLevel, AgentType, AutomationLevel, Integration
)


@pytest.fixture
def mock_event_bus():
    """Mock event bus for integration testing"""
    event_bus = Mock()
    event_bus.publish_event = AsyncMock()
    event_bus.subscribe_to_events = AsyncMock()
    event_bus.publish_action = AsyncMock()
    return event_bus


@pytest.fixture
def mock_config_service():
    """Mock configuration service for integration testing"""
    config_service = Mock()
    config_service.load_config = AsyncMock()
    config_service.save_config = AsyncMock()
    config_service.watch_config_changes = AsyncMock()
    return config_service


@pytest.fixture
def mock_audit_service():
    """Mock audit service for integration testing"""
    audit_service = Mock()
    audit_service.log_action = AsyncMock()
    audit_service.log_event = AsyncMock()
    audit_service.log_health_status = AsyncMock()
    return audit_service


@pytest.fixture
def integration_agent_config():
    """Agent configuration for integration testing"""
    return AgentConfig(
        id="incident_response_integration_test",
        name="Integration Test Incident Response Agent",
        type=AgentType.INCIDENT_RESPONSE,
        enabled=True,
        automation_level=AutomationLevel.FULL_AUTO,
        thresholds={
            "correlation_interval": 5,  # Short interval for testing
            "auto_resolution_enabled": True,
            "escalation_enabled": True,
            "max_resolution_attempts": 2
        },
        approval_required=False,
        integrations=[
            Integration(
                name="incident_response",
                type="incident_response",
                config={
                    "model_path": "/tmp/integration_test_model.joblib",
                    "monitoring_systems": ["prometheus", "grafana", "alertmanager"],
                    "notification_channels": ["slack", "email", "pagerduty"]
                },
                enabled=True
            ),
            Integration(
                name="kubernetes",
                type="kubernetes",
                config={
                    "cluster_endpoint": "https://test-cluster.example.com",
                    "namespace": "default"
                },
                enabled=True
            )
        ]
    )


class TestIncidentResponseIntegration:
    """Integration tests for the complete incident response workflow"""
    
    @pytest.mark.asyncio
    async def test_full_incident_lifecycle(self, mock_event_bus, mock_config_service,
                                         mock_audit_service, integration_agent_config):
        """Test complete incident lifecycle from detection to resolution"""
        agent = IncidentResponseAgent(
            "integration_test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        # Initialize and start agent
        await agent.initialize(integration_agent_config)
        await agent.start()
        
        try:
            # Step 1: Simulate multiple related alerts
            alerts = [
                Alert(
                    id="alert_cpu_1",
                    source="prometheus",
                    severity="high",
                    title="High CPU Usage",
                    description="CPU usage above 90% for web-service",
                    timestamp=datetime.utcnow(),
                    labels={"service": "web-service", "resource": "cpu"},
                    metrics={"cpu_usage": 95.0},
                    raw_data={"query": "cpu_usage{service='web-service'} > 90"}
                ),
                Alert(
                    id="alert_memory_1",
                    source="prometheus",
                    severity="high",
                    title="High Memory Usage",
                    description="Memory usage above 85% for web-service",
                    timestamp=datetime.utcnow() + timedelta(seconds=30),
                    labels={"service": "web-service", "resource": "memory"},
                    metrics={"memory_usage": 88.0},
                    raw_data={"query": "memory_usage{service='web-service'} > 85"}
                ),
                Alert(
                    id="alert_response_time_1",
                    source="grafana",
                    severity="medium",
                    title="Increased Response Time",
                    description="Average response time increased to 2.5s",
                    timestamp=datetime.utcnow() + timedelta(seconds=45),
                    labels={"service": "web-service", "metric": "response_time"},
                    metrics={"response_time": 2.5},
                    raw_data={"dashboard": "web-service-performance"}
                )
            ]
            
            # Add alerts to buffer
            agent.alert_buffer.extend(alerts)
            
            # Step 2: Process alerts for correlation
            await agent._process_alert_buffer()
            
            # Verify incidents were created
            assert len(agent.active_incidents) > 0
            
            # Get the created incident
            incident = list(agent.active_incidents.values())[0]
            assert incident.severity in ["high", "medium"]
            assert len(incident.alerts) >= 1
            assert "web-service" in incident.affected_resources
            
            # Step 3: Verify incident detection event was published
            mock_event_bus.publish_event.assert_called()
            published_events = [call[0][0] for call in mock_event_bus.publish_event.call_args_list]
            incident_events = [e for e in published_events if e.type == EventType.INCIDENT_DETECTED]
            assert len(incident_events) > 0
            
            # Step 4: Simulate incident detected event processing
            incident_event = incident_events[0]
            action = await agent._handle_incident_detected_event(incident_event)
            
            # Verify resolution action was created
            assert action is not None
            assert action.type == ActionType.INCIDENT_RESOLVE
            assert action.agent_id == agent.agent_id
            
            # Step 5: Execute the resolution action
            with patch.object(agent.runbook_executor, 'execute_runbook') as mock_execute:
                # Mock successful resolution
                mock_execute.return_value = {
                    "execution_id": "test_execution_123",
                    "runbook_id": "high_latency_basic",
                    "incident_id": incident.id,
                    "start_time": datetime.utcnow(),
                    "end_time": datetime.utcnow() + timedelta(minutes=2),
                    "success": True,
                    "steps_executed": [
                        {
                            "step_type": "check_metrics",
                            "description": "Check current resource usage",
                            "success": True,
                            "output": "CPU: 95%, Memory: 88%"
                        },
                        {
                            "step_type": "scale_up",
                            "description": "Scale up the service",
                            "success": True,
                            "output": "Scaled web-service from 2 to 4 replicas"
                        },
                        {
                            "step_type": "monitor_latency",
                            "description": "Monitor latency improvement",
                            "success": True,
                            "output": "Response time improved to 1.2s"
                        }
                    ],
                    "error": None,
                    "rollback_performed": False
                }
                
                result = await agent._execute_incident_resolution(action)
                
                # Verify successful resolution
                assert result.success is True
                assert incident.id not in agent.active_incidents  # Incident resolved and removed
                assert incident.status == "resolved"
                assert incident.automated_resolution is True
                assert len(incident.resolution_steps) > 0
                
                # Verify audit logging
                mock_audit_service.log_action.assert_called()
                
        finally:
            # Clean up
            await agent.stop()
    
    @pytest.mark.asyncio
    async def test_incident_escalation_workflow(self, mock_event_bus, mock_config_service,
                                              mock_audit_service, integration_agent_config):
        """Test incident escalation when automated resolution fails"""
        agent = IncidentResponseAgent(
            "escalation_test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        # Initialize and start agent
        await agent.initialize(integration_agent_config)
        await agent.start()
        
        try:
            # Create a critical incident
            critical_incident = Incident(
                id="critical_incident_123",
                title="Database Connection Failure",
                description="All database connections are failing",
                severity="critical",
                status="open",
                affected_resources=["database", "api-service"],
                alerts=[
                    Alert(
                        id="db_alert_1",
                        source="database_monitor",
                        severity="critical",
                        title="Database Connection Timeout",
                        description="Cannot connect to primary database",
                        timestamp=datetime.utcnow(),
                        labels={"service": "database", "type": "connection"},
                        metrics={"connection_count": 0},
                        raw_data={"error": "connection_timeout"}
                    )
                ],
                detected_at=datetime.utcnow(),
                resolved_at=None,
                resolution_steps=[],
                automated_resolution=False,
                escalated=False,
                root_cause=None,
                metadata={"alert_count": 1, "sources": ["database_monitor"]}
            )
            
            # Add to active incidents
            agent.active_incidents[critical_incident.id] = critical_incident
            
            # Step 1: Check if critical incident should be escalated immediately
            should_escalate, reason = await agent.escalation_manager.should_escalate(critical_incident)
            assert should_escalate is True
            assert "Critical" in reason
            
            # Step 2: Escalate the incident
            escalation_result = await agent.escalation_manager.escalate_incident(critical_incident, reason)
            
            # Verify escalation
            assert escalation_result["success"] is True
            assert critical_incident.escalated is True
            assert len(escalation_result["notifications_sent"]) > 0
            
            # Verify notifications were sent to multiple channels
            notification_channels = [n["channel"] for n in escalation_result["notifications_sent"]]
            assert "slack" in notification_channels
            assert "email" in notification_channels
            assert "pagerduty" in notification_channels
            
        finally:
            # Clean up
            await agent.stop()
    
    @pytest.mark.asyncio
    async def test_multiple_concurrent_incidents(self, mock_event_bus, mock_config_service,
                                               mock_audit_service, integration_agent_config):
        """Test handling multiple concurrent incidents"""
        agent = IncidentResponseAgent(
            "concurrent_test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        # Initialize and start agent
        await agent.initialize(integration_agent_config)
        await agent.start()
        
        try:
            # Create multiple incidents for different services
            incidents = []
            for i in range(3):
                incident = Incident(
                    id=f"incident_{i}",
                    title=f"Service {i} Performance Issue",
                    description=f"Performance degradation in service-{i}",
                    severity="high",
                    status="open",
                    affected_resources=[f"service-{i}"],
                    alerts=[
                        Alert(
                            id=f"alert_{i}",
                            source="monitoring",
                            severity="high",
                            title=f"High Latency Service {i}",
                            description=f"Service-{i} response time > 5s",
                            timestamp=datetime.utcnow(),
                            labels={"service": f"service-{i}"},
                            metrics={"response_time": 6.0 + i},
                            raw_data={"service": f"service-{i}"}
                        )
                    ],
                    detected_at=datetime.utcnow(),
                    resolved_at=None,
                    resolution_steps=[],
                    automated_resolution=False,
                    escalated=False,
                    root_cause=None,
                    metadata={"alert_count": 1}
                )
                incidents.append(incident)
                agent.active_incidents[incident.id] = incident
            
            # Process all incidents concurrently
            tasks = []
            for incident in incidents:
                # Create incident detected events
                event = SystemEvent(
                    id=f"event_{incident.id}",
                    type=EventType.INCIDENT_DETECTED,
                    source=agent.agent_id,
                    severity=incident.severity,
                    data={
                        "incident_id": incident.id,
                        "incident_type": "high_latency",
                        "classification_confidence": 0.9
                    }
                )
                
                # Process event to create action
                task = agent._handle_incident_detected_event(event)
                tasks.append(task)
            
            # Wait for all actions to be created
            actions = await asyncio.gather(*tasks)
            
            # Verify all incidents generated actions
            assert len(actions) == 3
            assert all(action is not None for action in actions)
            assert all(action.type == ActionType.INCIDENT_RESOLVE for action in actions)
            
            # Execute all resolution actions concurrently
            with patch.object(agent.runbook_executor, 'execute_runbook') as mock_execute:
                # Mock successful resolution for all
                mock_execute.return_value = {
                    "execution_id": "concurrent_test",
                    "success": True,
                    "steps_executed": [{"description": "Test step", "success": True}],
                    "error": None
                }
                
                resolution_tasks = [
                    agent._execute_incident_resolution(action) 
                    for action in actions
                ]
                
                results = await asyncio.gather(*resolution_tasks)
                
                # Verify all resolutions were successful
                assert len(results) == 3
                assert all(result.success for result in results)
                
                # Verify all incidents were resolved
                assert len(agent.active_incidents) == 0  # All should be resolved and removed
                
        finally:
            # Clean up
            await agent.stop()
    
    @pytest.mark.asyncio
    async def test_alert_correlation_accuracy(self, mock_event_bus, mock_config_service,
                                            mock_audit_service, integration_agent_config):
        """Test accuracy of alert correlation"""
        agent = IncidentResponseAgent(
            "correlation_test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        # Initialize agent
        await agent.initialize(integration_agent_config)
        
        # Create alerts that should be correlated (same service, similar time)
        now = datetime.utcnow()
        related_alerts = [
            Alert(
                id="related_1",
                source="prometheus",
                severity="high",
                title="High CPU Usage - web-app",
                description="CPU usage 95% on web-app pods",
                timestamp=now,
                labels={"service": "web-app", "resource": "cpu"},
                metrics={"cpu_usage": 95.0},
                raw_data={}
            ),
            Alert(
                id="related_2",
                source="prometheus",
                severity="high",
                title="High Memory Usage - web-app",
                description="Memory usage 90% on web-app pods",
                timestamp=now + timedelta(seconds=30),
                labels={"service": "web-app", "resource": "memory"},
                metrics={"memory_usage": 90.0},
                raw_data={}
            ),
            Alert(
                id="related_3",
                source="kubernetes",
                severity="medium",
                title="Pod Restarts - web-app",
                description="Multiple pod restarts detected",
                timestamp=now + timedelta(seconds=60),
                labels={"service": "web-app", "resource": "pods"},
                metrics={"restart_count": 3},
                raw_data={}
            )
        ]
        
        # Create unrelated alert (different service, different time)
        unrelated_alert = Alert(
            id="unrelated_1",
            source="prometheus",
            severity="low",
            title="Disk Usage - database",
            description="Disk usage 75% on database server",
            timestamp=now + timedelta(minutes=30),  # Much later
            labels={"service": "database", "resource": "disk"},
            metrics={"disk_usage": 75.0},
            raw_data={}
        )
        
        # Test correlation
        all_alerts = related_alerts + [unrelated_alert]
        incidents = await agent.alert_correlator.correlate_alerts(all_alerts)
        
        # Verify correlation results
        assert len(incidents) >= 1  # Should create at least one incident
        
        # Find the incident with web-app alerts
        web_app_incident = None
        for incident in incidents:
            if "web-app" in incident.affected_resources:
                web_app_incident = incident
                break
        
        assert web_app_incident is not None
        
        # Verify that related alerts were correlated together
        web_app_alert_ids = [alert.id for alert in web_app_incident.alerts]
        related_alert_ids = [alert.id for alert in related_alerts]
        
        # At least some of the related alerts should be in the same incident
        correlation_count = len(set(web_app_alert_ids) & set(related_alert_ids))
        assert correlation_count >= 2  # At least 2 related alerts should be correlated
        
        # Verify unrelated alert is in a separate incident (if it created one)
        unrelated_in_web_app = "unrelated_1" in web_app_alert_ids
        assert not unrelated_in_web_app  # Unrelated alert should not be in web-app incident
    
    @pytest.mark.asyncio
    async def test_runbook_execution_with_rollback(self, mock_event_bus, mock_config_service,
                                                 mock_audit_service, integration_agent_config):
        """Test runbook execution with rollback on failure"""
        agent = IncidentResponseAgent(
            "rollback_test_agent",
            mock_event_bus,
            mock_config_service,
            mock_audit_service
        )
        
        # Initialize agent
        await agent.initialize(integration_agent_config)
        
        # Create test incident
        incident = Incident(
            id="rollback_test_incident",
            title="Service Deployment Failure",
            description="New deployment is failing",
            severity="high",
            status="open",
            affected_resources=["web-service"],
            alerts=[],
            detected_at=datetime.utcnow(),
            resolved_at=None,
            resolution_steps=[],
            automated_resolution=False,
            escalated=False,
            root_cause=None,
            metadata={}
        )
        
        # Get a runbook that has rollback steps
        runbook = agent.runbook_executor.runbooks["service_down"]
        context = {"service_name": "web-service", "target_replicas": 3, "original_replicas": 2}
        
        # Mock runbook execution with failure requiring rollback
        with patch.object(agent.runbook_executor, '_execute_step') as mock_step:
            # First step succeeds, second step fails (critical), then rollback steps
            step_results = [
                # Normal steps
                {"step_type": "check_service_status", "success": True, "output": "Service down"},
                {"step_type": "restart_service", "success": False, "error": "Restart failed", "critical": True},
                # Rollback steps
                {"step_type": "rollback_deployment", "success": True, "output": "Rollback completed"}
            ]
            
            mock_step.side_effect = step_results
            
            # Execute runbook
            result = await agent.runbook_executor.execute_runbook(runbook, incident, context)
            
            # Verify rollback was performed
            assert result["rollback_performed"] is True
            assert result["success"] is False  # Overall execution failed
            assert len(result["steps_executed"]) >= 2  # At least normal steps were executed
            
            # Verify rollback steps were executed
            if "rollback_steps" in result:
                assert len(result["rollback_steps"]) > 0
                assert result["rollback_steps"][0]["success"] is True


if __name__ == "__main__":
    pytest.main([__file__])