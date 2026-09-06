import express from "express";
import {
  getAllUsers,
  deleteUser,
  dashboardStats,
  sendRoleUpdateOTP,
  updateUserRoleWithOTP,
} from "../controllers/admincontrollers.js";
import {
  authorizedRoles,
  isAuthenticated,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/users", isAuthenticated, authorizedRoles("Admin", "SuperAdmin"), getAllUsers);

router.delete("/user/:id", isAuthenticated, authorizedRoles("Admin", "SuperAdmin"), deleteUser);
router.delete("/delete/:id", isAuthenticated, authorizedRoles("Admin", "SuperAdmin"), deleteUser);

router.get("/stats", isAuthenticated, authorizedRoles("Admin", "SuperAdmin"), dashboardStats);
router.get("/fetch/dashboard-stats", isAuthenticated, authorizedRoles("Admin", "SuperAdmin"), dashboardStats);

router.post("/user/:id/send-role-otp", isAuthenticated, authorizedRoles("SuperAdmin"), sendRoleUpdateOTP);

router.put("/user/:id/update-role", isAuthenticated, authorizedRoles("SuperAdmin"), updateUserRoleWithOTP);

export default router;