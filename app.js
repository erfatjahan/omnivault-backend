import { config } from "dotenv";
config({ path: "./config/config.env" });
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { createTables } from "./utils/createTables.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import authRouter from "./router/authroutes.js";
import productRouter from "./router/productroutes.js";
import adminRouter from "./router/adminroutes.js";
import orderRouter from "./router/orderroutes.js";
import paymentRoutes from "./router/paymentRoutes.js";
import Stripe from "stripe";
import database from "./database/db.js";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://omnivault-dashboard.vercel.app",
  "https://omnivault-frontend.vercel.app",
  process.env.FRONTEND_URL,
  process.env.DASHBOARD_URL,
]
  .filter(Boolean)
  .map((url) => url.trim().replace(/\/+$/, ""));
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const cleanOrigin = origin.trim().replace(/\/+$/, "");

      if (allowedOrigins.indexOf(cleanOrigin) !== -1) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

app.options("*", cors());

// Stripe Webhook
app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      return res.status(400).send(`Webhook Error: ${error.message || error}`);
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent_client_secret = event.data.object.client_secret;
      try {
        const updatedPaymentStatus = "Paid";
        const paymentTableUpdateResult = await database.query(
          `UPDATE payments SET payment_status = $1 WHERE payment_intent_id = $2 RETURNING *`,
          [updatedPaymentStatus, paymentIntent_client_secret]
        );

        const orderId = paymentTableUpdateResult.rows[0]?.order_id;

        if (orderId) {
          await database.query(
            `UPDATE orders SET paid_at = NOW() WHERE id::text = $1::text RETURNING *`,
            [orderId]
          );

          const { rows: orderedItems } = await database.query(
            `SELECT product_id, quantity FROM order_items WHERE order_id::text = $1::text`,
            [orderId]
          );

          for (const item of orderedItems) {
            await database.query(
              `UPDATE products SET stock = stock - $1 WHERE id::text = $2::text`,
              [item.quantity, item.product_id]
            );
          }
        }
      } catch (error) {
        return res
          .status(500)
          .send(`Error updating paid_at timestamp in orders table.`);
      }
    }
    res.status(200).send({ received: true });
  }
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/product", productRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/payment", paymentRoutes);

createTables();

app.use(errorMiddleware);

export default app;