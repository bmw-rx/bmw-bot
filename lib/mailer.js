/**
 * BMW LITE - Welcome Email
 * Inatumia SMTP ya kawaida (Gmail App Password, Zoho, Brevo, n.k.) - weka
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS kwenye Environment Variables.
 * Ikiwa haijawekwa, email haitumwi lakini signup HAITAKWAMA (haizuii akaunti
 * kuundwa - ni "best effort" tu).
 */
const nodemailer = require("nodemailer");

function getTransport() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

async function sendWelcomeEmail(toEmail, name) {
    const transport = getTransport();
    if (!transport) {
        console.warn("⚠️ SMTP haijawekwa (SMTP_HOST/SMTP_USER/SMTP_PASS) - welcome email haikutumwa.");
        return { sent: false, reason: "smtp_not_configured" };
    }

    const html = `
    <div style="font-family: sans-serif; background:#0b0d0c; color:#ecf1ee; padding:32px; border-radius:12px;">
      <h1 style="color:#c8ff4d;">Karibu BMW LITE, ${name}! 👋</h1>
      <p>Akaunti yako imeundwa kikamilifu. Sasa unaweza kuingia kwenye dashboard yako
      kupair WhatsApp, kudhibiti mipangilio ya bot, na kufuatilia commands zote.</p>
      <p style="margin-top:24px;">
        <a href="https://your-domain.example/login.html" style="background:#c8ff4d;color:#0b0d0c;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Ingia kwenye Dashboard →
        </a>
      </p>
      <p style="margin-top:32px;font-size:12px;color:#8b9491;">— Timu ya BMW LITE</p>
    </div>`;

    try {
        await transport.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: toEmail,
            subject: "Karibu BMW LITE 🎉",
            html,
        });
        return { sent: true };
    } catch (err) {
        console.error("Welcome email failed:", err.message);
        return { sent: false, reason: err.message };
    }
}

module.exports = { sendWelcomeEmail };
