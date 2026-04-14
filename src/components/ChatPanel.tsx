import { useState, useEffect, useRef } from "react";
import { Message } from "../types";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { HiOutlinePaperAirplane, HiOutlineSparkles } from "react-icons/hi";

interface Props {
  matchId: string;
}

const AI_UMPIRE_ID = "ai-umpire-system";

export default function ChatPanel({ matchId }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [matchId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    try {
      const res = await api.get(`/matches/${matchId}/messages`);
      setMessages(res.data);
    } catch {}
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const msgText = input.trim();
    setInput("");
    setSending(true);
    setAiTyping(true);

    try {
      // Send via AI chat endpoint — user message + AI response in one call
      const res = await api.post(`/ai/chat/${matchId}`, { message: msgText });

      // Reload all messages to get both user msg + AI response
      await loadMessages();
    } catch {
      // Fallback: send as regular message if AI endpoint fails
      try {
        await api.post(`/matches/${matchId}/messages`, { content: msgText });
        await loadMessages();
      } catch {}
    }

    setSending(false);
    setAiTyping(false);
  }

  function isAIMessage(msg: Message): boolean {
    return msg.sender_id === AI_UMPIRE_ID;
  }

  return (
    <div className="glass flex flex-col h-[600px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-white/80">Match Chat</h3>
        <div className="flex items-center gap-1.5 text-xs text-neon-cyan/70">
          <HiOutlineSparkles className="w-3.5 h-3.5" />
          <span className="font-mono">AI Umpire Active</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <HiOutlineSparkles className="w-8 h-8 text-neon-cyan/30 mx-auto mb-2" />
            <p className="text-white/30 text-sm">AI Umpire is standing by.</p>
            <p className="text-white/20 text-xs mt-1">Send a message — the AI will respond and assist both parties.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          const isAI = isAIMessage(msg);

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"} animate-slide-up`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  isAI
                    ? "bg-neon-cyan/10 border border-neon-cyan/20 rounded-bl-md"
                    : isMine
                    ? "bg-neon-blue/20 border border-neon-blue/20 rounded-br-md"
                    : "bg-white/5 border border-white/10 rounded-bl-md"
                }`}
              >
                {/* Sender header */}
                <div className="flex items-center gap-2 mb-1">
                  {isAI && <HiOutlineSparkles className="w-3 h-3 text-neon-cyan" />}
                  <span
                    className={`text-xs font-semibold ${
                      isAI ? "text-neon-cyan" : isMine ? "text-neon-blue" : "text-white/60"
                    }`}
                  >
                    {isAI ? "AI Umpire" : msg.sender_name}
                  </span>
                  {!isAI && (
                    <span className="text-xs text-white/20 font-mono capitalize">
                      {msg.sender_role}
                    </span>
                  )}
                </div>

                {/* Message body — preserve newlines for AI messages */}
                <div className="text-sm text-white/80 break-words whitespace-pre-wrap">
                  {msg.content}
                </div>

                <p className="text-[10px] text-white/20 mt-1 text-right">
                  {new Date(msg.created_at * 1000).toLocaleTimeString()}
                </p>
              </div>
            </div>
          );
        })}

        {/* AI typing indicator */}
        {aiTyping && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-neon-cyan/10 border border-neon-cyan/20 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <HiOutlineSparkles className="w-3 h-3 text-neon-cyan animate-pulse" />
                <span className="text-xs text-neon-cyan font-semibold">AI Umpire</span>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="w-2 h-2 bg-neon-cyan/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-neon-cyan/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-neon-cyan/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI Umpire anything..."
          className="glass-input flex-1 text-sm"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="glass-button-primary px-4 py-2 rounded-xl disabled:opacity-30"
        >
          <HiOutlinePaperAirplane className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
