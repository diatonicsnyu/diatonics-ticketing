import Image from "next/image";
import { redirect } from "next/navigation";
import logo from "../../../../public/logo.png";
import { LoginForm } from "./LoginForm";
import { isDemo } from "@/lib/demo";
import { getAdminSession } from "@/lib/auth";

export const metadata = { title: "Admin login", robots: { index: false } };

export default async function AdminLoginPage() {
  if (isDemo()) redirect("/admin"); // demo preview has no login
  if (await getAdminSession()) redirect("/admin"); // already logged in

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <Image src={logo} alt="" width={72} height={72} className="mx-auto" priority />
      <h1 className="font-display mb-6 mt-3 text-center text-3xl font-black">Admin login</h1>
      <div className="rounded-sm border border-edge bg-panel p-5">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-sm text-muted">Forgot your PIN? Another e-board member can give you a new one in Settings.</p>
    </main>
  );
}
