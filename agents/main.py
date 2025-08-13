import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.core.interfaces import AgentType, HealthStatus
from src.core.agent_factory import AgentManager
from src.core.example_agent import ExampleAgent
from src.core.config_manager import ConfigurationManager
from src.core.health_monitor import HealthMonitor
from src.agents.terraform_agent import TerraformAgent
from src.agents.kubernetes_agent import KubernetesAgent
from src.agents.incident_response_agent import IncidentResponseAgent
from src.agents.cost_optimization_agent import CostOptimizationAgent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main")

# Global agent manager
agent_manager: AgentManager = None
health_monitor: HealthMonitor = None


class AgentStatusResponse(BaseModel):
    """Response model for agent status"""
    agent_id: str
    status: str
    health: Dict[str, Any]
    metrics: Dict[str, Any]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global agent_manager, health_monitor
    
    try:
        logger.info("Starting AIOps Platform AI Agents Service")
        
        # Initialize configuration manager
        db_config = {
            "host": os.getenv("DB_HOST", "localhost"),
            "port": int(os.getenv("DB_PORT", "5432")),
            "database": os.getenv("DB_NAME", "aiops_platform"),
            "user": os.getenv("DB_USER", "postgres"),
            "password": os.getenv("DB_PASSWORD", "password")
        }
        
        redis_config = {
            "host": os.getenv("REDIS_HOST", "localhost"),
            "port": int(os.getenv("REDIS_PORT", "6379")),
            "db": int(os.getenv("REDIS_DB", "0"))
        }
        
        config_manager = ConfigurationManager(db_config, redis_config)
        await config_manager.initialize()
        
        # Create mock services for now (these would be real implementations)
        from src.tests.test_base_agent import MockEventBus, MockAuditService
        event_bus = MockEventBus()
        audit_service = MockAuditService()
        
        # Initialize agent manager
        agent_manager = AgentManager(event_bus, config_manager, audit_service)
        
        # Register agent classes
        agent_manager.register_agent_class(AgentType.TERRAFORM, TerraformAgent)
        agent_manager.register_agent_class(AgentType.KUBERNETES, KubernetesAgent)
        agent_manager.register_agent_class(AgentType.INCIDENT_RESPONSE, IncidentResponseAgent)
        agent_manager.register_agent_class(AgentType.COST_OPTIMIZATION, CostOptimizationAgent)
        
        # Initialize health monitor
        health_monitor = HealthMonitor()
        await health_monitor.start_monitoring()
        
        # Load and start agents
        try:
            await agent_manager.load_and_start_agents()
        except Exception as e:
            logger.warning(f"Could not load agents from database: {e}")
            logger.info("Service will start without pre-configured agents")
        
        logger.info("AIOps Platform AI Agents Service started successfully")
        
        yield
        
    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        raise
    finally:
        # Cleanup
        logger.info("Shutting down AIOps Platform AI Agents Service")
        
        if agent_manager:
            await agent_manager.shutdown_all_agents()
        
        if health_monitor:
            await health_monitor.stop_monitoring()
        
        if config_manager:
            await config_manager.close()
        
        logger.info("Service shutdown complete")


app = FastAPI(
    title="AIOps Platform AI Agents",
    version="1.0.0",
    description="AI Agents service for the AIOps Platform",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "OK", "service": "AI Agents"}


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "AIOps Platform AI Agents Service", "version": "1.0.0"}


@app.get("/agents", response_model=Dict[str, Dict[str, Any]])
async def get_all_agents():
    """Get status of all agents"""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    return agent_manager.get_agent_status_summary()


@app.get("/agents/{agent_id}/status", response_model=AgentStatusResponse)
async def get_agent_status(agent_id: str):
    """Get detailed status of a specific agent"""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    
    try:
        health_status = await agent.get_health_status()
        
        return AgentStatusResponse(
            agent_id=agent_id,
            status="running" if agent.is_running else "stopped",
            health=health_status.dict(),
            metrics=agent.metrics
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting agent status: {str(e)}")


@app.post("/agents/{agent_id}/start")
async def start_agent(agent_id: str):
    """Start a specific agent"""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    
    try:
        await agent.start()
        return {"message": f"Agent {agent_id} started successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error starting agent: {str(e)}")


@app.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    """Stop a specific agent"""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    
    try:
        await agent.stop()
        return {"message": f"Agent {agent_id} stopped successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error stopping agent: {str(e)}")


@app.get("/agents/{agent_id}/health")
async def get_agent_health(agent_id: str):
    """Get health status of a specific agent"""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    
    try:
        health_status = await agent.get_health_status()
        return health_status.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting agent health: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)