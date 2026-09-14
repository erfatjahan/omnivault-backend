import SSLCommerzPayment from "sslcommerz-lts";
import database from "../database/db.js";
import { generatePaymentIntent } from "../utils/generatepayment.js";

const store_id = process.env.SSLCOMMERZ_STORE_ID || process.env.SSL_STORE_ID || "testbox";
const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD || process.env.SSL_STORE_PASSWD || "qwerty";
const is_live = process.env.SSLCOMMERZ_IS_LIVE === "true";  

export const initSSLPayment = async (req, res, next) => {
  try {
    const { orderId, totalPrice, shippingInfo } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required to initiate payment.",
      });
    }

    const paymentResponse = await generatePaymentIntent(orderId, totalPrice, "SSLCommerz");

    if (paymentResponse.success && paymentResponse.paymentUrl) {
      return res.status(200).json({
        success: true,
        gatewayUrl: paymentResponse.paymentUrl,
        paymentUrl: paymentResponse.paymentUrl,
      });
    }

    return res.status(400).json({
      success: false,
      message: paymentResponse.message || "SSLCommerz session failed to initialize.",
    });
  } catch (error) {
    console.error("SSL Init Error:", error);
    next(error);
  }
};

export const sslSuccess = async (req, res, next) => {
  try {
    const tran_id = req.query.tran_id || req.body.tran_id;
    const order_id = req.query.order_id || req.body.order_id || req.body.value_a;

    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";

    if (order_id) {
      await database.query(
        `UPDATE orders 
         SET payment_status = 'Paid', order_status = 'Processing', transaction_id = $1, paid_at = CURRENT_TIMESTAMP 
         WHERE id::text = $2::text`,
        [tran_id, order_id]
      );
      
      try {
        await database.query(
          `UPDATE payments SET payment_status = 'Success' WHERE order_id::text = $1::text`,
          [order_id]
        );
      } catch (err) {
      }
    }
    return res.redirect(`${clientUrl}/orders?status=success`);
  } catch (error) {
    console.error("SSL Success Callback Error:", error);
    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";
    return res.redirect(`${clientUrl}/orders?status=failed`);
  }
};

export const sslFail = async (req, res, next) => {
  try {
    const order_id = req.query.order_id || req.body.order_id || req.body.value_a;
    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";

    if (order_id) {
      await database.query(
        `UPDATE orders 
         SET payment_status = 'Failed' 
         WHERE id::text = $1::text`,
        [order_id]
      );
    }

    return res.redirect(`${clientUrl}/orders?status=failed`);
  } catch (error) {
    console.error("SSL Fail Callback Error:", error);
    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";
    return res.redirect(`${clientUrl}/orders?status=failed`);
  }
};

export const sslCancel = async (req, res, next) => {
  try {
    const order_id = req.query.order_id || req.body.order_id || req.body.value_a;
    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";

    if (order_id) {
      await database.query(
        `UPDATE orders 
         SET payment_status = 'Cancelled' 
         WHERE id::text = $1::text`,
        [order_id]
      );
    }

    return res.redirect(`${clientUrl}/orders?status=cancelled`);
  } catch (error) {
    console.error("SSL Cancel Callback Error:", error);
    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";
    return res.redirect(`${clientUrl}/orders?status=cancelled`);
  }
};