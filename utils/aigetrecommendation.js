import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !products || products.length === 0) {
    return { success: true, products: [] };
  }

  const queryLower = userPrompt.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
  const scoredProducts = products.map(p => {
    let score = 0;
    const title = String(p.name || p.title || "").toLowerCase();
    const cat = String(p.category?.name || p.category || "").toLowerCase();
    const desc = String(p.description || "").toLowerCase();

    if (title.includes(queryLower)) score += 5;
    if (cat.includes(queryLower)) score += 4;
    if (desc.includes(queryLower)) score += 2;
    queryWords.forEach(word => {
      if (title.includes(word)) score += 3;
      if (cat.includes(word)) score += 3;
      if (desc.includes(word)) score += 1;
    });
    if ((queryLower.includes("kid") || queryLower.includes("child") || queryLower.includes("bacchar")) && 
        (title.includes("baby") || title.includes("toy") || cat.includes("baby") || cat.includes("toy"))) {
      score += 4;
    }

    return { product: p, score };
  });

  scoredProducts.sort((a, b) => b.score - a.score);
  const hasValidScores = scoredProducts.some(item => item.score > 0);
  const relevantPool = hasValidScores 
    ? scoredProducts.filter(item => item.score > 0).map(item => item.product) 
    : products;
  const catalog = relevantPool.slice(0, 50).map((p, index) => ({
    id: String(p.id ?? p.product_id ?? p._id ?? index),
    title: p.name || p.title || "",
    category: p.category?.name || p.category || "",
  }));

  const systemInstruction = `
You are an e-commerce semantic search engine. 
Match the User Query with the given product list and return ONLY a JSON array of matching product ID strings.
Example: ["1", "2"]
If nothing matches, return: []
`;

  const prompt = `Query: "${userPrompt}"\nProducts: ${JSON.stringify(catalog)}`;

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel(
      {
        model: "gemini-1.5-flash",
        systemInstruction: systemInstruction,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      },
      { apiVersion: "v1beta" }
    );

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    const matchedIds = JSON.parse(cleanJson);

    if (Array.isArray(matchedIds) && matchedIds.length > 0) {
      const matchedIdSet = new Set(matchedIds.map(String));
      const matchedProducts = relevantPool.filter((p, index) => {
        const currentId = String(p.id ?? p.product_id ?? p._id ?? index);
        return matchedIdSet.has(currentId);
      });

      if (matchedProducts.length > 0) {
        return { success: true, products: matchedProducts };
      }
    }
  } catch (err) {
    console.warn(`AI Search failed, falling back to scored pool:`, err.message);
  }

  const fallbackProducts = hasValidScores 
    ? scoredProducts.filter(item => item.score > 0).map(item => item.product)
    : products.slice(0, 15);

  return {
    success: true,
    products: fallbackProducts,
  };
};