import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import { v2 as cloudinary } from "cloudinary";
import { sendEmail } from "../utils/sendemail.js";
export const getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const totalUsersResult = await database.query(
    "SELECT COUNT(*) FROM users;"
  );
  const totalUsers = parseInt(totalUsersResult.rows[0].count, 10) || 0;

  const users = await database.query(
    "SELECT id, name, email, role, avatar, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2;",
    [limit, offset]
  );

  res.status(200).json({
    success: true,
    totalUsers,
    currentPage: page,
    users: users.rows,
  });
});

export const deleteUser = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const deleteUserResult = await database.query(
    "DELETE FROM users WHERE id = $1 RETURNING *;",
    [id]
  );

  if (deleteUserResult.rows.length === 0) {
    return next(new ErrorHandler("User not found", 404));
  }

  const avatar = deleteUserResult.rows[0].avatar;
  if (avatar?.public_id) {
    try {
      await cloudinary.uploader.destroy(avatar.public_id);
    } catch (err) {
      console.error("Cloudinary delete error:", err);
    }
  }

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  });
});

export const dashboardStats = catchAsyncErrors(async (req, res, next) => {
  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split("T")[0];

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const totalRevenueAllTimeQuery = await database.query(`
    SELECT COALESCE(SUM(total_price), 0) AS sum FROM orders WHERE paid_at IS NOT NULL;
  `);
  const totalRevenueAllTime =
    parseFloat(totalRevenueAllTimeQuery.rows[0].sum) || 0;

  const totalUsersCountQuery = await database.query(`
    SELECT COUNT(*) FROM users;
  `);
  const totalUsersCount = parseInt(totalUsersCountQuery.rows[0].count, 10) || 0;

  const orderStatusCountsQuery = await database.query(`
    SELECT order_status, COUNT(*) FROM orders WHERE paid_at IS NOT NULL GROUP BY order_status;
  `);

  const orderStatusCounts = {
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };

  orderStatusCountsQuery.rows.forEach((row) => {
    if (orderStatusCounts.hasOwnProperty(row.order_status)) {
      orderStatusCounts[row.order_status] = parseInt(row.count, 10);
    }
  });

  const todayRevenueQuery = await database.query(
    `
    SELECT COALESCE(SUM(total_price), 0) AS sum 
    FROM orders 
    WHERE created_at::date = $1 AND paid_at IS NOT NULL;
    `,
    [todayDate]
  );
  const todayRevenue = parseFloat(todayRevenueQuery.rows[0].sum) || 0;

  const yesterdayRevenueQuery = await database.query(
    `
    SELECT COALESCE(SUM(total_price), 0) AS sum 
    FROM orders 
    WHERE created_at::date = $1 AND paid_at IS NOT NULL;
    `,
    [yesterdayDate]
  );
  const yesterdayRevenue = parseFloat(yesterdayRevenueQuery.rows[0].sum) || 0;

  const monthlySalesQuery = await database.query(`
    SELECT
      TO_CHAR(created_at, 'Mon YYYY') AS month,
      DATE_TRUNC('month', created_at) AS date,
      COALESCE(SUM(total_price), 0) AS totalsales
    FROM orders 
    WHERE paid_at IS NOT NULL
    GROUP BY month, date
    ORDER BY date ASC;
  `);

  const monthlySales = monthlySalesQuery.rows.map((row) => ({
    month: row.month,
    totalsales: parseFloat(row.totalsales) || 0,
  }));

  const topSellingProductsQuery = await database.query(`
    SELECT 
      p.name,
      p.images->0->>'url' AS image,
      p.category,
      p.ratings,
      SUM(oi.quantity) AS total_sold
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.paid_at IS NOT NULL
    GROUP BY p.id, p.name, p.images, p.category, p.ratings
    ORDER BY total_sold DESC
    LIMIT 5;
  `);
  const topSellingProducts = topSellingProductsQuery.rows;

  const currentMonthSalesQuery = await database.query(
    `
    SELECT COALESCE(SUM(total_price), 0) AS total 
    FROM orders 
    WHERE paid_at IS NOT NULL AND created_at BETWEEN $1 AND $2;
    `,
    [currentMonthStart, currentMonthEnd]
  );
  const currentMonthSales =
    parseFloat(currentMonthSalesQuery.rows[0].total) || 0;

  const lowStockProductsQuery = await database.query(`
    SELECT name, stock FROM products WHERE stock <= 5;
  `);
  const lowStockProducts = lowStockProductsQuery.rows;

  const lastMonthRevenueQuery = await database.query(
    `
    SELECT COALESCE(SUM(total_price), 0) AS total 
    FROM orders
    WHERE paid_at IS NOT NULL AND created_at BETWEEN $1 AND $2;
    `,
    [previousMonthStart, previousMonthEnd]
  );
  const lastMonthRevenue = parseFloat(lastMonthRevenueQuery.rows[0].total) || 0;

  let revenueGrowth = "0%";
  if (lastMonthRevenue > 0) {
    const growthRate =
      ((currentMonthSales - lastMonthRevenue) / lastMonthRevenue) * 100;
    revenueGrowth = `${growthRate >= 0 ? "+" : ""}${growthRate.toFixed(2)}%`;
  }

  const newUsersThisMonthQuery = await database.query(
    `
    SELECT COUNT(*) FROM users WHERE created_at >= $1;
    `,
    [currentMonthStart]
  );
  const newUsersThisMonth = parseInt(newUsersThisMonthQuery.rows[0].count, 10) || 0;

  res.status(200).json({
    success: true,
    message: "Dashboard Stats Fetched Successfully",
    totalRevenueAllTime,
    todayRevenue,
    yesterdayRevenue,
    totalUsersCount,
    orderStatusCounts,
    monthlySales,
    currentMonthSales,
    topSellingProducts,
    lowStockProducts,
    revenueGrowth,
    newUsersThisMonth,
  });
});

