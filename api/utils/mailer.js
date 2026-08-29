const sgMail = require('@sendgrid/mail');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  FROM_EMAIL,
  SENDGRID_API_KEY,
  SENDGRID_DYNAMIC_TEMPLATE_ID,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY
} = process.env;

let transporter = null;
let sesClient = null;
let usingSendGrid = false;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  usingSendGrid = true;
  console.log('Mailer: configured to use SendGrid');
}

if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION) {
  sesClient = new SESClient({ region: AWS_REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
  console.log('Mailer: configured to use AWS SES');
}

if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: SMTP_SECURE === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  console.log('Mailer: configured to use SMTP');
}

async function sendEmail(to, subject, text, html, options = {}) {
  // options: { templateId, templateData }
  try {
    const templateId = options.templateId || process.env.SENDGRID_DYNAMIC_TEMPLATE_ID;
    const templateData = options.templateData || {};

    if (usingSendGrid) {
      const msg = {
        to,
        from: FROM_EMAIL || SMTP_USER,
        subject,
      };

      if (templateId) {
        msg.templateId = templateId;
        msg.dynamic_template_data = templateData;
      } else {
        msg.text = text;
        msg.html = html;
      }

      const res = await sgMail.send(msg);
      console.log('SendGrid send result', res && res[0] && res[0].statusCode);
      return res;
    }

    if (sesClient) {
      // Render html via handlebars if templateData provided
      let compiledHtml = html;
      let compiledText = text;
      if (templateData && Object.keys(templateData).length > 0) {
        if (html) {
          const tpl = Handlebars.compile(html);
          compiledHtml = tpl(templateData);
        }
        if (text) {
          const tpl2 = Handlebars.compile(text);
          compiledText = tpl2(templateData);
        }
      }

      const params = {
        Destination: { ToAddresses: [to] },
        Message: {
          Body: {
            Html: { Data: compiledHtml || compiledText || '' },
            Text: { Data: compiledText || compiledHtml || '' }
          },
          Subject: { Data: subject }
        },
        Source: FROM_EMAIL || SMTP_USER
      };

      const command = new SendEmailCommand(params);
      const result = await sesClient.send(command);
      console.log('SES send result', result);
      return result;
    }

    if (transporter) {
      // If templateData provided, try to render
      let compiledHtml = html;
      let compiledText = text;
      if (templateData && Object.keys(templateData).length > 0) {
        if (html) {
          const tpl = Handlebars.compile(html);
          compiledHtml = tpl(templateData);
        }
        if (text) {
          const tpl2 = Handlebars.compile(text);
          compiledText = tpl2(templateData);
        }
      }

      const info = await transporter.sendMail({
        from: FROM_EMAIL || SMTP_USER,
        to,
        subject,
        text: compiledText,
        html: compiledHtml
      });
      console.log('SMTP send result', info.messageId);
      return info;
    }

    // Fallback: log to console for dev if no provider configured
    console.log('Email (mock) to:', to);
    console.log('Subject:', subject);
    console.log('Text:', text);
    if (html) console.log('HTML:', html);
    if (options.templateId || options.templateData) console.log('TemplateData:', options.templateData);
    return { mocked: true };
  } catch (err) {
    console.error('sendEmail error', err);
    throw err;
  }
}

module.exports = sendEmail;
