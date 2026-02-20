import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Security check: only allow Vercel cron calls
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    // Fetch news from Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search European fitness market news 2025. Include Spain and Italy. Return ONLY a JSON array:
[{"title":"...","description":"1-2 sentences","url":"https://...","source":"...","date":"${today}"}]
Output 12 items. No markdown. No explanation. Just the JSON array.`
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`API error: ${JSON.stringify(data)}`);

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const articles = JSON.parse(jsonMatch[0]);

    // Save to Supabase
    const { error: dbError } = await supabase
      .from("news")
      .upsert({ date: today, articles: JSON.stringify(articles) }, { onConflict: "date" });

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return res.status(200).json({ success: true, count: articles.length, date: today });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
