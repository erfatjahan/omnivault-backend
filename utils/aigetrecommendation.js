import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing!");
    return { success: true, products: [] };
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return { success: true, products: [] };
  }

  const catalog = products.map((p, index) => {
    const rawId = p.id ?? p.product_id ?? p._id ?? p.id_product ?? index;
    const title = p.name || p.title || p.product_name || "Unknown Product";
    const category = p.category?.name || p.category || p.category_name || "";
    const description = p.description ? String(p.description).slice(0, 160) : "";

    return {
      id: String(rawId),
      title,
      category,
      description,
      price: Number(p.price || 0),
    };
  });

  const prompt = `
You are the semantic search engine for an e-commerce platform.
User Query: "${userPrompt}"

Store Products:
${JSON.stringify(catalog)}

Instructions:
1. Understand the user's intent in any language (Bengali, Banglish like "vlo mobile", English, slang, typos).
2. Return ONLY a valid JSON array of matching product ID strings from the Store Products list. Example: ["1", "2"]
3. If no products match, return: []
`;

  const genAI = new GoogleGenerativeAI(apiKey);

  const modelsToTry = [
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro",
  ];

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const cleanJson = responseText.replace(/```json|```/g, "").trim();
      const matchedIds = JSON.parse(cleanJson);

      if (Array.isArray(matchedIds)) {
        const matchedProducts = products.filter((p, index) => {
          const currentId = String(p.id ?? p.product_id ?? p._id ?? p.id_product ?? index);
          return matchedIds.map(String).includes(currentId);
        });

        return {
          success: true,
          products: matchedProducts,
        };
      }
    } catch (error) {
      console.warn(`Model ${modelName} failed:`, error.message);
    }
  }

  return { success: true, products: [] };
};