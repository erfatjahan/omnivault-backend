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
    let order_id = req.query.order_id || req.body.order_id || req.body.value_a || req.query.value_a;

    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";

    if (!order_id && tran_id) {
      try {
        const findOrderByTran = await database.query(
          `SELECT id FROM orders WHERE transaction_id = $1 OR payment_intent_id = $1`,
          [tran_id]
        );
        if (findOrderByTran.rows.length > 0) {
          order_id = findOrderByTran.rows[0].id;
        }
      } catch (err) {}
    }

    let isPayForMeOrder = false;

    if (order_id) {
      try {
        const orderCheck = await database.query(
          `SELECT is_pay_for_me, payment_status FROM orders WHERE id::text = $1::text`,
          [order_id]
        );
        
        if (orderCheck.rows.length > 0) {
          isPayForMeOrder = orderCheck.rows[0].is_pay_for_me;

          if (orderCheck.rows[0].payment_status === 'Paid') {
            return res.redirect(`${clientUrl}/payment-success?type=pay-for-me`);
          }
        }
      } catch (dbErr) {
        isPayForMeOrder = false;
      }

      await database.query(
        `UPDATE orders 
         SET payment_status = 'Paid', order_status = 'Processing', transaction_id = $1, paid_at = CURRENT_TIMESTAMP, pay_for_me_token = NULL 
         WHERE id::text = $2::text`,
        [tran_id, order_id]
      );
      
      try {
        await database.query(
          `UPDATE payments SET payment_status = 'Success' WHERE order_id::text = $1::text`,
          [order_id]
        );
      } catch (err) {}

      try {
        await database.query(
          `DELETE FROM carts WHERE user_id = (SELECT user_id FROM orders WHERE id::text = $1::text)`,
          [order_id]
        );
      } catch (cartErr) {
        console.error("Cart clear error:", cartErr);
      }
    }

    if (isPayForMeOrder) {
      return res.redirect(`${clientUrl}/payment-success?type=pay-for-me`);
    }

    return res.redirect(`${clientUrl}/orders?status=success`);
  } catch (error) {
    console.error("SSL Success Callback Error:", error);
    const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://omnivault-frontend-one.vercel.app";
    return res.redirect(`${clientUrl}/payment-success?type=pay-for-me`);
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