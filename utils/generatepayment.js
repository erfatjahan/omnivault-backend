import SSLCommerzPayment from "sslcommerz-lts";
import database from "../database/db.js";

const store_id = process.env.SSLCOMMERZ_STORE_ID || process.env.SSL_STORE_ID || "testbox";
const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD || process.env.SSL_STORE_PASSWD || "qwerty";
const is_live = process.env.SSLCOMMERZ_IS_LIVE === "true";

export async function generatePaymentIntent(orderId, totalPrice, paymentMethod = "SSLCommerz") {
  try {
    const tran_id = `TRAN_${orderId}_${Date.now()}`;
    const backendUrl = process.env.BACKEND_URL || process.env.SERVER_URL || "https://omnivault-backend-83uu.onrender.com";

    const data = {
      total_amount: Number(totalPrice) || 100,
      currency: "BDT",
      tran_id: tran_id,
      success_url: `${backendUrl}/api/v1/payment/ssl-success?tran_id=${tran_id}&order_id=${orderId}`,
      fail_url: `${backendUrl}/api/v1/payment/ssl-fail?tran_id=${tran_id}&order_id=${orderId}`,
      cancel_url: `${backendUrl}/api/v1/payment/ssl-cancel?tran_id=${tran_id}&order_id=${orderId}`,
      ipn_url: `${backendUrl}/api/v1/payment/ssl-ipn`,
      shipping_method: "Courier",
      product_name: "OmniVault Order Items",
      product_category: "General",
      product_profile: "general",
      cus_name: "Valued Customer",
      cus_email: "customer@omnivault.com",
      cus_add1: "Chittagong",
      cus_city: "Chittagong",
      cus_state: "Chittagong",
      cus_postcode: "4000",
      cus_country: "Bangladesh",
      cus_phone: "01700000000",
      ship_name: "Valued Customer",
      ship_add1: "Chittagong",
      ship_city: "Chittagong",
      ship_state: "Chittagong",
      ship_postcode: "4000",
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);

    if (apiResponse && apiResponse.GatewayPageURL) {
      try {
        await database.query(
          "INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [orderId, paymentMethod, "Pending", apiResponse.sessionkey || tran_id]
        );
      } catch (dbErr) {
      }

      return {
        success: true,
        paymentUrl: apiResponse.GatewayPageURL,
      };
    } else {
      throw new Error(apiResponse?.failedreason || "Failed to connect with SSLCommerz gateway.");
    }
  } catch (error) {
    console.error("SSLCommerz Payment Error:", error.message);
    throw new Error(error.message || "Payment Gateway Initialization Failed.");
  }
}