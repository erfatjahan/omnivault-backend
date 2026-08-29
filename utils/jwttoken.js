import jwt from "jsonwebtoken";

export const sendToken = (user, statusCode, message, res) => {
  const token = jwt.sign(
    { id: user.id }, 
    process.env.JWT_SECRET_KEY, 
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    }
  );

  const expireDays = Number(process.env.COOKIE_EXPIRES_IN) || 30;

  const cookieOptions = {
    expires: new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: true,     
    sameSite: "none",
  };

  const userData = { ...user };
  delete userData.password;

  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json({
      success: true,
      user: userData,
      message,
      token,
    });
};