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
router.post("/ssl-success", sslSuccess);
router.get("/ssl-success", sslSuccess);
router.post("/ssl-fail", sslFail);
router.get("/ssl-fail", sslFail);
router.post("/ssl-cancel", sslCancel);
router.get("/ssl-cancel", sslCancel);

export default router;