import express from "express";
import { initSSLPayment, sslSuccess, sslFail } from "../controllers/paymentController.js";
import { isAuthenticated } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/ssl-init", isAuthenticated, initSSLPayment);
router.post("/ssl-success", sslSuccess);
router.post("/ssl-fail", sslFail);

export default router;