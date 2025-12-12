/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private mcpServerPath: string;
  private tools: MCPTool[] = [];
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }>();

  constructor() {
    this.mcpServerPath = process.env.MCP_SERVER_PATH || path.join(__dirname, '../../../mcp-server');
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('Initializing MCP client...');
      console.log('MCP server path:', this.mcpServerPath);

      // Start the MCP server process
      this.process = spawn('uv', ['run', 'polaris-mcp'], {
        cwd: this.mcpServerPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          POLARIS_CONFIG_FILE: path.join(this.mcpServerPath, '.polaris_mcp.env'),
        },
      });

      if (!this.process.stdout || !this.process.stdin) {
        throw new Error('Failed to create MCP process stdio');
      }

      // Handle stdout (JSON-RPC responses)
      let buffer = '';
      this.process.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleResponse(response);
            } catch (error) {
              console.error('Failed to parse MCP response:', line, error);
            }
          }
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('MCP stderr:', data.toString());
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        console.log(`MCP server process exited with code ${code}`);
        this.process = null;
      });

      // Wait a bit for the server to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Initialize the MCP protocol
      await this.initializeMCP();

      // Wait for the server to be ready and get available tools
      await this.loadTools();
      console.log('MCP client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  private async initializeMCP() {
    try {
      // Send initialize request
      const initResponse = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: false
          }
        },
        clientInfo: {
          name: 'polaris-chat-client',
          version: '1.0.0'
        }
      });

      console.log('MCP initialization response:', initResponse);

      // Send initialized notification (no response expected)
      if (this.process?.stdin) {
        const notification = {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        };
        this.process.stdin.write(JSON.stringify(notification) + '\n');
      }

      // Wait a bit for the server to finish initialization
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Failed to initialize MCP protocol:', error);
      throw error;
    }
  }

  private handleResponse(response: any) {
    if (response.id !== undefined) {
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new Error(response.error.message || 'MCP request failed'));
        } else {
          pending.resolve(response.result);
        }
      }
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<any> {
    if (!this.process?.stdin) {
      throw new Error('MCP server is not running');
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {},
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const requestStr = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(requestStr, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Set a timeout for the request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  private async loadTools() {
    try {
      const response = await this.sendRequest('tools/list');
      if (response && response.tools) {
        this.tools = response.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          input_schema: tool.inputSchema || {
            type: 'object',
            properties: {},
          },
        }));
        console.log(`Loaded ${this.tools.length} MCP tools`);
      }
    } catch (error) {
      console.error('Failed to load MCP tools:', error);
      // Continue with empty tools list
      this.tools = [];
    }
  }

  async getTools(): Promise<any[]> {
    // Convert MCP tools to Claude tool format
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      });
      return response;
    } catch (error) {
      console.error(`Failed to call tool ${name}:`, error);
      throw error;
    }
  }

  async shutdown() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
