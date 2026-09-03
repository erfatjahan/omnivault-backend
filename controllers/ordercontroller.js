import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import { generatePaymentIntent } from "../utils/generatepayment.js";

export const placeNewOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    full_name,
    state,
    city,
    country,
    address,
    pincode,
    phone,
    orderedItems,
    payment_type = "COD",
    payment_method = "COD",
  } = req.body;

  if (
    !full_name ||
    !state ||
    !city ||
    !country ||
    !address ||
    !pincode ||
    !phone
  ) {
    return next(
      new ErrorHandler("Please provide complete shipping details.", 400)
    );
  }

  const items = Array.isArray(orderedItems)
    ? orderedItems
    : JSON.parse(orderedItems || "[]");

  if (!items || items.length === 0) {
    return next(new ErrorHandler("No items in cart.", 400));
  }

  // Product ID extraction
  const productIds = items
    .map(
      (item) =>
        item.product?.id ||
        item.product?._id ||
        item.productId ||
        item.product_id ||
        item.id
    )
    .filter(Boolean);

  if (productIds.length === 0) {
    return next(new ErrorHandler("Invalid product information.", 400));
  }

  const { rows: products } = await database.query(
    `SELECT id, price, stock, name, images FROM products WHERE id::text = ANY($1::text[])`,
    [productIds.map(String)]
  );

  let rawSubtotal = 0;
  const processedItems = [];

  for (const item of items) {
    const pId =
      item.product?.id ||
      item.product?._id ||
      item.productId ||
      item.product_id ||
      item.id;
    const product = products.find((p) => String(p.id) === String(pId));

    if (!product) {
      return next(
        new ErrorHandler(`Product not found for ID: ${pId}`, 404)
      );
    }

    const itemQty = Number(item.quantity || item.qty || 1);

    if (itemQty > product.stock) {
      return next(
        new ErrorHandler(
          `Only ${product.stock} units available for "${product.name}".`,
          400
        )
      );
    }

    rawSubtotal += Number(product.price) * itemQty;

    let itemImage = "";
    if (item.image) {
      itemImage =
        typeof item.image === "string" ? item.image : item.image?.url || "";
    } else if (product.images && product.images.length > 0) {
      itemImage =
        typeof product.images[0] === "string"
          ? product.images[0]
          : product.images[0]?.url || "";
    }

    processedItems.push({
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: itemQty,
      image: itemImage,
    });
  }

  const tax_price = Number((rawSubtotal * 0.05).toFixed(2));
  const shipping_price = rawSubtotal >= 1500 ? 0.0 : 60.0;
  const total_price = Number(
    (rawSubtotal + tax_price + shipping_price).toFixed(2)
  );

  const rawMethod = payment_type || payment_method;
  let sanitizedPaymentType = "COD";
  const incoming = String(rawMethod).toLowerCase();
  if (
    incoming.includes("ssl") ||
    incoming.includes("online") ||
    incoming.includes("card")
  ) {
    sanitizedPaymentType = "SSLCommerz";
  } else if (incoming.includes("bkash")) {
    sanitizedPaymentType = "bKash";
  } else {
    sanitizedPaymentType = "COD";
  }

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders (
        buyer_id, total_price, tax_price, shipping_price, order_status, payment_status, payment_method
      ) VALUES ($1, $2, $3, $4, 'Pending', 'Unpaid', $5) RETURNING *`,
      [req.user.id, total_price, tax_price, shipping_price, sanitizedPaymentType]
    );

    const orderId = orderResult.rows[0].id;

    for (const pItem of processedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, image, title)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderId,
          pItem.productId,
          pItem.quantity,
          pItem.price,
          pItem.image,
          pItem.name,
        ]
      );

      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id::text = $2::text`,
        [pItem.quantity, pItem.productId]
      );
    }
    await client.query(
      `INSERT INTO shipping_info (
        order_id, full_name, state, city, country, address, pincode, phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orderId, full_name, state, city, country, address, pincode, phone]
    );

    await client.query("COMMIT");
    client.release();

    if (sanitizedPaymentType === "COD") {
      return res.status(201).json({
        success: true,
        message: "Order placed successfully with Cash on Delivery.",
        orderId,
        payment_type: "COD",
        total_price,
      });
    }

    let paymentResponse = { success: true, clientSecret: "" };
    if (typeof generatePaymentIntent === "function") {
      paymentResponse = await generatePaymentIntent(
        orderId,
        total_price,
        sanitizedPaymentType
      );
    }

    res.status(201).json({
      success: true,
      message: `Order placed successfully. Proceeding to ${sanitizedPaymentType} payment.`,
      orderId,
      paymentUrl:
        paymentResponse.paymentUrl || paymentResponse.clientSecret || "",
      payment_type: sanitizedPaymentType,
      total_price,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    client.release();
    return next(new ErrorHandler(error.message || "Failed to create order.", 500));
  }
});

export const fetchSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const result = await database.query(
    `
    SELECT 
      o.*, 
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'title', oi.title,
              'image', oi.image,
              'quantity', oi.quantity,
              'price', oi.price,
              'created_at', oi.created_at
            )
          )
          FROM order_items oi
          WHERE oi.order_id::text = o.id::text
        ), '[]'::json
      ) AS order_items,
      (
        SELECT to_json(s.*)
        FROM shipping_info s
        WHERE s.order_id::text = o.id::text
        ORDER BY s.id DESC
        LIMIT 1
      ) AS shipping_info
    FROM orders o
    WHERE o.id::text = $1::text
    `,
    [orderId]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Order not found.", 404));
  }

  res.status(200).json({
    success: true,
    message: "Order fetched successfully.",
    order: result.rows[0],
  });
});

export const fetchMyOrders = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?.id || req.user?._id;

  if (!userId) {
    return next(new ErrorHandler("Please login to view orders.", 401));
  }

  const result = await database.query(
    `
    SELECT 
      o.*, 
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'title', oi.title,
              'image', oi.image,
              'quantity', oi.quantity,
              'price', oi.price,
              'created_at', oi.created_at
            )
          )
          FROM order_items oi
          WHERE oi.order_id::text = o.id::text
        ), '[]'::json
      ) AS order_items,
      (
        SELECT to_json(s.*)
        FROM shipping_info s
        WHERE s.order_id::text = o.id::text
        ORDER BY s.id DESC
        LIMIT 1
      ) AS shipping_info 
    FROM orders o
    WHERE o.buyer_id::text = $1::text
    GROUP BY o.id
    ORDER BY o.created_at DESC;
    `,
    [userId]
  );

  res.status(200).json({
    success: true,
    message: "All your orders are fetched.",
    myOrders: result.rows,
  });
});

export const fetchAllOrders = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(`
    SELECT 
      o.id,
      o.buyer_id,
      COALESCE(o.total_price, 0) AS total_price,
      COALESCE(o.total_price, 0) AS "totalAmount",
      COALESCE(o.tax_price, 0) AS tax_price,
      COALESCE(o.shipping_price, 0) AS shipping_price,
      COALESCE(o.order_status, 'Pending') AS order_status,
      COALESCE(o.order_status, 'Pending') AS "orderStatus",
      COALESCE(o.payment_status, 'Unpaid') AS payment_status,
      COALESCE(o.payment_method, 'COD') AS "paymentMethod",
      o.transaction_id,
      o.paid_at,
      o.created_at,
      COALESCE(
        (SELECT s.full_name FROM shipping_info s WHERE s.order_id::text = o.id::text ORDER BY s.id DESC LIMIT 1),
        u.name,
        'Customer'
      ) AS "customerName",
      COALESCE(u.email, 'N/A') AS "customerEmail",
      COALESCE(
        (
          SELECT COUNT(*) 
          FROM order_items oi 
          WHERE oi.order_id::text = o.id::text
        ), 0
      ) AS "itemsCount",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'title', oi.title,
              'image', oi.image,
              'quantity', oi.quantity,
              'price', oi.price,
              'created_at', oi.created_at
            )
          )
          FROM order_items oi
          WHERE oi.order_id::text = o.id::text
        ), '[]'::json
      ) AS order_items, 
      (
        SELECT to_json(s.*)
        FROM shipping_info s
        WHERE s.order_id::text = o.id::text
        ORDER BY s.id DESC
        LIMIT 1
      ) AS shipping_info
    FROM orders o
    LEFT JOIN users u ON u.id::text = o.buyer_id::text
    GROUP BY o.id, u.name, u.email
    ORDER BY o.created_at DESC;
  `);

  res.status(200).json({
    success: true,
    message: "All orders fetched.",
    orders: result.rows,
  });
});

export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { status, order_status, payment_status } = req.body;
  const { orderId } = req.params;

  const newStatus = status || order_status;

  if (!newStatus && !payment_status) {
    return next(
      new ErrorHandler("Please provide a valid status to update.", 400)
    );
  }

  const results = await database.query(
    `SELECT * FROM orders WHERE id::text = $1::text`,
    [orderId]
  );

  if (results.rows.length === 0) {
    return next(new ErrorHandler("Order not found.", 404));
  }

  const updatedOrder = await database.query(
    `
    UPDATE orders 
    SET 
      order_status = COALESCE($1, order_status),
      payment_status = COALESCE($2, payment_status),
      paid_at = CASE WHEN $2 = 'Paid' THEN CURRENT_TIMESTAMP ELSE paid_at END
    WHERE id::text = $3::text
    RETURNING *
    `,
    [newStatus || null, payment_status || null, orderId]
  );

  res.status(200).json({
    success: true,
    message: "Order status updated successfully.",
    updatedOrder: updatedOrder.rows[0],
    order: updatedOrder.rows[0],
  });
});

export const deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;

  await database.query(
    `DELETE FROM order_items WHERE order_id::text = $1::text`,
    [orderId]
  );
  await database.query(
    `DELETE FROM shipping_info WHERE order_id::text = $1::text`,
    [orderId]
  );

  const results = await database.query(
    `DELETE FROM orders WHERE id::text = $1::text RETURNING *`,
    [orderId]
  );

  if (results.rows.length === 0) {
    return next(new ErrorHandler("Invalid order ID.", 404));
  }

  res.status(200).json({
    success: true,
    message: "Order deleted successfully.",
    order: results.rows[0],
  });
});