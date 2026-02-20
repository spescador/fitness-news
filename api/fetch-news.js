export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const today = new Date().toISOString().split("T")[0];
    const sixAgo = new Date();
    sixAgo.setMonth(sixAgo.getMonth() - 6);
    const sixAgoStr = sixAgo.toISOString().split("T")[0];

    // Step 1: Search for news
    const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search for 20 recent news articles about the European fitness market published after ${sixAgoStr}. Include news about gyms, nutrition, fitness tech, wellness, and industry trends. Include articles from Spain and Italy specifically. Search multiple times to find enough articles.`
        }],
      }),
    });

    const searchData = await searchResponse.json();
    if (!searchResponse.ok) {
      return res.status(200).json({ error: `Search error: ${JSON.stringify(searchData)}` });
    }

    // Step 2: Format results as JSON
    const searchContent = JSON.stringify(searchData.content);
    const formatResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: `Based on these search results, extract and format 20 news articles about the European fitness market into a JSON array. Only include articles published after ${sixAgoStr}.

Search results:
${searchContent.slice(0, 20000)}

Output ONLY a raw JSON array, no markdown, no explanation:
[{"title":"...","description":"2-3 sentence summary","url":"https://...","source":"...","date":"${today}"},...]

Rules:
- Include at least 2 articles from Spain and 2 from Italy if found
- Output ONLY the JSON array starting with [ and ending with ]
- No markdown code blocks`
        }],
      }),
    });

    const formatData = await formatResponse.json();
    if (!formatResponse.ok) {
      return res.status(200).json({ error: `Format error: ${JSON.stringify(formatData)}` });
    }

    return res.status(200).json(formatData);
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
