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

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatInterface } from "@/components/chat/ChatInterface"

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  return (
    <>
      {/* Backdrop for mobile only */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Side Panel - pushes content on desktop, overlays on mobile */}
      <div
        className={`
          h-full bg-background border-l shadow-2xl flex flex-col transition-all duration-300 ease-in-out
          md:relative md:z-10
          fixed right-0 top-0 z-50 md:translate-x-0
          ${isOpen ? "translate-x-0 w-full sm:w-[500px] md:w-[500px] lg:w-[600px]" : "translate-x-full md:w-0 md:border-0"}
        `}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b bg-muted/30 px-4 py-3 shrink-0 ${!isOpen && "md:hidden"}`}>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <h2 className="text-lg font-semibold">Polaris Assistant</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close chat panel</span>
          </Button>
        </div>

        {/* Chat Content */}
        <div className={`flex-1 overflow-hidden ${!isOpen && "md:hidden"}`}>
          <ChatInterface />
        </div>
      </div>
    </>
  )
}
