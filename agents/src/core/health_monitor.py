"""
Health monitoring system for AI agents
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass

from .interfaces import HealthStatus, AgentStatus


@dataclass
class HealthCheckResult:
    """Result of a health check"""
    passed: bool
    message: str
    metrics: Dict[str, float]


class HealthMonitor:
    """
    Health monitoring system that tracks agent health status,
    performs periodic health checks, and manages health-based actions.
    """
    
    def __init__(self, check_interval: int = 30):
        self.check_interval = check_interval
        self.health_checks: Dict[str, Callable] = {}
        self.health_history: Dict[str, List[HealthStatus]] = {}
        self.alert_callbacks: List[Callable] = []
        self.is_running = False
        self.monitor_task: Optional[asyncio.Task] = None
        self.logger = logging.getLogger("health_monitor")
        
    def register_health_check(self, name: str, check_func: Callable) -> None:
        """Register a health check function"""
        self.health_checks[name] = check_func
        self.logger.debug(f"Registered health check: {name}")
    
    def register_alert_callback(self, callback: Callable) -> None:
        """Register a callback for health alerts"""
        self.alert_callbacks.append(callback)
        self.logger.debug("Registered health alert callback")
    
    async def start_monitoring(self) -> None:
        """Start the health monitoring loop"""
        if self.is_running:
            self.logger.warning("Health monitor is already running")
            return
        
        self.is_running = True
        self.monitor_task = asyncio.create_task(self._monitoring_loop())
        self.logger.info("Health monitoring started")
    
    async def stop_monitoring(self) -> None:
        """Stop the health monitoring loop"""
        if not self.is_running:
            return
        
        self.is_running = False
        
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Health monitoring stopped")
    
    async def perform_health_check(self, agent_id: str) -> HealthStatus:
        """Perform health check for a specific agent"""
        try:
            check_results = []
            overall_metrics = {}
            
            # Run all registered health checks
            for check_name, check_func in self.health_checks.items():
                try:
                    result = await check_func(agent_id)
                    check_results.append(result)
                    overall_metrics.update(result.metrics)
                    
                except Exception as e:
                    self.logger.error(f"Health check {check_name} failed for agent {agent_id}: {str(e)}")
                    check_results.append(HealthCheckResult(
                        passed=False,
                        message=f"Check {check_name} failed: {str(e)}",
                        metrics={}
                    ))
            
            # Determine overall health status
            failed_checks = [r for r in check_results if not r.passed]
            
            if not check_results:
                status = AgentStatus.OFFLINE
            elif len(failed_checks) == 0:
                status = AgentStatus.HEALTHY
            elif len(failed_checks) <= len(check_results) // 2:
                status = AgentStatus.DEGRADED
            else:
                status = AgentStatus.UNHEALTHY
            
            # Create health status
            health_status = HealthStatus(
                status=status,
                last_heartbeat=datetime.utcnow(),
                uptime=0.0,  # This should be set by the agent
                error_count=len(failed_checks),
                last_error=failed_checks[0].message if failed_checks else None,
                metrics=overall_metrics
            )
            
            # Store in history
            if agent_id not in self.health_history:
                self.health_history[agent_id] = []
            
            self.health_history[agent_id].append(health_status)
            
            # Keep only last 100 entries
            if len(self.health_history[agent_id]) > 100:
                self.health_history[agent_id] = self.health_history[agent_id][-100:]
            
            # Check for alerts
            await self._check_for_alerts(agent_id, health_status)
            
            return health_status
            
        except Exception as e:
            self.logger.error(f"Error performing health check for agent {agent_id}: {str(e)}")
            return HealthStatus(
                status=AgentStatus.UNHEALTHY,
                last_heartbeat=datetime.utcnow(),
                uptime=0.0,
                error_count=1,
                last_error=str(e),
                metrics={}
            )
    
    def get_health_history(self, agent_id: str, hours: int = 24) -> List[HealthStatus]:
        """Get health history for an agent"""
        if agent_id not in self.health_history:
            return []
        
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        return [
            status for status in self.health_history[agent_id]
            if status.last_heartbeat >= cutoff_time
        ]
    
    def get_health_summary(self, agent_id: str) -> Dict[str, any]:
        """Get health summary for an agent"""
        history = self.get_health_history(agent_id)
        
        if not history:
            return {
                "status": "unknown",
                "uptime_percentage": 0.0,
                "avg_error_count": 0.0,
                "status_distribution": {}
            }
        
        # Calculate uptime percentage
        healthy_count = sum(1 for h in history if h.status == AgentStatus.HEALTHY)
        uptime_percentage = (healthy_count / len(history)) * 100
        
        # Calculate average error count
        avg_error_count = sum(h.error_count for h in history) / len(history)
        
        # Status distribution
        status_distribution = {}
        for status in AgentStatus:
            count = sum(1 for h in history if h.status == status)
            status_distribution[status.value] = count
        
        return {
            "current_status": history[-1].status.value,
            "uptime_percentage": uptime_percentage,
            "avg_error_count": avg_error_count,
            "status_distribution": status_distribution,
            "last_check": history[-1].last_heartbeat.isoformat()
        }
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop"""
        while self.is_running:
            try:
                # This would typically get a list of active agents
                # For now, we'll just log that monitoring is running
                self.logger.debug("Health monitoring cycle")
                
                await asyncio.sleep(self.check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {str(e)}")
                await asyncio.sleep(self.check_interval)
    
    async def _check_for_alerts(self, agent_id: str, health_status: HealthStatus) -> None:
        """Check if alerts should be triggered"""
        try:
            # Get recent history to check for patterns
            recent_history = self.get_health_history(agent_id, hours=1)
            
            # Alert conditions
            should_alert = False
            alert_message = ""
            
            # Agent went from healthy to unhealthy
            if (len(recent_history) >= 2 and 
                recent_history[-2].status == AgentStatus.HEALTHY and 
                health_status.status == AgentStatus.UNHEALTHY):
                should_alert = True
                alert_message = f"Agent {agent_id} became unhealthy"
            
            # Agent has been degraded for too long
            elif (len(recent_history) >= 10 and 
                  all(h.status == AgentStatus.DEGRADED for h in recent_history[-10:])):
                should_alert = True
                alert_message = f"Agent {agent_id} has been degraded for extended period"
            
            # High error rate
            elif health_status.error_count > 50:
                should_alert = True
                alert_message = f"Agent {agent_id} has high error count: {health_status.error_count}"
            
            if should_alert:
                for callback in self.alert_callbacks:
                    try:
                        await callback(agent_id, health_status, alert_message)
                    except Exception as e:
                        self.logger.error(f"Error in alert callback: {str(e)}")
                        
        except Exception as e:
            self.logger.error(f"Error checking for alerts: {str(e)}")


# Default health check functions

async def basic_connectivity_check(agent_id: str) -> HealthCheckResult:
    """Basic connectivity health check"""
    try:
        # This would typically ping the agent or check its endpoint
        # For now, we'll simulate a basic check
        return HealthCheckResult(
            passed=True,
            message="Agent is responsive",
            metrics={"response_time": 0.1}
        )
    except Exception as e:
        return HealthCheckResult(
            passed=False,
            message=f"Connectivity check failed: {str(e)}",
            metrics={"response_time": -1}
        )


async def memory_usage_check(agent_id: str) -> HealthCheckResult:
    """Memory usage health check"""
    try:
        # This would typically check actual memory usage
        # For now, we'll simulate
        import psutil
        memory_percent = psutil.virtual_memory().percent
        
        return HealthCheckResult(
            passed=memory_percent < 90,
            message=f"Memory usage: {memory_percent}%",
            metrics={"memory_usage_percent": memory_percent}
        )
    except Exception as e:
        return HealthCheckResult(
            passed=False,
            message=f"Memory check failed: {str(e)}",
            metrics={"memory_usage_percent": -1}
        )


async def disk_usage_check(agent_id: str) -> HealthCheckResult:
    """Disk usage health check"""
    try:
        import psutil
        disk_usage = psutil.disk_usage('/')
        disk_percent = (disk_usage.used / disk_usage.total) * 100
        
        return HealthCheckResult(
            passed=disk_percent < 85,
            message=f"Disk usage: {disk_percent:.1f}%",
            metrics={"disk_usage_percent": disk_percent}
        )
    except Exception as e:
        return HealthCheckResult(
            passed=False,
            message=f"Disk check failed: {str(e)}",
            metrics={"disk_usage_percent": -1}
        )