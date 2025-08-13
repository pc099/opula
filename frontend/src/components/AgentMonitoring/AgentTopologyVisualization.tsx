import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Box, Paper, Typography } from '@mui/material';
import { Agent } from '../../store/slices/agentsSlice';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  status: string;
  health: string;
  group: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  type: string;
}

interface AgentTopologyVisualizationProps {
  agents: Agent[];
  width?: number;
  height?: number;
}

const AgentTopologyVisualization: React.FC<AgentTopologyVisualizationProps> = ({
  agents,
  width = 800,
  height = 600,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || agents.length === 0) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    // Create nodes from agents
    const nodes: Node[] = agents.map((agent, index) => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      health: agent.health,
      group: getGroupByType(agent.type),
    }));

    // Create links between agents (simplified topology)
    const links: Link[] = createAgentLinks(agents);

    // Set up SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Create simulation
    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Create nodes
    const node = svg.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add circles for nodes
    node.append('circle')
      .attr('r', 20)
      .attr('fill', d => getNodeColor(d.status, d.health))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add labels
    node.append('text')
      .text(d => d.name)
      .attr('x', 0)
      .attr('y', -25)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold');

    // Add status indicators
    node.append('text')
      .text(d => d.status)
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#666');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x!)
        .attr('y1', d => (d.source as Node).y!)
        .attr('x2', d => (d.target as Node).x!)
        .attr('y2', d => (d.target as Node).y!);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [agents, width, height]);

  const getGroupByType = (type: string): number => {
    const typeMap: Record<string, number> = {
      'terraform': 1,
      'kubernetes': 2,
      'incident-response': 3,
      'cost-optimization': 4,
    };
    return typeMap[type] || 0;
  };

  const getNodeColor = (status: string, health: string): string => {
    if (status === 'error' || health === 'critical') return '#f44336';
    if (status === 'inactive' || health === 'warning') return '#ff9800';
    if (status === 'maintenance') return '#9e9e9e';
    return '#4caf50';
  };

  const createAgentLinks = (agents: Agent[]): Link[] => {
    const links: Link[] = [];
    
    // Create links based on agent relationships
    // For now, create a simple hub topology with incident-response as central
    const incidentAgent = agents.find(a => a.type === 'incident-response');
    if (incidentAgent) {
      agents.forEach(agent => {
        if (agent.id !== incidentAgent.id) {
          links.push({
            source: incidentAgent.id,
            target: agent.id,
            type: 'coordination'
          });
        }
      });
    }

    return links;
  };

  return (
    <Paper sx={{ p: 2, height: height + 40 }}>
      <Typography variant="h6" gutterBottom>
        Agent Topology
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <svg ref={svgRef} style={{ border: '1px solid #e0e0e0' }} />
      </Box>
    </Paper>
  );
};

export default AgentTopologyVisualization;