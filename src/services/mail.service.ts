import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Create a transporter using environment variables
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // True for 465, false for other ports (like 25, 587, 2525)
  auth: env.SMTP_USER && env.SMTP_PASS ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Core mail dispatcher using Nodemailer transporter
 */
export async function sendMail(options: MailOptions): Promise<boolean> {
  const mailPayload = {
    from: `"${env.FROM_EMAIL.split('@')[0]}" <${env.FROM_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  // Always log reset link to console in development so developers don't need a real SMTP account to test.
  if (env.NODE_ENV === 'development') {
    logger.info(`[MAIL DEV LOG] Sending email to ${options.to}`);
    logger.info(`[MAIL DEV LOG] Subject: ${options.subject}`);
    logger.info(`[MAIL DEV LOG] Text Content: ${options.text}`);
  }

  // If SMTP is not configured, do not fail completely, just log and return success in dev.
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn('[MAIL] SMTP credentials not provided. Email not sent via network (simulated success).');
    return true;
  }

  try {
    const info = await transporter.sendMail(mailPayload);
    logger.info(`[MAIL] Email successfully sent: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error('[MAIL] Failed to send email:', error);
    // In production we throw, in development we swallow to avoid breaking local dev flows
    if (env.NODE_ENV === 'production') {
      throw new Error('Email delivery failed');
    }
    return false;
  }
}

/**
 * Dispatch password reset instructions to a guard, client, or admin user
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  const subject = 'Fortress ASR - Password Reset Request';
  
  const text = `You requested a password reset for your Fortress ASR account. 
Please copy and paste the following link into your browser to reset your password:
${resetUrl}

This link is valid for 15 minutes. If you did not request this, please ignore this email.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Password Reset Request</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 0;
          color: #1e293b;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e2e8f0;
        }
        .header {
          background-color: #032031;
          color: #ffffff;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.025em;
          text-transform: uppercase;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.6;
        }
        .content p {
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 16px;
        }
        .btn-container {
          text-align: center;
          margin: 30px 0;
        }
        .btn {
          display: inline-block;
          background-color: #032031;
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 30px;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          border-radius: 4px;
          letter-spacing: 0.05em;
          transition: background-color 0.2s ease;
        }
        .btn:hover {
          background-color: #000000;
        }
        .link-text {
          word-break: break-all;
          font-size: 12px;
          color: #64748b;
          background-color: #f1f5f9;
          padding: 10px;
          border-radius: 4px;
          border: 1px dashed #cbd5e1;
          margin-top: 25px;
        }
        .footer {
          background-color: #f1f5f9;
          padding: 20px 30px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Fortress ASR Security</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>We received a request to reset the password associated with your email for the Fortress ASR Security system.</p>
          <p>To set up a new password, please click the secure button below:</p>
          <div class="btn-container">
            <a href="${resetUrl}" class="btn">Reset Password</a>
          </div>
          <p><em>Please note that this reset link is highly secure and is only valid for <strong>15 minutes</strong>.</em></p>
          <p>If you did not request this change, please disregard this email, and your account will remain secure.</p>
          <div class="link-text">
            <strong>Having trouble with the button?</strong> Copy and paste this URL into your web browser:<br>
            <a href="${resetUrl}">${resetUrl}</a>
          </div>
        </div>
        <div class="footer">
          &copy; 2026 Fortress ASR Security. All rights reserved.<br>
          This is an automated operational notification. Please do not reply to this email.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendMail({
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Dispatch email verification instructions to a newly registered user
 */
export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  const subject = 'Fortress ASR - Email Verification';
  
  const text = `Thank you for registering an account with Fortress ASR. 
Please copy and paste the following link into your browser to verify your email address:
${verificationUrl}

This link is valid for 24 hours. If you did not create this account, please ignore this email.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Email Verification</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 0;
          color: #1e293b;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e2e8f0;
        }
        .header {
          background-color: #032031;
          color: #ffffff;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.025em;
          text-transform: uppercase;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.6;
        }
        .content p {
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 16px;
        }
        .btn-container {
          text-align: center;
          margin: 30px 0;
        }
        .btn {
          display: inline-block;
          background-color: #032031;
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 30px;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          border-radius: 4px;
          letter-spacing: 0.05em;
          transition: background-color 0.2s ease;
        }
        .btn:hover {
          background-color: #000000;
        }
        .link-text {
          word-break: break-all;
          font-size: 12px;
          color: #64748b;
          background-color: #f1f5f9;
          padding: 10px;
          border-radius: 4px;
          border: 1px dashed #cbd5e1;
          margin-top: 25px;
        }
        .footer {
          background-color: #f1f5f9;
          padding: 20px 30px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Fortress ASR Security</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>Thank you for registering an account with the Fortress ASR Security Operations Management system.</p>
          <p>To verify your email address and activate your account, please click the secure button below:</p>
          <div class="btn-container">
            <a href="${verificationUrl}" class="btn">Verify Email Address</a>
          </div>
          <p><em>Please note that this verification link is valid for <strong>24 hours</strong>.</em></p>
          <p>If you did not register for this account, please disregard this email, and no further action is required.</p>
          <div class="link-text">
            <strong>Having trouble with the button?</strong> Copy and paste this URL into your web browser:<br>
            <a href="${verificationUrl}">${verificationUrl}</a>
          </div>
        </div>
        <div class="footer">
          &copy; 2026 Fortress ASR Security. All rights reserved.<br>
          This is an automated operational notification. Please do not reply to this email.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendMail({
    to: email,
    subject,
    text,
    html,
  });
}

