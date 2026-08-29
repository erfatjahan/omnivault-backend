import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { v2 as cloudinary } from "cloudinary";
import database from "../database/db.js";
import { getAIRecommendation } from "../utils/aigetrecommendation.js";

export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const { name, description, price, category, stock } = req.body;
  const created_by = req.user?.id;

  if (!name || !description || !price || !category || stock === undefined) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400)
    );
  }

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
    `INSERT INTO products (name, description, price, category, stock, images, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      name,
      description,
      Number(price),
      category,
      Number(stock),
      JSON.stringify(uploadedImages),
      created_by,
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
  const values = [];
  let index = 1;

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
        conditions.push(`p.price >= $${index} AND p.price <= $${index + 1}`);
        values.push(min, max);
        index += 2;
      }
    } else if (!isNaN(Number(price))) {
      conditions.push(`p.price <= $${index}`);
      values.push(Number(price));
      index++;
    }
  }

  if (category && category.trim() !== "") {
    conditions.push(`p.category ILIKE $${index}`);
    values.push(`%${category.trim()}%`);
    index++;
  }

  if (ratings && !isNaN(Number(ratings))) {
    conditions.push(`p.ratings >= $${index}`);
    values.push(Number(ratings));
    index++;
  }

  if (search && search.trim() !== "") {
    conditions.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`);
    values.push(`%${search.trim()}%`);
    index++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(DISTINCT p.id) FROM products p ${whereClause}`;
  const totalProductsResult = await database.query(countQuery, values);
  const totalProducts = parseInt(totalProductsResult.rows[0]?.count || 0);

  const fetchValues = [...values, limit, offset];
  const limitIndex = index;
  const offsetIndex = index + 1;


  const query = `
    SELECT p.*, 
    COALESCE(COUNT(r.id), 0) AS review_count 
    FROM products p 
    LEFT JOIN reviews r ON p.id = r.product_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const result = await database.query(query, fetchValues);
  const newProductsQuery = `
    SELECT p.*,
    COALESCE(COUNT(r.id), 0) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
  `;
  const newProductsResult = await database.query(newProductsQuery);

  const topRatedQuery = `
    SELECT p.*,
    COALESCE(COUNT(r.id), 0) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.ratings >= 4.5
    GROUP BY p.id
    ORDER BY p.ratings DESC, p.created_at DESC
    LIMIT 8
  `;
  const topRatedResult = await database.query(topRatedQuery);

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
  
  const product = await database.query("SELECT * FROM products WHERE id = $1", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const result = await database.query(
    `UPDATE products SET name = $1, description = $2, price = $3, category = $4, stock = $5 WHERE id = $6 RETURNING *`,
    [name, description, Number(price), category, Number(stock), productId]
  );

  res.status(200).json({
    success: true,
    message: "Product updated successfully.",
    updatedProduct: result.rows[0],
  });
});

export const deleteProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;

  const product = await database.query("SELECT * FROM products WHERE id = $1", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const images = product.rows[0].images;

  const client = await database.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM reviews WHERE product_id = $1", [productId]);
    
    const deleteResult = await client.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
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
      LEFT JOIN reviews r ON p.id = r.product_id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE p.id = $1
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

export const postProductReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  if (!rating || !comment) {
    return next(new ErrorHandler("Please provide rating and comment.", 400));
  }

  const purchasheCheckQuery = `
    SELECT oi.product_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN payments p ON p.order_id = o.id
    WHERE o.buyer_id = $1
    AND oi.product_id = $2
    AND p.payment_status = 'Paid'
    LIMIT 1 
  `;

  const { rows } = await database.query(purchasheCheckQuery, [
    req.user.id,
    productId,
  ]);

  if (rows.length === 0) {
    return res.status(403).json({
      success: false,
      message: "You can only review a product you've purchased.",
    });
  }

  const product = await database.query("SELECT * FROM products WHERE id = $1", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const isAlreadyReviewed = await database.query(
    `SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2`,
    [productId, req.user.id]
  );

  let review;
  if (isAlreadyReviewed.rows.length > 0) {
    review = await database.query(
      "UPDATE reviews SET rating = $1, comment = $2 WHERE product_id = $3 AND user_id = $4 RETURNING *",
      [rating, comment, productId, req.user.id]
    );
  } else {
    review = await database.query(
      "INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *",
      [productId, req.user.id, rating, comment]
    );
  }

  const allReviews = await database.query(
    `SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1`,
    [productId]
  );

  const newAvgRating = parseFloat(allReviews.rows[0]?.avg_rating || 0).toFixed(1);

  const updatedProduct = await database.query(
    `UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *`,
    [newAvgRating, productId]
  );

  res.status(200).json({
    success: true,
    message: "Review posted.",
    review: review.rows[0],
    product: updatedProduct.rows[0],
  });
});

export const deleteReview = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;
  const review = await database.query(
    "DELETE FROM reviews WHERE product_id = $1 AND user_id = $2 RETURNING *",
    [productId, req.user.id]
  );

  if (review.rows.length === 0) {
    return next(new ErrorHandler("Review not found.", 404));
  }

  const allReviews = await database.query(
    `SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1`,
    [productId]
  );

  const newAvgRating = parseFloat(allReviews.rows[0]?.avg_rating || 0).toFixed(1);

  const updatedProduct = await database.query(
    `UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *`,
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
    if (!userPrompt) {
      return next(new ErrorHandler("Provide a valid prompt.", 400));
    }
    const result = await database.query(
      `SELECT * FROM products ORDER BY created_at DESC LIMIT 150;`
    );

    const allProducts = result.rows;

    if (allProducts.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No products available in store.",
        products: [],
      });
    }

    const { success, products } = await getAIRecommendation(
      req,
      res,
      userPrompt,
      allProducts
    );

    res.status(200).json({
      success: success ?? true,
      message: "AI filtered products.",
      products: products || [],
    });
  }
);