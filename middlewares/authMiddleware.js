import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "./catchAsyncError.js";
import ErrorHandler from "./errorMiddleware.js";
import database from "../database/db.js";

export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
 
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return next(
      new ErrorHandler("Please login to access this resource.", 401)
    );
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
  } catch (error) {
    return next(
      new ErrorHandler("Session expired or invalid token. Please login again.", 401)
    );
  }

  if (!decoded?.id) {
    return next(new ErrorHandler("Invalid token payload.", 401));
  }

  const user = await database.query(
    "SELECT id, name, email, role, avatar, created_at FROM users WHERE id::text = $1::text LIMIT 1",
    [decoded.id]
  );

  if (user.rows.length === 0) {
    return next(new ErrorHandler("User not found.", 404));
  }

  req.user = user.rows[0];
  next();
});

export const authorizedRoles = (...roles) => {
  return (req, res, next) => {
    const allowedRoles = roles.map((role) => role.toLowerCase());
    const userRole = req.user?.role ? req.user.role.toLowerCase() : "";

    if (!allowedRoles.includes(userRole)) {
      return next(
        new ErrorHandler(
          `Role: ${req.user?.role} is not allowed to access this resource.`,
          403
        )
      );
    }
    next();
  };
};