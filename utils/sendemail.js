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
import nodeMailer from "nodemailer";

export const sendEmail = async ({ email, subject, message }) => {
  try {
    const port = Number(process.env.SMTP_PORT) || 587;

    const transporter = nodeMailer.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_MAIL,
        pass: process.env.SMTP_PASSWORD, 
      },
    });

    const mailOptions = {
      from: `"OmniVault Security" <${process.env.SMTP_MAIL}>`,
      to: email,
      subject,
      html: message,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully: ", info.messageId);
    return true;
  } catch (error) {
    console.error("FULL SMTP ERROR DETAILS:", error);
    throw new Error(`Email failed: ${error.message}`);
  }
};