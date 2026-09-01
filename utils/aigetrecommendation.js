import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY not found!");
    return { success: true, products: [] };
  }

  if (!products || products.length === 0) {
    return { success: true, products: [] };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const productCatalog = products.map((p) => {
      const rawId = p.id ?? p.product_id ?? p._id ?? p.id_product;
      const title = p.name || p.title || p.product_name || "";
      const cat = p.category || p.category_name || "";
      const desc = p.description ? String(p.description).slice(0, 150) : "";
      
      return {
        id: String(rawId),
        title,
        category: cat,
        description: desc,
        price: p.price,
      };
    });

    const prompt = `
You are an intelligent e-commerce product search engine.

User Search Query: "${userPrompt}"

Store Products:
${JSON.stringify(productCatalog)}

Instructions:
1. Understand the user's intent in any language or transliteration (Bengali, Banglish, English, etc.).
2. Find only the products from the Store Products list that genuinely match what the user is searching for (e.g., if user searches "dress" or "kapor", ONLY return dress/apparel items, DO NOT return mobiles/electronics).
3. Return ONLY a valid JSON array of matching product ID strings.
Example: ["1", "5"]

If no relevant products are found in the store, return:
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
    const rawText = result.response.text().trim();
    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    const matchedIds = JSON.parse(cleanJson);

    if (Array.isArray(matchedIds)) {
      if (matchedIds.length === 0) {
        return { success: true, products: [] };
      }

      const matchedProducts = products.filter((p) => {
        const currentId = String(p.id ?? p.product_id ?? p._id ?? p.id_product);
        return matchedIds.map(String).includes(currentId);
      });

      return {
        success: true,
        products: matchedProducts,
      };
    }

    return { success: true, products: [] };
  } catch (error) {
    console.error("Gemini Search Error:", error.message);
    return { success: true, products: [] };
  }
};