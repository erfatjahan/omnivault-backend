import express from "express";
import {
  fetchSingleOrder,
  placeNewOrder,
  fetchMyOrders,
  fetchAllOrders,
  updateOrderStatus,
  deleteOrder,
  cancelMyOrder,
  createPayForMeRequest,
  getOrderByPaymentToken,
  payForPayForMeOrder,
} from "../controllers/ordercontroller.js";
import {
  isAuthenticated,
  authorizedRoles,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/pay-for-me/create", isAuthenticated, createPayForMeRequest);
router.get("/pay-for-me/:token", getOrderByPaymentToken); 
router.post("/pay-for-me/pay/:token",payForPayForMeOrder);

router.post("/new", isAuthenticated, placeNewOrder);
router.get("/my-orders", isAuthenticated, fetchMyOrders);
router.get("/orders/me", isAuthenticated, fetchMyOrders);
router.put("/cancel/:orderId", isAuthenticated, cancelMyOrder);

router.get(
  "/admin/orders",
  isAuthenticated,
  authorizedRoles("Admin"),
  fetchAllOrders
);
router.get(
  "/admin/getall",
  isAuthenticated,
  authorizedRoles("Admin"),
  fetchAllOrders
);

router.put(
  "/admin/order/:orderId",
  isAuthenticated,
  authorizedRoles("Admin"),
  updateOrderStatus
);
router.put(
  "/admin/update/:orderId",
  isAuthenticated,
  authorizedRoles("Admin"),
  updateOrderStatus
);

router.delete(
  "/admin/order/:orderId",
  isAuthenticated,
  authorizedRoles("Admin"),
  deleteOrder
);
router.delete(
  "/admin/delete/:orderId",
  isAuthenticated,
  authorizedRoles("Admin"),
  deleteOrder
);


router.get("/:orderId", isAuthenticated, fetchSingleOrder);

export default router;