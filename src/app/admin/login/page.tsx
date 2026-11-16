import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { isDemo } from "@/lib/demo";

export const metadata = { title: "Admin login", robots: { index: false } };

const ERRORS: Record<string, string> = {
  "not-admin": "That account isn't the admin. You've been logged out.",
  "link-failed": "That login link didn't work (it may have expired or been opened in a different browser). Request a new one.",
};

export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  if (isDemo()) redirect("/admin"); // demo preview has no login
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="font-display mb-6 text-2xl font-black">Admin login</h1>
      {message && <p className="mb-4 rounded-lg bg-burgundy p-3 text-cream" role="alert">{message}</p>}
      <LoginForm />
    </main>
  );
}
