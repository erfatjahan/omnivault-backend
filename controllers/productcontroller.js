import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Google GenAI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}
function calculateCosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const { name, description, price, category, stock } = req.body;
  const created_by = req.user?.id;

  if (!name || !description || !price || !category || stock === undefined) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400)
    );
  }

  const combinedText = `${name} category: ${category} details: ${description}`;
  const vectorValues = await getEmbedding(combinedText);
  const vectorString = vectorValues ? `[${vectorValues.join(",")}]` : null;

  let uploadedImages = [];
  if (req.files && req.files.images) {
    const images = Array.isArray(req.files.images)
      ? req.files.images
      : [req.files.images];

    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Product_Images",
        width: 1000,
        crop: "scale",
      });

      uploadedImages.push({
        url: result.secure_url,
        public_id: result.public_id,
      });
    }
  }

  const product = await database.query(
    `INSERT INTO products (name, description, price, category, stock, images, created_by, embedding) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector) RETURNING *`,
    [
      name,
      description,
      Number(price),
      category,
      Number(stock),
      JSON.stringify(uploadedImages),
      created_by,
      vectorString,
    ]
  );

  res.status(201).json({
    success: true,
    message: "Product created successfully.",
    product: product.rows[0],
  });
});

export const fetchAllProducts = catchAsyncErrors(async (req, res, next) => {
  const { availability, price, category, ratings, search } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  const conditions = [];
  const queryParams = [];
  let paramIndex = 1;

  if (availability === "in-stock") {
    conditions.push(`p.stock > 5`);
  } else if (availability === "limited") {
    conditions.push(`p.stock > 0 AND p.stock <= 5`);
  } else if (availability === "out-of-stock") {
    conditions.push(`p.stock = 0`);
  }

  if (price !== undefined && price !== "") {
    if (typeof price === "string" && price.includes("-")) {
      const [min, max] = price.split("-").map((v) => Number(v.trim()));
      if (!isNaN(min) && !isNaN(max)) {
        conditions.push(`p.price >= $${paramIndex} AND p.price <= $${paramIndex + 1}`);
        queryParams.push(min, max);
        paramIndex += 2;
      }
    } else if (!isNaN(Number(price))) {
      conditions.push(`p.price <= $${paramIndex}`);
      queryParams.push(Number(price));
      paramIndex++;
    }
  }

  if (category && category.trim() !== "") {
    conditions.push(`p.category ILIKE $${paramIndex}`);
    queryParams.push(`%${category.trim()}%`);
    paramIndex++;
  }

  if (ratings && !isNaN(Number(ratings))) {
    conditions.push(`p.ratings >= $${paramIndex}`);
    queryParams.push(Number(ratings));
    paramIndex++;
  }
  if (search && search.trim() !== "") {
    conditions.push(`(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
    queryParams.push(`%${search.trim()}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countQuery = `SELECT COUNT(DISTINCT p.id) FROM products p ${whereClause}`;
  const totalProductsResult = await database.query(countQuery, queryParams);
  const totalProducts = parseInt(totalProductsResult.rows[0]?.count || 0);
  const fetchParams = [...queryParams, limit, offset];
  const limitPlaceholder = `$${paramIndex}`;
  const offsetPlaceholder = `$${paramIndex + 1}`;
  
  const query = `
    SELECT p.*, 
    COALESCE(COUNT(r.id), 0)::integer AS review_count 
    FROM products p 
    LEFT JOIN reviews r ON p.id::text = r.product_id::text
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ${limitPlaceholder}
    OFFSET ${offsetPlaceholder}
  `;

  const result = await database.query(query, fetchParams);
  const newProductsResult = await database.query(`
    SELECT p.*,
    COALESCE(COUNT(r.id), 0)::integer AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id::text = r.product_id::text
    WHERE p.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
  `);
  const topRatedResult = await database.query(`
    SELECT p.*,
    COALESCE(COUNT(r.id), 0)::integer AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id::text = r.product_id::text
    WHERE p.ratings >= 4.5
    GROUP BY p.id
    ORDER BY p.ratings DESC, p.created_at DESC
    LIMIT 8
  `);

  res.status(200).json({
    success: true,
    products: result.rows,
    totalProducts,
    page,
    totalPages: Math.ceil(totalProducts / limit),
    newProducts: newProductsResult.rows,
    topRatedProducts: topRatedResult.rows,
  });
});

export const updateProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;
  const { name, description, price, category, stock } = req.body;

  if (!name || !description || price === undefined || !category || stock === undefined) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400)
    );
  }

  const product = await database.query("SELECT * FROM products WHERE id::text = $1::text", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }
  const combinedText = `${name} category: ${category} details: ${description}`;
  const vectorValues = await getEmbedding(combinedText);
  const vectorString = vectorValues ? `[${vectorValues.join(",")}]` : null;

  const result = await database.query(
    `UPDATE products SET name = $1, description = $2, price = $3, category = $4, stock = $5, embedding = $6::vector WHERE id::text = $7::text RETURNING *`,
    [name, description, Number(price), category, Number(stock), vectorString, productId]
  );

  res.status(200).json({
    success: true,
    message: "Product updated successfully.",
    updatedProduct: result.rows[0],
  });
});