export const sendRoleUpdateOTP = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  if (req.user.id === parseInt(id)) {
    return next(new ErrorHandler("You cannot change your own role!", 400));
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpire = new Date(Date.now() + 5 * 60 * 1000);

  await database.query(
    "UPDATE users SET otp = $1, otp_expire = $2 WHERE id = $3;",
    [otp, otpExpire, req.user.id]
  );

  try {
    await sendEmail({
      email: req.user.email,
      subject: "Admin Role Update Verification OTP",
      message: `
        <h2>Admin Role Update Security</h2>
        <p>Your OTP for changing a user role to Admin is: <b>${otp}</b></p>
        <p>This OTP is valid for 5 minutes.</p>
      `,
    });

    res.status(200).json({
      success: true,
      message: `OTP sent successfully to your email (${req.user.email})`,
    });
  } catch (error) {
    await database.query(
      "UPDATE users SET otp = NULL, otp_expire = NULL WHERE id = $1;",
      [req.user.id]
    );
    return next(new ErrorHandler("Email could not be sent. Please try again.", 500));
  }
});
export const updateUserRoleWithOTP = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { role, otp } = req.body;

  if (!otp) {
    return next(new ErrorHandler("Please provide the OTP sent to your email", 400));
  }

  if (req.user.id === parseInt(id)) {
    return next(new ErrorHandler("You cannot change your own role!", 400));
  }

  if (role === "SuperAdmin") {
    return next(new ErrorHandler("SuperAdmin role cannot be assigned via API!", 403));
  }

  const allowedRoles = ["User", "Admin"];
  if (!allowedRoles.includes(role)) {
    return next(new ErrorHandler("Invalid role specified", 400));
  }

  const adminResult = await database.query(
    "SELECT otp, otp_expire FROM users WHERE id = $1;",
    [req.user.id]
  );

  const admin = adminResult.rows[0];

  if (!admin.otp || admin.otp !== otp || new Date() > new Date(admin.otp_expire)) {
    return next(new ErrorHandler("Invalid or expired OTP", 400));
  }

  const updatedUser = await database.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role;",
    [role, id]
  );

  if (updatedUser.rows.length === 0) {
    return next(new ErrorHandler("User not found", 404));
  }

  await database.query(
    "UPDATE users SET otp = NULL, otp_expire = NULL WHERE id = $1;",
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    message: `User role successfully updated to ${role}`,
    user: updatedUser.rows[0],
  });
});