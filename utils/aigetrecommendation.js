import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in backend environment!");
    return { success: true, products: [] };
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return { success: true, products: [] };
  }
  const catalog = products.map((p) => {
    const rawId = p.id ?? p.product_id ?? p._id ?? p.id_product;
    const title = p.name || p.title || p.product_name || "";
    const category = p.category?.name || p.category || p.category_name || "";
    const description = p.description ? String(p.description).slice(0, 160) : "";

    return {
      id: String(rawId),
      title,
      category,
      description,
      price: Number(p.price || 0),
      ratings: Number(p.ratings || p.rating || 0),
    };
  });
  const prompt = `
You are the intelligent core search engine for this e-commerce platform.

User Query: "${userPrompt}"

Store Catalog:
${JSON.stringify(catalog, null, 2)}

Instructions:
- Understand the user's intent deeply. The user can type in any language (English, Bengali, Banglish, slang, phonetic spelling, transliteration like "vlo mobile", "ekta kapor chai", "sosta headphone", "gaming laptop", "shoes").
- Analyze the semantic meaning, categories, descriptions, price, and ratings from the Store Catalog.
- Select ONLY the product IDs from the catalog that genuinely fulfill the user's request.
- Return strictly a valid JSON array of matching product string IDs (e.g. ["1", "4"]).
- If no products in the catalog match the user's intent, return strictly an empty array: []

Return ONLY the raw JSON array. Do not include explanation or markdown.
`;

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const cleanJson = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const matchedIds = JSON.parse(cleanJson);

    if (Array.isArray(matchedIds)) {
      const matchedProducts = products.filter((p) => {
        const currentId = String(p.id ?? p.product_id ?? p._id ?? p.id_product);
        return matchedIds.map(String).includes(currentId);
      });

      return {
        success: true,
        products: matchedProducts,
      };
    }
  } catch (error) {
    console.error("Gemini AI Search Runtime Error:", error.message);
  }
  return {
    success: true,
    products: [],
  };
};