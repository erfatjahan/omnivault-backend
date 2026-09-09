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