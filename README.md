# AIOps Platform

An intelligent DevOps automation system that provides a centralized dashboard and AI-powered agents to handle routine infrastructure management tasks.

## Project Structure

```
aiops-platform/
├── frontend/           # React dashboard application
├── backend/            # Node.js API gateway
├── agents/             # Python AI agents
├── shared/types/       # Shared TypeScript interfaces
├── database/           # Database initialization scripts
├── docker-compose.yml  # Container orchestration
└── README.md
```

## Services

- **Frontend**: React-based dashboard with real-time monitoring
- **Backend**: Express.js API gateway with WebSocket support
- **Agents**: Python-based AI agents for automation tasks
- **PostgreSQL**: Primary database for configurations and audit logs
- **Redis**: Event bus and caching layer
- **InfluxDB**: Time-series database for metrics
- **Elasticsearch**: Log storage and search

## Quick Start

1. Clone the repository
2. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```
3. Access the dashboard at http://localhost:3000

## Development

Each service can be developed independently:

- Frontend: `cd frontend && npm run dev`
- Backend: `cd backend && npm run dev`
- Agents: `cd agents && python -m uvicorn main:app --reload`

## Architecture

The platform uses event-driven architecture with microservices:
- AI agents communicate through Redis event bus
- Real-time updates via WebSocket connections
- Comprehensive audit logging and monitoring
- Role-based access control and security