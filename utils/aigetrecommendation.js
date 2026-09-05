import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !products || products.length === 0) {
    return { success: true, products: [] };
  }

  const queryLower = userPrompt.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
  const scoredProducts = products.map((p, index) => {
    let score = 0;
    const title = String(p.name || p.title || "").toLowerCase();
    const cat = String(p.category || "").toLowerCase();
    const desc = String(p.description || "").toLowerCase();

    if (title.includes(queryLower)) score += 10;
    if (cat.includes(queryLower)) score += 8;
    if (desc.includes(queryLower)) score += 4;

    queryWords.forEach(word => {
      if (title.includes(word)) score += 5;
      if (cat.includes(word)) score += 4;
      if (desc.includes(word)) score += 2;
    });

    return { product: p, score, index };
  });

  scoredProducts.sort((a, b) => b.score - a.score);
  let relevantPool = scoredProducts
    .filter(item => item.score > 0)
    .map(item => item.product);

  if (relevantPool.length === 0) {
    relevantPool = products;
  }

  const catalog = relevantPool.slice(0, 60).map((p, index) => ({
    id: String(p.id ?? p.product_id ?? p._id ?? index),
    title: p.name || p.title || "",
    category: p.category || "",
  }));

  const systemInstruction = `
You are an expert e-commerce semantic search engine.
Your store ONLY has products from the following exact categories:
1. Electronics
2. Fashion
3. Home & Garden
4. Sports
5. Books
6. Beauty
7. Automotive
8. Kids & Baby

Your core job is to understand natural language, Banglish (e.g., "bacchader jinish", "valo phone", "kapor"), Bengali, and English.
- STRICT CATEGORY MATCHING: If the user searches for items related to a specific category (e.g., "electronic", "phone", "gadget", "laptop"), you must ONLY match and return products belonging to the "Electronics" category. Never mix unrelated categories like Beauty, Fashion, Home & Garden, etc.
- Return ONLY a JSON array of matching product ID strings from the provided list.
Example format: ["1", "2"]
If nothing matches, return: []
`;

  const prompt = `User Query: "${userPrompt}"\n\nStore Products: ${JSON.stringify(catalog)}`;

  const genAI = new GoogleGenerativeAI(apiKey);

  let matchedProducts = [];

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
      matchedProducts = relevantPool.filter((p, index) => {
        const currentId = String(p.id ?? p.product_id ?? p._id ?? index);
        return matchedIdSet.has(currentId);
      });
    }
  } catch (err) {
    console.warn(`AI Search failed, using keyword fallback:`, err.message);
  }

  if (queryLower.includes("electronic") || queryLower.includes("phone") || queryLower.includes("gadget")) {
    matchedProducts = matchedProducts.filter(p => {
      const cat = String(p.category || "").toLowerCase();
      return cat.includes("electronic") || cat.includes("phone") || cat.includes("gadget") || cat.includes("device");
    });
  }

  if (matchedProducts.length === 0 && relevantPool === products) {
    return { success: true, products: [] };
  }

  return {
    success: true,
    products: matchedProducts.length > 0 ? matchedProducts : relevantPool.slice(0, 15),
  };
};