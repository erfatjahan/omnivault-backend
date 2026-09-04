import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !products || products.length === 0) {
    return { success: true, products: [] };
  }
  const catalog = products.map((p, index) => ({
    id: String(p.id ?? p.product_id ?? p._id ?? p.id_product ?? index),
    title: p.name || p.title || p.product_name || "",
    category: p.category?.name || p.category || p.category_name || "",
    description: p.description ? String(p.description).slice(0, 90) : "",
    price: Number(p.price || 0),
  }));

  const systemInstruction = `
You are an advanced e-commerce semantic search engine.
Your task is to understand natural language, Banglish, Bengali, and English.
CRITICAL RULES:
- Map user intent smartly. For example, if a user searches for "kids", "bacchader", or "children", match products related to kids, toys, baby, or children's items even if the exact word isn't in the title.
- Return ONLY a JSON array of matching product ID strings from the provided list.
Example format: ["1", "2"]
If nothing matches, return: []
`;

  const prompt = `
User Query: "${userPrompt}"

Store Products:
${JSON.stringify(catalog)}
`;


  const candidateModels = [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ];

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel(
        {
          model: modelName,
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

        const matchedProducts = products.filter((p, index) => {
          const currentId = String(p.id ?? p.product_id ?? p._id ?? p.id_product ?? index);
          return matchedIdSet.has(currentId);
        });

        if (matchedProducts.length > 0) {
          return {
            success: true,
            products: matchedProducts,
          };
        }
      }
    } catch (err) {
      console.warn(`Model ${modelName} attempt failed:`, err.message);
    }
  }
  const queryLower = userPrompt.toLowerCase().trim();
  const fallbackProducts = products.filter((p) => {
    const title = String(p.name || p.title || "").toLowerCase();
    const cat = String(p.category?.name || p.category || "").toLowerCase();
    const desc = String(p.description || "").toLowerCase();
    return title.includes(queryLower) || cat.includes(queryLower) || desc.includes(queryLower);
  });

  return {
    success: true,
    products: fallbackProducts,
  };
};