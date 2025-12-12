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

import { useState, useRef, useEffect } from "react"
import { Send, Loader2, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface ChatInterfaceProps {
  apiUrl?: string
}

export function ChatInterface({ apiUrl = "http://localhost:3001/api/chat" }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I'm your Polaris assistant. I can help you with Apache Polaris operations using the MCP server. How can I help you today?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch(`${apiUrl}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage.content },
          ],
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) {
        throw new Error("Response body is null")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ""

      // Add initial assistant message
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        console.log("Received chunk:", chunk)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              console.log("Parsed SSE data:", data)

              if (data.type === "text") {
                assistantMessage += data.content
                setMessages(prev => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantMessage,
                  }
                  return newMessages
                })
              } else if (data.type === "tool_use") {
                // Show tool usage in the chat
                const toolMessage = `\n\n🔧 _Using tool: ${data.tool}_\n\n`
                assistantMessage += toolMessage
                setMessages(prev => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantMessage,
                  }
                  return newMessages
                })
              } else if (data.type === "error") {
                assistantMessage += `\n\nError: ${data.error}`
                setMessages(prev => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantMessage,
                  }
                  return newMessages
                })
              } else if (data.type === "done") {
                break
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e)
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please make sure the chat server is running and try again.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {message.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none
                  prose-headings:mt-3 prose-headings:mb-2 prose-headings:font-semibold
                  prose-p:my-1.5 prose-p:leading-relaxed
                  prose-strong:font-semibold prose-strong:text-foreground
                  prose-em:italic prose-em:text-muted-foreground
                  prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-md
                  prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                  prose-table:my-3 prose-table:border-collapse
                  prose-thead:border-b-2 prose-thead:border-border
                  prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:bg-muted/50
                  prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border
                  prose-tr:border-b prose-tr:border-border
                  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</div>
              )}
              <div className="text-xs opacity-50 mt-2">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about Polaris..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
