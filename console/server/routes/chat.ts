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

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { MCPClient } from '../services/mcp-client.js';

const router = Router();

// Create Anthropic client lazily to ensure env vars are loaded
let anthropic: Anthropic | null = null;
const getAnthropicClient = () => {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    console.log('Creating Anthropic client with API key:', process.env.ANTHROPIC_API_KEY.substring(0, 20) + '...');
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
};

const mcpClient = new MCPClient();

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: Message[];
  stream?: boolean;
}

// Chat endpoint
router.post('/message', async (req, res) => {
  try {
    const { messages, stream = true }: ChatRequest = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Get available MCP tools
    const tools = await mcpClient.getTools();

    // Set up SSE for streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let streamEnded = false;

      const safeWrite = (data: string) => {
        if (!streamEnded && !res.writableEnded) {
          res.write(data);
        }
      };

      const endStream = () => {
        if (!streamEnded && !res.writableEnded) {
          streamEnded = true;
          res.end();
        }
      };

      try {
        const client = getAnthropicClient();
        console.log('Creating message stream with', messages.length, 'messages and', tools.length, 'tools');

        // Use finalMessage to get the complete response
        const finalMessage = await client.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 4096,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          tools: tools,
        });

        console.log('Initial message created, stop_reason:', finalMessage.stop_reason);

        // Handle tool use in a loop
        let currentResponse = finalMessage;
        let conversationMessages = [...messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }))];

        while (currentResponse.stop_reason === 'tool_use') {
          // Find all tool use blocks
          const toolUseBlocks = currentResponse.content.filter(
            (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
          );

          console.log('Found', toolUseBlocks.length, 'tool use blocks');

          // Add assistant's response to conversation
          conversationMessages.push({
            role: 'assistant',
            content: currentResponse.content,
          });

          // Execute all tools and collect results
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolUseBlock) => {
              console.log('Tool use:', toolUseBlock.name, toolUseBlock.input);
              try {
                const toolResult = await mcpClient.callTool(
                  toolUseBlock.name,
                  toolUseBlock.input
                );
                console.log('Tool result:', toolResult);

                safeWrite(`data: ${JSON.stringify({
                  type: 'tool_use',
                  tool: toolUseBlock.name,
                })}\n\n`);

                return {
                  type: 'tool_result' as const,
                  tool_use_id: toolUseBlock.id,
                  content: JSON.stringify(toolResult),
                };
              } catch (error) {
                console.error('Tool execution error:', error);
                return {
                  type: 'tool_result' as const,
                  tool_use_id: toolUseBlock.id,
                  content: JSON.stringify({ error: 'Tool execution failed' }),
                  is_error: true,
                };
              }
            })
          );

          // Add tool results to conversation
          conversationMessages.push({
            role: 'user',
            content: toolResults,
          });

          // Get next response from Claude with streaming
          console.log('Continuing conversation with tool results');
          const nextStream = await client.messages.stream({
            model: 'claude-opus-4-5',
            max_tokens: 4096,
            messages: conversationMessages,
            tools: tools,
          });

          // Stream the response
          await new Promise<void>((resolve, reject) => {
            nextStream.on('text', (text) => {
              console.log('Streaming text delta:', text);
              safeWrite(`data: ${JSON.stringify({
                type: 'text',
                content: text,
              })}\n\n`);
            });

            nextStream.on('end', () => {
              console.log('Stream chunk ended');
              resolve();
            });

            nextStream.on('error', (error) => {
              console.error('Streaming error:', error);
              reject(error);
            });
          });

          // Get the final message from the stream
          currentResponse = await nextStream.finalMessage();
          console.log('Next response stop_reason:', currentResponse.stop_reason);
        }

        // Stream any remaining text content
        const textContent = currentResponse.content
          .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
          .map(block => block.text)
          .join('');

        if (textContent && conversationMessages.length === messages.length) {
          // Only send this if we haven't streamed it already
          safeWrite(`data: ${JSON.stringify({
            type: 'text',
            content: textContent,
          })}\n\n`);
        }

        console.log('Conversation complete');
        safeWrite(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        endStream();

      } catch (error) {
        console.error('Stream creation error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        } else {
          safeWrite(`data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })}\n\n`);
          endStream();
        }
      }
    } else {
      // Non-streaming response
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        tools: tools,
      });

      // Handle tool calls if any
      let finalResponse = response;
      while (finalResponse.stop_reason === 'tool_use') {
        const toolUseBlock = finalResponse.content.find(
          (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlock) {
          const toolResult = await mcpClient.callTool(
            toolUseBlock.name,
            toolUseBlock.input
          );

          // Continue conversation with tool result
          finalResponse = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 4096,
            messages: [
              ...messages.map(msg => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
              })),
              {
                role: 'assistant' as const,
                content: finalResponse.content,
              },
              {
                role: 'user' as const,
                content: [
                  {
                    type: 'tool_result' as const,
                    tool_use_id: toolUseBlock.id,
                    content: JSON.stringify(toolResult),
                  },
                ],
              },
            ],
            tools: tools,
          });
        } else {
          break;
        }
      }

      const textContent = finalResponse.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      res.json({
        content: textContent,
        model: finalResponse.model,
        usage: finalResponse.usage,
      });
    }
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as chatRouter };
