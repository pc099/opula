# AIOps Platform AI Agent Framework

This directory contains the core AI agent framework for the AIOps Platform. The framework provides a standardized way to create, manage, and monitor AI agents that automate DevOps tasks.

## Architecture Overview

The agent framework consists of several key components:

### Core Components

1. **BaseAgent** (`core/base_agent.py`): Abstract base class that provides common functionality for all agents
2. **Interfaces** (`core/interfaces.py`): Data models and interfaces used throughout the framework
3. **AgentFactory** (`core/agent_factory.py`): Factory and registry for creating and managing agent instances
4. **ConfigurationManager** (`core/config_manager.py`): Handles agent configuration loading and hot-reloading
5. **HealthMonitor** (`core/health_monitor.py`): Monitors agent health and provides alerting

### Key Features

- **Standardized Agent Lifecycle**: Initialize, start, stop, and cleanup
- **Event-Driven Architecture**: Agents process system events and generate actions
- **Health Monitoring**: Continuous health checks with status reporting
- **Configuration Hot-Reloading**: Dynamic configuration updates without restart
- **Comprehensive Logging**: Audit trails for all agent actions and events
- **Error Handling**: Robust error handling with recovery mechanisms
- **Metrics Collection**: Performance and operational metrics

## Agent Development

### Creating a New Agent

To create a new agent, extend the `BaseAgent` class and implement the required abstract methods:

```python
from src.core.base_agent import BaseAgent
from src.core.interfaces import SystemEvent, AgentAction, ActionResult, EventType

class MyCustomAgent(BaseAgent):
    async def _initialize_agent_specific(self) -> None:
        # Initialize agent-specific resources
        pass
    
    async def _start_agent_specific(self) -> None:
        # Start agent-specific services
        pass
    
    async def _stop_agent_specific(self) -> None:
        # Clean up agent-specific resources
        pass
    
    async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
        # Process events and generate actions
        pass
    
    async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
        # Execute agent actions
        pass
    
    async def _reload_config_specific(self, old_config, new_config) -> None:
        # Handle configuration changes
        pass
    
    def _get_subscribed_event_types(self) -> List[EventType]:
        # Return event types this agent handles
        return [EventType.INFRASTRUCTURE_DRIFT]
```

### Agent Configuration

Agents are configured using the `AgentConfig` model:

```python
config = AgentConfig(
    id="my_agent",
    name="My Custom Agent",
    type=AgentType.TERRAFORM,
    enabled=True,
    automation_level=AutomationLevel.SEMI_AUTO,
    thresholds={"cpu_threshold": 80.0},
    approval_required=True,
    integrations=[
        Integration(
            name="terraform",
            type="terraform_cloud",
            config={"token": "...", "organization": "..."}
        )
    ]
)
```

### Event Processing

Agents process system events and can generate actions:

```python
async def _process_event_specific(self, event: SystemEvent) -> Optional[AgentAction]:
    if event.type == EventType.INFRASTRUCTURE_DRIFT:
        return AgentAction(
            id=f"action_{uuid.uuid4()}",
            agent_id=self.agent_id,
            type=ActionType.TERRAFORM_PLAN,
            description="Generate Terraform plan for drift",
            target_resources=[event.source],
            risk_level=RiskLevel.LOW,
            estimated_impact="Generate plan to show changes"
        )
    return None
```

### Action Execution

Actions are executed with comprehensive error handling and logging:

```python
async def _execute_action_specific(self, action: AgentAction) -> ActionResult:
    try:
        # Perform the actual work
        result_data = await self._perform_terraform_plan(action.target_resources)
        
        return ActionResult(
            success=True,
            message="Terraform plan generated successfully",
            data=result_data
        )
    except Exception as e:
        return ActionResult(
            success=False,
            message="Failed to generate Terraform plan",
            error=str(e)
        )
```

## Health Monitoring

The framework includes comprehensive health monitoring:

- **Heartbeat Monitoring**: Regular health checks
- **Error Tracking**: Count and track errors
- **Performance Metrics**: Execution times and success rates
- **Resource Monitoring**: Memory and disk usage
- **Custom Health Checks**: Agent-specific health validations

## Configuration Management

Agents support dynamic configuration updates:

- **Hot-Reloading**: Configuration changes without restart
- **Validation**: Configuration validation before application
- **Versioning**: Track configuration changes over time
- **Rollback**: Ability to rollback to previous configurations

## Testing

The framework includes comprehensive test coverage:

```bash
# Run all tests
pytest src/tests/

# Run specific test file
pytest src/tests/test_base_agent.py

# Run with coverage
pytest --cov=src src/tests/
```

## Example Usage

See `core/example_agent.py` for a complete example implementation that demonstrates all framework features.

## Integration with Backend

The agent framework integrates with the backend services through:

- **Event Bus**: Redis-based event publishing and subscription
- **Configuration Service**: PostgreSQL-based configuration storage
- **Audit Service**: Elasticsearch-based audit logging
- **API Gateway**: REST API for agent management

## Deployment

Agents run as containerized services and can be deployed using:

- **Docker**: Individual agent containers
- **Kubernetes**: Orchestrated deployment with scaling
- **Docker Compose**: Local development environment

## Monitoring and Observability

The framework provides extensive monitoring capabilities:

- **Metrics**: Prometheus-compatible metrics
- **Logging**: Structured logging with correlation IDs
- **Tracing**: Distributed tracing support
- **Health Endpoints**: HTTP health check endpoints

## Security

Security features include:

- **Authentication**: JWT-based authentication
- **Authorization**: Role-based access control
- **Credential Management**: Secure credential storage
- **Audit Trails**: Complete action audit logs