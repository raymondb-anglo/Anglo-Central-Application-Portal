/**
 * Email Service — OTP delivery via nodemailer
 */
import nodemailer from 'nodemailer';

let transporter = null;

/**
 * Get or create the email transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[EMAIL] SMTP not configured — email sending disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false, // STARTTLS
    auth: { user, pass }
  });

  return transporter;
}

/**
 * Send a one-time password code to a user's email
 * @param {string} to - Recipient email
 * @param {string} code - The OTP code
 * @returns {Promise<boolean>} true if sent
 */
export async function sendOTP(to, code) {
  const t = getTransporter();
  if (!t) {
    console.error('[EMAIL] Cannot send OTP — SMTP not configured.');
    return false;
  }

  try {
    await t.sendMail({
      from: `"Anglo Application Portal" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Your Anglo Portal Sign-In Code',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #06b6d4); border-radius: 12px; line-height: 48px; color: white; font-size: 20px; font-weight: bold;">A</div>
          </div>
          <h2 style="text-align: center; color: #1e293b; margin: 0 0 8px;">Sign-In Code</h2>
          <p style="text-align: center; color: #64748b; margin: 0 0 24px; font-size: 14px;">Use the code below to sign in to the Anglo Application Portal</p>
          <div style="text-align: center; background: #1e293b; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #f1f5f9; font-family: monospace;">${code}</span>
          </div>
          <p style="text-align: center; color: #94a3b8; font-size: 13px; margin: 0;">
            This code expires in <strong>5 minutes</strong>.<br>
            If you didn't request this code, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
          <p style="text-align: center; color: #94a3b8; font-size: 11px; margin: 0;">
            Anglo Singapore International School — Application Portal
          </p>
        </div>
      `
    });

    console.log(`[EMAIL] OTP sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send OTP:', err.message);
    return false;
  }
}

/**
 * Send a password reset link to a user's email
 * @param {string} to - Recipient email
 * @param {string} resetUrl - The full password reset URL with token
 * @returns {Promise<boolean>} true if sent
 */
export async function sendPasswordReset(to, resetUrl) {
  const t = getTransporter();
  if (!t) {
    console.error('[EMAIL] Cannot send password reset — SMTP not configured.');
    return false;
  }

  try {
    await t.sendMail({
      from: `"Anglo Application Portal" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Reset Your Anglo Portal Password',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #ef4444); border-radius: 12px; line-height: 48px; color: white; font-size: 20px; font-weight: bold;">A</div>
          </div>
          <h2 style="text-align: center; color: #1e293b; margin: 0 0 8px;">Password Reset</h2>
          <p style="text-align: center; color: #64748b; margin: 0 0 24px; font-size: 14px;">You requested a password reset for your Anglo Application Portal account.</p>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #06b6d4); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px;">Reset Password</a>
          </div>
          <p style="text-align: center; color: #64748b; font-size: 13px; margin: 0 0 16px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="text-align: center; word-break: break-all; color: #6366f1; font-size: 12px; margin: 0 0 24px; background: #e2e8f0; padding: 12px; border-radius: 6px;">
            ${resetUrl}
          </p>
          <p style="text-align: center; color: #94a3b8; font-size: 13px; margin: 0;">
            This link expires in <strong>15 minutes</strong>.<br>
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
          <p style="text-align: center; color: #94a3b8; font-size: 11px; margin: 0;">
            Anglo Singapore International School — Application Portal
          </p>
        </div>
      `
    });

    console.log(`[EMAIL] Password reset link sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send password reset:', err.message);
    return false;
  }
}

/**
 * Generate a 6-digit OTP code
 * @returns {string}
 */
export function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
