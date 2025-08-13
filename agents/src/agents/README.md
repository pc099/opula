# Terraform Agent

The Terraform Agent is an AI-powered agent that automatically detects and fixes Terraform configuration drift, implements predictive analysis, and provides automated remediation workflows.

## Features

### 1. Terraform State Monitoring and Drift Detection
- **Continuous Monitoring**: Automatically monitors Terraform state for drift at configurable intervals
- **Drift Analysis**: Compares current infrastructure state with Terraform configuration
- **Change Detection**: Identifies resources that have been modified, created, or destroyed outside of Terraform
- **Severity Assessment**: Categorizes drift based on impact (low, medium, high, critical)

### 2. Automated Plan Generation and Safe Application Workflows
- **Plan Generation**: Automatically generates Terraform plans when drift is detected
- **Safe Application**: Applies changes only when confidence threshold is met
- **Approval Workflows**: Requires human approval for high-risk changes
- **Rollback Support**: Maintains plan history for potential rollbacks

### 3. ML Model for Drift Prediction
- **Historical Analysis**: Uses historical drift data to predict future drift occurrences
- **Feature Engineering**: Extracts relevant features from infrastructure state and changes
- **Confidence Scoring**: Provides confidence scores for automated remediation decisions
- **Model Training**: Continuously improves predictions based on new data

### 4. Integration Support
- **Local State**: Supports local Terraform state files
- **Remote Backends**: Compatible with S3, Azure Blob, GCS, and other remote backends
- **Terraform Cloud**: Full integration with Terraform Cloud workspaces
- **Multi-Provider**: Works with AWS, Azure, GCP, and other Terraform providers

## Configuration

### Basic Configuration

```json
{
  "id": "terraform-agent-1",
  "name": "Production Terraform Agent",
  "type": "terraform",
  "enabled": true,
  "automation_level": "semi_auto",
  "thresholds": {
    "drift_check_interval": 300,
    "auto_apply_threshold": 0.8
  },
  "approval_required": true,
  "integrations": [
    {
      "name": "terraform",
      "type": "terraform",
      "config": {
        "workspace_path": "/path/to/terraform/workspace",
        "backend_config": {
          "type": "local"
        }
      }
    }
  ]
}
```

### Advanced Configuration with Terraform Cloud

```json
{
  "integrations": [
    {
      "name": "terraform",
      "type": "terraform",
      "config": {
        "workspace_path": "/path/to/terraform/workspace",
        "backend_config": {
          "type": "remote",
          "organization": "my-org",
          "workspace": "production"
        },
        "terraform_cloud": {
          "organization": "my-org",
          "workspace": "production-infrastructure",
          "token": "${TERRAFORM_CLOUD_TOKEN}"
        },
        "model_path": "/path/to/drift_model.joblib"
      }
    }
  ]
}
```

## Configuration Parameters

### Agent-Level Parameters

- **`drift_check_interval`**: Interval in seconds between drift checks (default: 300)
- **`auto_apply_threshold`**: Confidence threshold for automatic application (default: 0.8)

### Integration Parameters

- **`workspace_path`**: Path to the Terraform workspace directory
- **`backend_config`**: Terraform backend configuration
- **`model_path`**: Path to the ML model file (optional)
- **`terraform_cloud`**: Terraform Cloud integration settings (optional)

## Automation Levels

### Manual (`manual`)
- Drift detection only
- All actions require explicit approval
- No automated remediation

### Semi-Automatic (`semi_auto`)
- Automatic drift detection
- Plan generation without approval
- Apply actions require approval for high-risk changes
- Low-risk changes can be auto-applied based on confidence threshold

### Full Automatic (`full_auto`)
- Automatic drift detection
- Automatic plan generation
- Automatic application for high-confidence changes
- Human intervention only for critical issues

## Event Types

The Terraform Agent subscribes to and processes the following events:

### Infrastructure Drift Events
- **Type**: `INFRASTRUCTURE_DRIFT`
- **Trigger**: Detected when Terraform state differs from configuration
- **Response**: Generates plan or apply actions based on automation level

## Action Types

The Terraform Agent can perform the following actions:

