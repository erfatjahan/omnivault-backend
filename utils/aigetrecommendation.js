import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in environment variables.");
    return {
      success: true,
      products: getFallbackMatches(userPrompt, products),
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const simplifiedProducts = products.map((p) => ({
    id: String(p.id),
    name: p.name,
    category: p.category,
    description: p.description ? p.description.slice(0, 160) : "",
    price: p.price,
  }));

  const promptText = `
You are an expert e-commerce product search assistant for an online store.

User Query: "${userPrompt}"
Note: The query can be in English, Bengali, or Banglish (e.g., "amk ekta phone daw", "valoi shoe", "camera laptop").

Store Inventory:
${JSON.stringify(simplifiedProducts)}

Task:
1. Understand user intent, synonyms, and categories (e.g., "phone" matches "Smartphone", "shoe" matches "Sneakers", "t-shirt" matches "Cloth/Clothing").
2. Match products based on name, category, and description even with partial or misspelled keywords.
3. Return ONLY a valid JSON array of matching product IDs.
Example output format:
["1", "4", "8"]

If absolutely no product matches the query, return:
[]
`;
  const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(promptText);
      const text = result.response.text().trim();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const matchedIds = JSON.parse(cleanJson);

      if (Array.isArray(matchedIds)) {
        const matchedProducts = products.filter((p) =>
          matchedIds.some((id) => String(id) === String(p.id))
        );

        if (matchedProducts.length > 0) {
          return {
            success: true,
            products: matchedProducts,
          };
        }
      }
    } catch (err) {
      console.warn(`Model ${modelName} encountered an error:`, err.message);
    }
  }

  const fallbackProducts = getFallbackMatches(userPrompt, products);

  return {
    success: true,
    products: fallbackProducts,
  };
};

function getFallbackMatches(userPrompt, products) {
  const query = userPrompt.toLowerCase().trim();
  const words = query
    .replace(/[^\w\s\u0980-\u09FF]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (words.length === 0) return [];

  const matched = products.filter((p) => {
    const text = `${p.name || ""} ${p.category || ""} ${p.description || ""}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });

  return matched;
}