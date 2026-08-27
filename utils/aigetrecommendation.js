// export async function getAIRecommendation(req, res, userPrompt, products) {
//   const API_KEY = process.env.GEMINI_API_KEY;
//   const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

//   try {
//     const geminiPrompt = `
//         Here is a list of avaiable products:
//         ${JSON.stringify(products, null, 2)}

//         Based on the following user request, filter and suggest the best matching products:
//         "${userPrompt}"

//         Only return the matching products in JSON format.
//     `;

//     const response = await fetch(URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         contents: [{ parts: [{ text: geminiPrompt }] }],
//       }),
//     });

//     const data = await response.json();
//     const aiResponseText =
//       data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
//     const cleanedText = aiResponseText.replace(/```json|```/g, ``).trim();

//     if (!cleanedText) {
//       return res
//         .status(500)
//         .json({ success: false, message: "AI response is empty or invalid." });
//     }

//     let parsedProducts;
//     try {
//       parsedProducts = JSON.parse(cleanedText);
//     } catch (error) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to parse AI response" });
//     }
//     return { success: true, products: parsedProducts };
//   } catch (error) {
//     res.status(500).json({ success: false, message: "Internal server error." });
//   }
// }
// 
import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAIRecommendation = async (req, res, userPrompt, products) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const simplifiedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price,
  }));

  const promptText = `
    You are an intelligent e-commerce shopping assistant.
    User Query: "${userPrompt}"
    (The query can be in English, Bengali, or Banglish like "amk ekta phone daw").

    Available Products:
    ${JSON.stringify(simplifiedProducts)}

    Identify which products match the user's intent.
    Respond ONLY with a valid JSON array of matching product IDs.
    Example: [1, 4, 8]
    If no product matches, respond with: []
  `;

  const modelsToTry = ["gemini-3.6-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptText);
      const text = result.response.text().trim();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const matchedIds = JSON.parse(cleanJson);

      if (Array.isArray(matchedIds)) {
        const matchedProducts = products.filter((p) =>
          matchedIds.some((id) => String(id) === String(p.id))
        );

        return {
          success: true,
          products: matchedProducts,
        };
      }
    } catch (err) {
      console.warn(`Model ${modelName} failed or busy. Trying next...`);
      
    }
  }

  const words = userPrompt
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const fallbackMatches = products.filter((p) => {
    const text = `${p.name} ${p.description} ${p.category}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });

  return {
    success: true,
    products: fallbackMatches.length > 0 ? fallbackMatches : products.slice(0, 6),
  };
};