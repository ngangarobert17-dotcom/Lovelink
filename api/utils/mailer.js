const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  FROM_EMAIL
} = process.env;

let transporter = null;
if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
} else {
  console.warn('SMTP not configured - emails will be logged to console');
}

async function sendEmail(to, subject, text, html) {
  try {
    if (!transporter) {
      console.log('Email (mock) to:', to);
      console.log('Subject:', subject);
      console.log('Text:', text);
      if (html) console.log('HTML:', html);
      return;
    }

    const info = await transporter.sendMail({
      from: FROM_EMAIL || SMTP_USER,
      to,
      subject,
      text,
      html
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (err) {
    console.error('sendEmail error', err);
    throw err;
  }
}

module.exports = sendEmail;
