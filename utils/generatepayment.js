import database from "../database/db.js";
import Stripe from "stripe";

const stripe = new Stripe("sk_test_51U4KsaFmPuOU834fv46TMQOgcDQ8sI5Z8INZX5eFZ089nFnU7oH21iah3qvB8H2L0STWhtNHiWKrUxvvA5xwXmQ900PdsrYknC");

export async function generatePaymentIntent(orderId, totalPrice) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalPrice * 100,
      currency: "usd",
    });

    await database.query(
      "INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [orderId, "Online", "Pending", paymentIntent.client_secret]
    );

    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error("Payment Error:", error.message || error);
    return { success: false, message: "Payment Failed." };
  }
}