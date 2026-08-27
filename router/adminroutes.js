import express from "express";
import {
  getAllUsers,
  deleteUser,
  dashboardStats,
} from "../controllers/admincontrollers.js";
import {
  authorizedRoles,
  isAuthenticated,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/users", isAuthenticated, authorizedRoles("Admin"), getAllUsers);

router.delete("/user/:id", isAuthenticated, authorizedRoles("Admin"), deleteUser);
router.delete("/delete/:id", isAuthenticated, authorizedRoles("Admin"), deleteUser);

router.get("/stats", isAuthenticated, authorizedRoles("Admin"), dashboardStats);
router.get("/fetch/dashboard-stats", isAuthenticated, authorizedRoles("Admin"), dashboardStats);

export default router;