### Terraform Plan (`TERRAFORM_PLAN`)
- Generates a Terraform plan showing proposed changes
- Low to medium risk
- Used for drift analysis and change preview

### Terraform Apply (`TERRAFORM_APPLY`)
- Applies Terraform changes to infrastructure
- Risk level varies based on changes
- Requires approval unless confidence is very high

## ML Model Features

The drift prediction model uses the following features:

1. **Resource Count**: Number of resources affected by drift
2. **Time Since Last Apply**: Hours since last Terraform apply
3. **Configuration Changes**: Number of recent configuration changes
4. **External Changes**: Number of changes made outside Terraform
5. **Average Drift Frequency**: Historical drift frequency for this workspace
6. **Resource Complexity**: Complexity score based on resource types and dependencies

## Usage Examples

### Starting the Agent

```python
from src.agents.terraform_agent import TerraformAgent
from src.core.interfaces import AgentConfig, AgentType, AutomationLevel

# Create configuration
config = AgentConfig(
    id="terraform-agent-1",
    name="My Terraform Agent",
    type=AgentType.TERRAFORM,
    automation_level=AutomationLevel.SEMI_AUTO,
    # ... other configuration
)

# Create and start agent
agent = TerraformAgent("terraform-agent-1", event_bus, config_service, audit_service)
await agent.initialize(config)
await agent.start()
```

### Processing Drift Events

```python
from src.core.interfaces import SystemEvent, EventType

# Create drift event
drift_event = SystemEvent(
    id="drift-1",
    type=EventType.INFRASTRUCTURE_DRIFT,
    source="terraform-monitor",
    severity="medium",
    data={
        "drift_detected": True,
        "changes": [
            {
                "resource": "aws_instance.web",
                "action": "modified",
                "details": ["~ instance_type = t2.micro -> t2.small"]
            }
        ]
    }
)

# Process event
action = await agent.process_event(drift_event)
if action:
    result = await agent.execute_action(action)
```

## Monitoring and Observability

### Health Metrics

The agent provides the following health metrics:

- **Events Processed**: Total number of drift events processed
- **Actions Executed**: Total number of actions executed
- **Success Rate**: Percentage of successful actions
- **Average Execution Time**: Average time to execute actions
- **Error Count**: Number of errors encountered

### Logging

All agent activities are logged with structured logging:

- Drift detection results
- Action generation and execution
- ML model predictions
- Configuration changes
- Error conditions

### Audit Trail

Complete audit trail is maintained for:

- All infrastructure changes
- Action approvals and rejections
- Configuration modifications
- Health status changes

## Troubleshooting

### Common Issues

1. **Terraform Binary Not Found**
   - Ensure Terraform is installed and in PATH
   - Check workspace_path configuration

2. **State Access Issues**
   - Verify backend configuration
   - Check credentials for remote backends

3. **High Error Rate**
   - Review Terraform configuration syntax
   - Check resource dependencies
   - Verify provider credentials

4. **Model Prediction Issues**
   - Ensure sufficient historical data
   - Check model file path and permissions
   - Review feature extraction logic

### Debug Mode

Enable debug logging for detailed troubleshooting:

```python
import logging
logging.getLogger("terraform.agent").setLevel(logging.DEBUG)
```

## Security Considerations

1. **Credential Management**: Use secure credential storage (HashiCorp Vault, AWS Secrets Manager)
2. **State File Security**: Encrypt state files and limit access
3. **Network Security**: Use VPN or private networks for Terraform operations
4. **Audit Logging**: Enable comprehensive audit logging for compliance
5. **Approval Workflows**: Implement proper approval workflows for production changes

## Performance Tuning

1. **Drift Check Interval**: Adjust based on infrastructure change frequency
2. **Confidence Threshold**: Tune based on risk tolerance and accuracy requirements
3. **Resource Filtering**: Filter out non-critical resources from monitoring
4. **Parallel Processing**: Use multiple agents for large infrastructures

## Contributing

When contributing to the Terraform Agent:

1. Add comprehensive tests for new features
2. Update documentation for configuration changes
3. Follow the existing code style and patterns
4. Ensure backward compatibility
5. Add appropriate logging and error handling