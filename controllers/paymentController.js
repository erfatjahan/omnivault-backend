import SSLCommerzPayment from "sslcommerz-lts";
import database from "../database/db.js";

const store_id = process.env.SSL_STORE_ID || "testbox";
const store_passwd = process.env.SSL_STORE_PASSWD || "qwerty";
const is_live = false; // Sandbox testing er jonno false

export const initSSLPayment = async (req, res, next) => {
  try {
    const { orderId, totalPrice, shippingInfo } = req.body;
    const tran_id = `TXN_${orderId || Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const serverUrl = process.env.SERVER_URL || "http://localhost:5000";

    const data = {
      total_amount: Number(totalPrice) || 100,
      currency: "BDT",
      tran_id: tran_id,
      success_url: `${serverUrl}/api/v1/payment/ssl-success?tran_id=${tran_id}&order_id=${orderId}`,
      fail_url: `${serverUrl}/api/v1/payment/ssl-fail?tran_id=${tran_id}&order_id=${orderId}`,
      cancel_url: `${serverUrl}/api/v1/payment/ssl-cancel?tran_id=${tran_id}&order_id=${orderId}`,
      ipn_url: `${serverUrl}/api/v1/payment/ssl-ipn`,
      shipping_method: "Courier",
      product_name: "Ecommerce Order",
      product_category: "General",
      product_profile: "general",
      cus_name: shippingInfo?.fullName || "Test Customer",
      cus_email: "customer@example.com",
      cus_add1: shippingInfo?.address || "Chattogram, Bangladesh",
      cus_city: shippingInfo?.city || "Chattogram",
      cus_state: shippingInfo?.state || "Chittagong",
      cus_postcode: shippingInfo?.pincode || "4000",
      cus_country: "Bangladesh",
      cus_phone: shippingInfo?.phone || "01700000000",
      ship_name: shippingInfo?.fullName || "Test Customer",
      ship_add1: shippingInfo?.address || "Chattogram, Bangladesh",
      ship_city: shippingInfo?.city || "Chattogram",
      ship_state: shippingInfo?.state || "Chittagong",
      ship_postcode: shippingInfo?.pincode || "4000",
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);

    if (apiResponse?.GatewayPageURL) {
      return res.status(200).json({
        success: true,
        gatewayUrl: apiResponse.GatewayPageURL,
      });
    }

    return res.status(400).json({
      success: false,
      message: apiResponse?.failedreason || "SSLCommerz session failed to initialize.",
    });
  } catch (error) {
    console.error("SSL Init Error:", error);
    next(error);
  }
};

export const sslSuccess = async (req, res, next) => {
  try {
    const { tran_id, order_id } = req.query;
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    if (order_id) {
      await database.query(
        `UPDATE orders 
         SET payment_status = 'Paid', transaction_id = $1 
         WHERE id = $2`,
        [tran_id, order_id]
      );
    }

  
    return res.redirect(`${clientUrl}/orders?status=success`);
  } catch (error) {
    console.error("SSL Success Callback Error:", error);
    next(error);
  }
};


export const sslFail = async (req, res, next) => {
  try {
    const { order_id } = req.query;
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    if (order_id) {
      await database.query(
        `UPDATE orders 
         SET payment_status = 'Failed' 
         WHERE id = $1`,
        [order_id]
      );
    }

    return res.redirect(`${clientUrl}/orders?status=failed`);
  } catch (error) {
    console.error("SSL Fail Callback Error:", error);
    next(error);
  }
};


export const sslCancel = async (req, res, next) => {
  try {
    const { order_id } = req.query;
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    if (order_id) {
      await database.query(
        `UPDATE orders 
         SET payment_status = 'Cancelled' 
         WHERE id = $1`,
        [order_id]
      );
    }

    return res.redirect(`${clientUrl}/orders?status=cancelled`);
  } catch (error) {
    console.error("SSL Cancel Callback Error:", error);
    next(error);
  }
};