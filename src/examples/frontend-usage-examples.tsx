/**
 * Frontend Usage Examples
 * How to call RAYA API routes from React components
 */

'use client';

import { useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface RayaResponse {
  success: boolean;
  data: {
    text: string;
    insight: any;
    progression: any;
    conversationHistory: any[];
    sessionId: string;
  };
}

interface ProgressionState {
  total_xp: number;
  level: number;
  badges: string[];
  streak_days: number;
  last_session_date: string;
}

// ============================================================================
// EXAMPLE 1: Simple Chat (Non-Streaming)
// ============================================================================

export function SimpleChat() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string>('');

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/raya/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          userTier: 'free', // or 'premium'
          conversationHistory,
          sessionId,
        }),
      });

      const data: RayaResponse = await res.json();

      if (data.success) {
        setResponse(data.data.text);
        setConversationHistory(data.data.conversationHistory);
        setSessionId(data.data.sessionId);

        // Log insights for debugging
        if (data.data.insight) {
          console.log('PKM Score:', data.data.insight.academic.pkm.global);
        }

        // Log progression
        if (data.data.progression) {
          console.log('XP Earned:', data.data.progression.xp_earned);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Simple Chat Example</h2>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask RAYA anything..."
        className="w-full p-3 border rounded"
        rows={3}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Thinking...' : 'Send'}
      </button>

      {response && (
        <div className="p-4 bg-gray-50 rounded">
          <p className="whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE 2: Streaming Chat
// ============================================================================

export function StreamingChat() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string>('');
  const [streaming, setStreaming] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string>('');

  const handleStreamSubmit = async () => {
    if (!message.trim()) return;

    setStreaming(true);
    setResponse('');

    try {
      const res = await fetch('/api/raya/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          userTier: 'free',
          conversationHistory,
          sessionId,
        }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              // Append text chunk
              setResponse((prev) => prev + data.content);
            } else if (data.type === 'complete') {
              // Final response
              setConversationHistory(data.content.conversationHistory);
              setSessionId(data.content.sessionId);

              // Log insights
              if (data.content.insight) {
                console.log('PKM:', data.content.insight.academic.pkm.global);
              }
            } else if (data.type === 'error') {
              console.error('Stream error:', data.error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Streaming Chat Example</h2>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask RAYA anything..."
        className="w-full p-3 border rounded"
        rows={3}
      />

      <button
        onClick={handleStreamSubmit}
        disabled={streaming}
        className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
      >
        {streaming ? 'Streaming...' : 'Send (Stream)'}
      </button>

      {response && (
        <div className="p-4 bg-gray-50 rounded">
          <p className="whitespace-pre-wrap">{response}</p>
          {streaming && <span className="animate-pulse">▊</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE 3: Chat with Image
// ============================================================================

export function ImageChat() {
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!message.trim() || !image) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', message);
      formData.append('image', image);
      formData.append('userTier', 'free');

      const res = await fetch('/api/raya/image', {
        method: 'POST',
        body: formData,
      });

      const data: RayaResponse = await res.json();

      if (data.success) {
        setResponse(data.data.text);

        // Log multimodal usage
        if (data.data.insight) {
          console.log('Multimodal used:', data.data.insight.context.multimodal_used);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Image Chat Example</h2>

      <input
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        className="block w-full"
      />

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Preview"
          className="max-w-xs rounded border"
        />
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask about the image..."
        className="w-full p-3 border rounded"
        rows={3}
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !image}
        className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Send with Image'}
      </button>

      {response && (
        <div className="p-4 bg-gray-50 rounded">
          <p className="whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE 4: Chat with Progression
// ============================================================================

export function ProgressionChat() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [progressionState, setProgressionState] = useState<ProgressionState>({
    total_xp: 450,
    level: 4,
    badges: ['🔥 Rising Flame'],
    streak_days: 5,
    last_session_date: new Date().toISOString(),
  });

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/raya/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          userTier: 'free',
          progressionState,
        }),
      });

      const data: RayaResponse = await res.json();

      if (data.success) {
        setResponse(data.data.text);

        // Update progression
        if (data.data.progression) {
          setProgressionState((prev) => ({
            ...prev,
            total_xp: prev.total_xp + data.data.progression.xp_earned,
            level: data.data.progression.level,
            badges: [
              ...prev.badges,
              ...data.data.progression.badges_unlocked,
            ],
          }));
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Progression Chat Example</h2>

      {/* Progression Display */}
      <div className="p-4 bg-blue-50 rounded">
        <p className="font-semibold">Level {progressionState.level}</p>
        <p className="text-sm">XP: {progressionState.total_xp}</p>
        <p className="text-sm">Badges: {progressionState.badges.join(', ')}</p>
        <p className="text-sm">Streak: {progressionState.streak_days} days 🔥</p>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask RAYA anything..."
        className="w-full p-3 border rounded"
        rows={3}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-4 py-2 bg-orange-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Thinking...' : 'Send'}
      </button>

      {response && (
        <div className="p-4 bg-gray-50 rounded">
          <p className="whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE 5: Full Chat Component
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function FullChatComponent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/raya/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          userTier: 'free',
          conversationHistory,
        }),
      });

      const data: RayaResponse = await res.json();

      if (data.success) {
        // Add assistant message
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.data.text,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setConversationHistory(data.data.conversationHistory);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">RAYA Chat</h1>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded ${
              msg.role === 'user'
                ? 'bg-blue-100 ml-auto max-w-[80%]'
                : 'bg-gray-100 mr-auto max-w-[80%]'
            }`}
          >
            <p className="font-semibold text-sm mb-1">
              {msg.role === 'user' ? 'You' : 'RAYA'}
            </p>
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="bg-gray-100 p-3 rounded mr-auto max-w-[80%]">
            <p className="text-sm text-gray-500">RAYA is thinking...</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask RAYA anything..."
          className="flex-1 p-3 border rounded"
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