// 4. Delete Product
export const deleteProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;

  const product = await database.query("SELECT * FROM products WHERE id::text = $1::text", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const images = product.rows[0].images;
  const client = await database.connect();
  
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM reviews WHERE product_id::text = $1::text", [productId]);

    const deleteResult = await client.query(
      "DELETE FROM products WHERE id::text = $1::text RETURNING *",
      [productId]
    );

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new ErrorHandler("Failed to delete product.", 500));
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    return next(new ErrorHandler(err.message || "Failed to delete product.", 500));
  } finally {
    client.release();
  }

  if (images && Array.isArray(images) && images.length > 0) {
    for (const image of images) {
      if (image?.public_id) {
        await cloudinary.uploader.destroy(image.public_id);
      }
    }
  }

  res.status(200).json({
    success: true,
    message: "Product deleted successfully.",
  });
});

// 5. Fetch Single Product
export const fetchSingleProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;

  const result = await database.query(
    `
      SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'review_id', r.id,
            'rating', r.rating,
            'comment', r.comment,
            'reviewer', json_build_object(
              'id', u.id,
              'name', u.name,
              'avatar', u.avatar
            )
          )
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
      ) AS reviews
      FROM products p
      LEFT JOIN reviews r ON p.id::text = r.product_id::text
      LEFT JOIN users u ON r.user_id::text = u.id::text
      WHERE p.id::text = $1::text
      GROUP BY p.id
    `,
    [productId]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  res.status(200).json({
    success: true,
    message: "Product fetched successfully.",
    product: result.rows[0],
  });
});

