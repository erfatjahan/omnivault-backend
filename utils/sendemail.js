// import nodeMailer from "nodemailer";

// export const sendEmail = async ({ email, subject, message }) => {
//   const transporter = nodeMailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: Number(process.env.SMTP_PORT) || 465,
//     secure: Number(process.env.SMTP_PORT) === 465, 
//     auth: {
//       user: process.env.SMTP_MAIL,
//       pass: process.env.SMTP_PASSWORD, 
//     },
//   });

//   const mailOptions = {
//     from: `"OmniVault Security" <${process.env.SMTP_MAIL}>`,
//     to: email,
//     subject,
//     html: message,
//   };

//   await transporter.sendMail(mailOptions);
// };
import axios from "axios";

export const sendEmail = async ({ email, subject, message }) => {
  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "OmniVault Security",
          email: process.env.SMTP_MAIL, 
        },
        to: [{ email: email }],
        subject: subject,
        htmlContent: message,
      },
      {
        headers: {
          "api-key": process.env.SMTP_PASSWORD, 
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    console.log("Email sent successfully via Brevo API: ", response.data.messageId);
    return true;
  } catch (error) {
    console.error("FULL BREVO API ERROR DETAILS:", error.response?.data || error.message);
    throw new Error(`Email failed: ${error.response?.data?.message || error.message}`);
  }
};