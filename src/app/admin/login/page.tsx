import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { isDemo } from "@/lib/demo";
import { getAdminSession } from "@/lib/auth";

export const metadata = { title: "Admin login", robots: { index: false } };

export default async function AdminLoginPage() {
  if (isDemo()) redirect("/admin"); // demo preview has no login
  if (await getAdminSession()) redirect("/admin"); // already logged in

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="font-display mb-6 text-3xl font-black">Admin login</h1>
      <LoginForm />
    </main>
  );
}
