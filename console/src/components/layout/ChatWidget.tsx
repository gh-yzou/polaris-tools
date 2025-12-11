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
// src/ChatWidget.jsx

import React, { useEffect } from 'react';

export function ChatWidget() {
    useEffect(() => {
        // 1. Load the script
        const script = document.createElement('script');
        script.src = "http://localhost:3000/dist/mcp-chat-widget.js";
        script.async = true;
        document.body.appendChild(script);

        // 2. Create and add the web component after script loads
        script.onload = () => {
            const widget = document.createElement('mcp-chat-widget');
            widget.setAttribute('widget-id', "2");
            widget.setAttribute('name', "Agentic Polaris");
            widget.setAttribute('description', "Ask me to anything related to Polaris ");
            widget.setAttribute('position', "bottom-right");
            widget.setAttribute('size', "md");
            widget.setAttribute('api-host', 'http://localhost:3000');
            document.body.appendChild(widget);
        };

        // 3. Cleanup on unmount
        return () => {
            // Remove the widget element(s)
            document.querySelectorAll('mcp-chat-widget').forEach(el => el.remove());
            // Remove the script element(s)
            document.querySelectorAll(`script[src="http://localhost:3000/dist/mcp-chat-widget.js"]`).forEach(el => el.remove());
        };
    }, []);

    // This component renders nothing itself, as the widget is injected into document.body
    return null;
}