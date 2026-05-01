// Minimal in-browser LLM client. Reads provider + API key + model from
// Settings.connect.llm. Supports anthropic / openai shapes. Calls go directly
// browser → provider — keep that in mind, especially for org keys.

import { Settings } from "./store.js";

export function llmIsConnected() {
  const c = (Settings.get().connect || {}).llm || {};
  return !!(c.apiKey && c.provider && c.model);
}

export async function llmGenerate({ system, user, maxTokens = 800 }) {
  const c = (Settings.get().connect || {}).llm || {};
  if (!c.apiKey) throw new Error("No LLM API key configured. Visit /connect to add one.");
  const provider = c.provider || "anthropic";
  const model = c.model || "claude-sonnet-4-6";

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": c.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: system || "",
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.content || []).map((p) => p.text || "").join("\n").trim();
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${c.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  if (provider === "google") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${c.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          ...(system ? [{ role: "user", parts: [{ text: system }] }] : []),
          { role: "user", parts: [{ text: user }] },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "";
  }

  if (provider === "ollama") {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.message?.content?.trim() || "";
  }

  throw new Error(`Unknown provider: ${provider}`);
}
