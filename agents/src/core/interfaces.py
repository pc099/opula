"""
Core interfaces and data models for the AIOps Platform AI Agents
"""
from abc import ABC, abstractmethod
from enum import Enum
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field


class AgentType(str, Enum):
    """Types of AI agents in the system"""
    TERRAFORM = "terraform"
    KUBERNETES = "kubernetes"
    INCIDENT_RESPONSE = "incident_response"
    COST_OPTIMIZATION = "cost_optimization"


class ActionType(str, Enum):
    """Types of actions agents can perform"""
    TERRAFORM_APPLY = "terraform_apply"
    TERRAFORM_PLAN = "terraform_plan"
    K8S_SCALE = "k8s_scale"
    K8S_RESTART = "k8s_restart"
    INCIDENT_RESOLVE = "incident_resolve"
    COST_OPTIMIZE = "cost_optimize"
    RESOURCE_CLEANUP = "resource_cleanup"


class EventType(str, Enum):
    """Types of system events"""
    INFRASTRUCTURE_DRIFT = "infrastructure_drift"
    RESOURCE_ANOMALY = "resource_anomaly"
    INCIDENT_DETECTED = "incident_detected"
    COST_THRESHOLD_EXCEEDED = "cost_threshold_exceeded"
    SCALING_REQUIRED = "scaling_required"


class RiskLevel(str, Enum):
    """Risk levels for agent actions"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ActionStatus(str, Enum):
    """Status of agent actions"""
    PENDING = "pending"
    APPROVED = "approved"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentStatus(str, Enum):
    """Status of agents"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    OFFLINE = "offline"


class AutomationLevel(str, Enum):
    """Levels of automation for agents"""
    MANUAL = "manual"
    SEMI_AUTO = "semi_auto"
    FULL_AUTO = "full_auto"


class Integration(BaseModel):
    """External integration configuration"""
    name: str
    type: str
    config: Dict[str, Any]
    enabled: bool = True


class AgentConfig(BaseModel):
    """Configuration for an AI agent"""
    id: str
    name: str
    type: AgentType
    enabled: bool = True
    automation_level: AutomationLevel = AutomationLevel.SEMI_AUTO
    thresholds: Dict[str, float] = Field(default_factory=dict)
    approval_required: bool = True
    integrations: List[Integration] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SystemEvent(BaseModel):
    """System event that triggers agent actions"""
    id: str
    type: EventType
    source: str
    severity: str = Field(..., pattern="^(low|medium|high|critical)$")
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    correlation_id: Optional[str] = None


class ActionResult(BaseModel):
    """Result of an agent action"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


class AgentAction(BaseModel):
    """Action to be performed by an agent"""
    id: str
    agent_id: str
    type: ActionType
    description: str
    target_resources: List[str]
    risk_level: RiskLevel
    estimated_impact: str
    status: ActionStatus = ActionStatus.PENDING
    executed_at: Optional[datetime] = None
    result: Optional[ActionResult] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class HealthStatus(BaseModel):
    """Health status of an agent"""
    status: AgentStatus
    last_heartbeat: datetime
    uptime: float
    error_count: int = 0
    last_error: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)


class AgentInterface(ABC):
    """Abstract base interface for all AI agents"""
    
    @abstractmethod
    async def initialize(self, config: AgentConfig) -> None:
        """Initialize the agent with configuration"""
        pass
    
    @abstractmethod
    async def start(self) -> None:
        """Start the agent"""
        pass
    
    @abstractmethod
    async def stop(self) -> None:
        """Stop the agent"""
        pass
    
    @abstractmethod
    async def process_event(self, event: SystemEvent) -> Optional[AgentAction]:
        """Process a system event and return an action if needed"""
        pass
    
    @abstractmethod
    async def execute_action(self, action: AgentAction) -> ActionResult:
        """Execute an agent action"""
        pass
    
    @abstractmethod
    async def get_health_status(self) -> HealthStatus:
        """Get current health status of the agent"""
        pass
    
    @abstractmethod
    async def reload_config(self, config: AgentConfig) -> None:
        """Reload agent configuration"""
        pass


class ConfigurationInterface(ABC):
    """Interface for configuration management"""
    
    @abstractmethod
    async def load_config(self, agent_id: str) -> AgentConfig:
        """Load configuration for an agent"""
        pass
    
    @abstractmethod
    async def save_config(self, config: AgentConfig) -> None:
        """Save agent configuration"""
        pass
    
    @abstractmethod
    async def watch_config_changes(self, agent_id: str, callback) -> None:
        """Watch for configuration changes"""
        pass


class EventBusInterface(ABC):
    """Interface for event bus communication"""
    
    @abstractmethod
    async def publish_event(self, event: SystemEvent) -> None:
        """Publish an event to the event bus"""
        pass
    
    @abstractmethod
    async def subscribe_to_events(self, event_types: List[EventType], callback) -> None:
        """Subscribe to specific event types"""
        pass
    
    @abstractmethod
    async def publish_action(self, action: AgentAction) -> None:
        """Publish an action for approval/execution"""
        pass


class AuditInterface(ABC):
    """Interface for audit logging"""
    
    @abstractmethod
    async def log_action(self, action: AgentAction, result: ActionResult) -> None:
        """Log an agent action and its result"""
        pass
    
    @abstractmethod
    async def log_event(self, event: SystemEvent) -> None:
        """Log a system event"""
        pass
    
    @abstractmethod
    async def log_health_status(self, agent_id: str, status: HealthStatus) -> None:
        """Log agent health status"""
        pass