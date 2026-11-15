"use client";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { ErrorNote, InfoNote, PageHeader } from "@/components/ui";
import { sendJson } from "@/lib/client";

interface Msg { role: "user" | "assistant"; text: string; meta?: string }

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await sendJson<{ reply: string; provider: string | null; usedAi: boolean }>("/api/assistant", { message: text });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, meta: r.usedAi ? `AI: ${r.provider}` : "Built-in answer (no AI key configured)" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="AI assistant" subtitle="Ask about your channel. It reads your real data but cannot change anything; edits go through the Changes page." />
      <div className="space-y-3">
        {msgs.length === 0 && <InfoNote>Try: “Which of my videos have the weakest titles?” or “What should I upload next?”. Answers can be wrong, so check important facts in YouTube Studio.</InfoNote>}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[92%] rounded-2xl border border-line p-3 text-sm ${m.role === "user" ? "ml-auto bg-brand/10" : "bg-card"}`}>
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
            {m.meta && <p className="mt-1 text-[11px] text-muted">{m.meta}</p>}
          </div>
        ))}
        {busy && <p className="text-sm text-muted" role="status">Thinking…</p>}
        <ErrorNote error={error} />
        <div ref={end} />
      </div>
      <form className="sticky bottom-20 mt-4 flex gap-2 md:bottom-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input className="input" value={input} maxLength={1500} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your channel…" aria-label="Message" />
        <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
    </>
  );
}
