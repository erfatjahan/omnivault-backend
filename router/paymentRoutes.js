import express from "express";
import {
  initSSLPayment,
  sslSuccess,
  sslFail,
  sslCancel,
} from "../controllers/paymentController.js";
import { isAuthenticated } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/ssl-init", isAuthenticated, initSSLPayment);

router.post("/success/:orderId", sslSuccess);
router.get("/success/:orderId", sslSuccess);

router.post("/fail/:orderId", sslFail);
router.get("/fail/:orderId", sslFail);

router.post("/cancel/:orderId", sslCancel);
router.get("/cancel/:orderId", sslCancel);

export default router;