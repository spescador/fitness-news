const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const today = new Date().toISOString().split("T")[0];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search recent European fitness industry news. Today is ${today}. Output ONLY a JSON array of 12 items, no other text:
[{"title":"...","description":"1-2 sentences","url":"https://...","source":"...","date":"YYYY-MM-DD","relevance":7}]
Use real publication dates. Score relevance 1-10. JSON only.`
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`API error: ${JSON.stringify(data)}`);

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON found: " + text.slice(0, 200));

    const articles = JSON.parse(jsonMatch[0]).map(a => ({
      ...a,
      category: classifyArticle(a.title, a.description)
    }));

    const { error: dbError } = await supabase
      .from("news")
      .upsert({ date: today, articles: JSON.stringify(articles) }, { onConflict: "date" });

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return res.status(200).json({ success: true, count: articles.length, date: today });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const categoryKeywords = {
  "Gyms & Clubs": ["gym", "club", "fitness center", "studio", "crossfit", "boutique"],
  "Nutrition": ["nutrition", "supplement", "protein", "diet", "food", "wellness food"],
  "Fitness Tech": ["app", "wearable", "technology", "digital", "ai", "software", "platform"],
  "Wellness": ["wellness", "mental health", "yoga", "pilates", "spa", "recovery"],
  "Spain": ["spain", "españa", "spanish", "madrid", "barcelona", "valencia", "seville", "bilbao"],
  "Italy": ["italy", "italia", "italian", "rome", "milan", "milano", "turin", "torino", "naples"],
  "Industry": ["market", "investment", "acquisition", "revenue", "growth", "trend", "report"],
};

function classifyArticle(title, desc) {
  const text = (title + " " + desc).toLowerCase();
  const cats = Object.entries(categoryKeywords)
    .filter(([, kws]) => kws.some(k => text.includes(k)))
    .map(([cat]) => cat);
  return cats.length > 0 ? cats : ["Industry"];
}
