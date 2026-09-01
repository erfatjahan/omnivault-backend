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
    description: p.description ? String(p.description).slice(0, 160) : "",
    price: Number(p.price || 0),
  }));

  const prompt = `
You are an e-commerce semantic search engine.
User Query: "${userPrompt}"

Store Products:
${JSON.stringify(catalog)}

Task:
- Understand natural language, Banglish (e.g. "vlo mobile", "bhalo phone", "kapor"), Bengali, and English.
- Return ONLY a JSON array of matching product ID strings from the list.
Example: ["1", "2"]
If nothing matches, return: []
`;
  const candidateModels = [
    "gemini-3.6-flash",
    "gemini-3.6-flash-latest"
  ];

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel(
        {
          model: modelName,
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

      if (Array.isArray(matchedIds)) {
        const matchedIdSet = new Set(matchedIds.map(String));

        const matchedProducts = products.filter((p, index) => {
          const currentId = String(p.id ?? p.product_id ?? p._id ?? p.id_product ?? index);
          return matchedIdSet.has(currentId);
        });

        return {
          success: true,
          products: matchedProducts,
        };
      }
    } catch (err) {
      console.warn(`Model ${modelName} attempt failed:`, err.message);
    }
  }

  return { success: true, products: [] };
};