// 6. Post Product Review
export const postProductReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user?.id || req.user?._id;

  if (!rating || !comment) {
    return next(new ErrorHandler("Please provide rating and comment.", 400));
  }

  const purchaseCheckQuery = `
    SELECT oi.product_id
    FROM order_items oi
    JOIN orders o ON o.id::text = oi.order_id::text
    WHERE o.buyer_id::text = $1::text
      AND oi.product_id::text = $2::text
      AND (
        LOWER(TRIM(COALESCE(o.order_status, ''))) = 'delivered'
        OR LOWER(TRIM(COALESCE(o.order_status, ''))) = 'completed'
        OR LOWER(TRIM(COALESCE(o.payment_status, ''))) = 'paid'
      )
    LIMIT 1;
  `;

  const { rows } = await database.query(purchaseCheckQuery, [
    userId,
    productId,
  ]);

  if (rows.length === 0) {
    return res.status(403).json({
      success: false,
      message: "You can only review a product you've purchased and received.",
    });
  }

  const product = await database.query("SELECT * FROM products WHERE id::text = $1::text", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const isAlreadyReviewed = await database.query(
    `SELECT * FROM reviews WHERE product_id::text = $1::text AND user_id::text = $2::text`,
    [productId, userId]
  );

  let review;
  if (isAlreadyReviewed.rows.length > 0) {
    review = await database.query(
      "UPDATE reviews SET rating = $1, comment = $2 WHERE product_id::text = $3::text AND user_id::text = $4::text RETURNING *",
      [rating, comment, productId, userId]
    );
  } else {
    review = await database.query(
      "INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *",
      [productId, userId, rating, comment]
    );
  }

  const allReviews = await database.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg_rating FROM reviews WHERE product_id::text = $1::text`,
    [productId]
  );

  const newAvgRating = parseFloat(allReviews.rows[0]?.avg_rating || 0).toFixed(1);

  const updatedProduct = await database.query(
    `UPDATE products SET ratings = $1 WHERE id::text = $2::text RETURNING *`,
    [newAvgRating, productId]
  );

  res.status(200).json({
    success: true,
    message: "Review posted successfully.",
    review: review.rows[0],
    product: updatedProduct.rows[0],
  });
});

// 7. Delete Review
export const deleteReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;
  const userId = req.user?.id || req.user?._id;

  const review = await database.query(
    "DELETE FROM reviews WHERE product_id::text = $1::text AND user_id::text = $2::text RETURNING *",
    [productId, userId]
  );

  if (review.rows.length === 0) {
    return next(new ErrorHandler("Review not found.", 404));
  }

  const allReviews = await database.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg_rating FROM reviews WHERE product_id::text = $1::text`,
    [productId]
  );

  const newAvgRating = parseFloat(allReviews.rows[0]?.avg_rating || 0).toFixed(1);

  const updatedProduct = await database.query(
    `UPDATE products SET ratings = $1 WHERE id::text = $2::text RETURNING *`,
    [newAvgRating, productId]
  );

  res.status(200).json({
    success: true,
    message: "Your review has been deleted.",
    review: review.rows[0],
    product: updatedProduct.rows[0],
  });
});
export const fetchAIFilteredProducts = catchAsyncErrors(
  async (req, res, next) => {
    const { userPrompt } = req.body;

    if (!userPrompt || !userPrompt.trim()) {
      return next(new ErrorHandler("Provide a valid prompt.", 400));
    }

    const queryVector = await getEmbedding(userPrompt);
    const cleanPrompt = userPrompt.trim();
    const searchKeywords = cleanPrompt.split(" ").map(word => `%${word}%`);
    const searchTerm = `%${cleanPrompt}%`;

    const query = `
      SELECT p.*, 
             COALESCE(COUNT(r.id), 0)::integer AS review_count 
      FROM products p 
      LEFT JOIN reviews r ON p.id::text = r.product_id::text
      WHERE p.embedding IS NOT NULL
      GROUP BY p.id;
    `;

    const result = await database.query(query);

    let filteredProducts = [];
    if (queryVector) {
      const scoredProducts = result.rows.map((product) => {
        let prodEmbedding = product.embedding;
        if (typeof prodEmbedding === 'string') {
          prodEmbedding = JSON.parse(
            prodEmbedding.replace('{', '[').replace('}', ']')
          );
        }

        const similarity = calculateCosineSimilarity(queryVector, prodEmbedding);
        return { ...product, similarity };
      });

      filteredProducts = scoredProducts
        .filter((p) => p.similarity >= 0.53)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 15);
    }

    if (filteredProducts.length === 0) {
      const fallbackQuery = `
        SELECT p.*, 
               0.5 AS similarity,
               COALESCE(COUNT(r.id), 0)::integer AS review_count 
        FROM products p 
        LEFT JOIN reviews r ON p.id::text = r.product_id::text
        WHERE p.name ILIKE $1 
           OR p.description ILIKE $1 
           OR p.category ILIKE $1
           OR p.name ILIKE ANY($2::text[]) 
           OR p.description ILIKE ANY($2::text[])
        GROUP BY p.id
        LIMIT 15;
      `;
      const fallbackResult = await database.query(fallbackQuery, [searchTerm, searchKeywords]);
      filteredProducts = fallbackResult.rows;
    }

    res.status(200).json({
      success: true,
      message: "AI filtered products fetched successfully.",
      count: filteredProducts.length,
      products: filteredProducts,
    });
  }
);