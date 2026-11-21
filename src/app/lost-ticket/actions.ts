"use server";

import { headers } from "next/headers";
import { isDemo } from "@/lib/demo";
import { resendTicketsForEmail } from "@/lib/ticket-mail";

export type LostTicketState = { done?: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Lost your ticket?" (spec §3.5): re-sends tickets to the email on file. Never shows them on screen. */
export async function requestResend(_prev: LostTicketState, formData: FormData): Promise<LostTicketState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email) || email.length > 254) return { error: "Please enter a valid email address." };
  if (isDemo()) return { error: "Re-sending works once the site is connected to the database." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "";

  try {
    switch (await resendTicketsForEmail(email, ip)) {
      case "sent_or_no_match":
        // Same answer whether or not they have tickets, so nobody can check who bought what.
        return {
          done: `If ${email} has tickets for an upcoming show, we just sent them there. Check your inbox (and spam) in a minute or two.`,
        };
      case "too_many":
        return { error: "You've asked for a re-send 3 times in the last hour. Please wait an hour and try again." };
      case "daily_limit":
        return {
          error: "We've hit our email limit for today. Please try again tomorrow, or give your name at the door and we'll look you up.",
        };
      default:
        return { error: "Something went wrong. Please try again in a few minutes." };
    }
  } catch (err) {
    console.error("Lost-ticket re-send failed:", err);
    return { error: "Something went wrong. Please try again in a few minutes." };
  }
}
