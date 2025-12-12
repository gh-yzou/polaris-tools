# Polaris Chatbot Integration

This document describes the chatbot integration that connects Claude LLM with your local MCP server.

## Architecture

The chatbot consists of three main components:

1. **Frontend Chat UI** (`src/components/chat/ChatInterface.tsx`): A React-based chat interface integrated into the `EmbeddedPanel` component
2. **Backend Server** (`server/`): An Express.js server that handles chat requests and manages the Claude API and MCP server connections
3. **MCP Client** (`server/services/mcp-client.ts`): A client that communicates with your local Polaris MCP server

## Setup

### 1. Install Dependencies

```bash
cd console
npm install
```

### 2. Configure Environment Variables

Update the `.env` file in the `console` directory with your Claude API key:

```env
# Claude API Configuration
# Get your API key from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=your-actual-api-key-here

# Chat Server Configuration
CHAT_SERVER_PORT=3001

# MCP Server Configuration
MCP_SERVER_PATH=../mcp-server
```

### 3. Ensure MCP Server is Set Up

Make sure your MCP server is properly configured in the `mcp-server` directory with the required environment variables in `.polaris_mcp.env`.

### 4. Start the Development Servers

You can start both the frontend and backend servers together:

```bash
npm run dev:all
```

Or start them separately:

```bash
# Terminal 1: Start the frontend (Vite dev server)
npm run dev

# Terminal 2: Start the chat backend server
npm run server
```

## Usage

1. Open the Polaris console in your browser (typically at `http://localhost:5173`)
2. Click the "Open Polaris assistant" button in the bottom-right corner
3. Start chatting with the assistant!

The assistant can:
- Answer questions about Apache Polaris
- Execute operations via the MCP server tools
- Help with catalog management, namespaces, tables, and more

## How It Works

### Message Flow

1. User types a message in the chat interface
2. Frontend sends the message to the backend API at `http://localhost:3001/api/chat/message`
3. Backend server:
   - Receives the message
   - Gets available tools from the MCP server
   - Sends the message to Claude API with tool definitions
   - If Claude decides to use a tool, the backend calls the MCP server
   - Streams the response back to the frontend
4. Frontend displays the streaming response in real-time

### MCP Integration

The backend server communicates with the MCP server using JSON-RPC over stdin/stdout:

- Spawns the MCP server process using `uv run polaris-mcp`
- Sends JSON-RPC requests to list and call tools
- Passes tool results back to Claude for processing

### Streaming Responses

The chat uses Server-Sent Events (SSE) for streaming:

- Text deltas are streamed as they arrive from Claude
- Tool usage is displayed in real-time
- Provides a responsive, interactive chat experience

## Development

### Server Structure

```
console/
├── server/
│   ├── index.ts              # Main server entry point
│   ├── routes/
│   │   └── chat.ts           # Chat API routes
│   ├── services/
│   │   └── mcp-client.ts     # MCP server client
│   └── tsconfig.json         # TypeScript config for server
├── src/
│   └── components/
│       ├── chat/
│       │   └── ChatInterface.tsx  # Chat UI component
│       └── layout/
│           └── EmbeddedPanel.tsx  # Panel wrapper
└── .env                      # Environment configuration
```

### API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/chat/message` - Send a chat message (streaming or non-streaming)

### Debugging

To debug the backend server:

```bash
# Enable verbose logging
DEBUG=* npm run server
```

To debug MCP server communication, check the server logs for JSON-RPC messages.

## Troubleshooting

### "Failed to initialize MCP client"

- Ensure `uv` is installed and available in your PATH
- Check that the `MCP_SERVER_PATH` in `.env` points to the correct directory
- Verify the MCP server can be started manually: `cd mcp-server && uv run polaris-mcp`

### "Request failed with status 401"

- Verify your `ANTHROPIC_API_KEY` is correctly set in `.env`
- Check your API key is valid at https://console.anthropic.com/settings/keys

### Chat server not responding

- Make sure the chat server is running on port 3001 (or your configured port)
- Check for port conflicts
- Review server logs for errors

### MCP tools not working

- Ensure your MCP server is properly configured with Polaris credentials in `mcp-server/.polaris_mcp.env`
- Test the MCP server independently using the test client: `cd mcp-server && uv run int_test/client.py`

## Production Deployment

For production, you'll want to:

1. Build the frontend: `npm run build`
2. Build the backend: `npm run server:build`
3. Set up proper environment variables
4. Use a process manager like PM2 for the backend server
5. Serve the frontend through a web server (nginx, Apache, etc.)
6. Consider adding authentication and rate limiting
7. Set up proper error logging and monitoring

## Security Considerations

- The `.env` file contains sensitive API keys and should never be committed to version control
- Consider implementing authentication for the chat API
- Add rate limiting to prevent abuse
- Validate and sanitize all user inputs
- Review MCP server permissions and access controls
