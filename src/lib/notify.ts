import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";

type Recipient = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  notifyEmail: boolean;
  notifySms: boolean;
};

let transport: ReturnType<typeof nodemailer.createTransport> | null | undefined;

function mailer() {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;
  return transport;
}

export function smsEnabled() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

async function sendEmail(to: string, subject: string, text: string) {
  const t = mailer();
  if (!t) {
    console.log(`[email not configured] To: ${to} | ${subject}\n${text}`);
    return;
  }
  await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}

async function sendSms(to: string, body: string) {
  if (!smsEnabled()) return;
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
  });
  if (!res.ok) console.error(`SMS to ${to} failed: ${res.status} ${await res.text()}`);
}

// In-app notification, plus email/SMS according to each person's preferences.
// Delivery failures are logged and never block the action that triggered them.
export async function notify(users: Recipient[], title: string, body: string) {
  if (users.length === 0) return;
  await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body })) });
  const link = process.env.APP_URL || "";
  await Promise.allSettled(
    users.flatMap((u) => {
      const jobs: Promise<void>[] = [];
      if (u.notifyEmail) jobs.push(sendEmail(u.email, `Plover Time: ${title}`, `Hi ${u.firstName},\n\n${body}\n\n${link}`));
      if (u.notifySms && u.phone) jobs.push(sendSms(u.phone, `Plover Time: ${title}. ${body}`));
      return jobs;
    }),
  ).then((results) => {
    for (const r of results) if (r.status === "rejected") console.error("Notification failed:", r.reason);
  });
}

export async function notifyManagers(title: string, body: string) {
  const managers = await db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "MANAGER"] } } });
  await notify(managers, title, body);
}
