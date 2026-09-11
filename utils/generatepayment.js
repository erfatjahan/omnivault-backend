import axios from "axios";
import database from "../database/db.js";

export async function generatePaymentIntent(orderId, totalPrice, paymentMethod = "SSLCommerz") {
  try {
    const isLive = process.env.NODE_ENV === "production" && process.env.SSLCOMMERZ_IS_LIVE === "true";
    const gatewayUrl = isLive 
      ? "https://securepay.sslcommerz.com/gwprocess/v4/api.v1.php" 
      : "https://sandbox.sslcommerz.com/gwprocess/v4/api.v1.php";

    const store_id = process.env.SSLCOMMERZ_STORE_ID;
    const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD;

    if (!store_id || !store_passwd) {
      throw new Error("SSLCommerz Store ID or Password is missing in environment variables.");
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://omnivault-frontend-one.vercel.app";
    const backendUrl = process.env.BACKEND_URL || "https://omnivault-backend-83uu.onrender.com";

    const data = new URLSearchParams();
    data.append("store_id", store_id);
    data.append("store_passwd", store_passwd);
    data.append("total_amount", totalPrice);
    data.append("currency", "BDT");
    data.append("tran_id", `TRAN_${orderId}_${Date.now()}`);
    data.append("success_url", `${backendUrl}/api/v1/payment/success/${orderId}`);
    data.append("fail_url", `${backendUrl}/api/v1/payment/fail/${orderId}`);
    data.append("cancel_url", `${backendUrl}/api/v1/payment/cancel/${orderId}`);
    data.append("ipn_url", `${backendUrl}/api/v1/payment/ipn`);
    
    data.append("cus_name", "Valued Customer");
    data.append("cus_email", "customer@omnivault.com");
    data.append("cus_add1", "Chittagong");
    data.append("cus_city", "Chittagong");
    data.append("cus_country", "Bangladesh");
    data.append("cus_phone", "01700000000");
    
    data.append("shipping_method", "NO");
    data.append("product_name", "OmniVault Order Items");
    data.append("product_category", "General");
    data.append("product_profile", "general");

    const response = await axios.post(gatewayUrl, data, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (response.data && response.data.status === "SUCCESS") {

      await database.query(
        "INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [orderId, paymentMethod, "Pending", response.data.sessionkey || `TRAN_${orderId}`]
      );

      return {
        success: true,
        paymentUrl: response.data.GatewayPageURL,
      };
    } else {
      throw new Error(response.data?.failedreason || "Failed to connect with SSLCommerz gateway.");
    }
  } catch (error) {
    console.error("SSLCommerz Payment Error:", error.response?.data || error.message);
    throw new Error(error.message || "Payment Gateway Initialization Failed.");
  }
}