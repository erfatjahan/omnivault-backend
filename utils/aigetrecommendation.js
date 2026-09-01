import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !products || products.length === 0) {
    return { success: true, products: products ? products.slice(0, 8) : [] };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const productCatalog = products.map((p) => ({
      id: String(p.id ?? p.product_id ?? p._id),
      title: p.name || p.title || "",
      category: p.category || "",
      description: p.description ? String(p.description).slice(0, 160) : "",
      price: p.price,
    }));
    const prompt = `
You are the core AI intelligence for an e-commerce search engine.

User's Raw Query: "${userPrompt}"

Store Catalog:
${JSON.stringify(productCatalog)}

Your Task:
1. Understand the user's intent deeply regardless of the language, dialect, spelling errors, phonetic variations, or slang used (e.g., Banglish, Bengali, Hindi, colloquial English, transliterated terms).
2. Rank and select the catalog items that best satisfy what the user is actually trying to find.
3. Return ONLY a valid JSON array containing the matching product string IDs.
Example format:
["1", "4"]

If nothing in the catalog is relevant to the user's request, return:
[]
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const matchedIds = JSON.parse(text);

    if (Array.isArray(matchedIds) && matchedIds.length > 0) {
      const matchedProducts = products.filter((p) => {
        const currentId = String(p.id ?? p.product_id ?? p._id);
        return matchedIds.map(String).includes(currentId);
      });

      return {
        success: true,
        products: matchedProducts,
      };
    }

    return { success: true, products: [] };
  } catch (error) {
    console.error("Gemini Universal Search Error:", error.message);
    return { success: true, products: products.slice(0, 8) };
  }
};