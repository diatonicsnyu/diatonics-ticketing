import { redirect } from "next/navigation";

/** Moved: people and logins now live in Settings (/admin/settings). */
export default function OldExpenseSettings() {
  redirect("/admin/settings");
}
