import Image from "next/image";
import Link from "next/link";
import logo from "../../../../public/logo.png";
import { requireAdmin } from "@/lib/auth";
import { logout } from "./actions";
import { isDemo } from "@/lib/demo";
import { btnSm } from "@/lib/ui";
import { AdminNav } from "./AdminNav";

export const metadata = { robots: { index: false } };

/**
 * Wraps every admin page except /admin/login (which lives outside this
 * "(protected)" folder). Non-admins are redirected to the login page.
 * Uses nearly the full screen width (SPEC §13).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();

  return (
    <>
      {isDemo() && (
        <p className="bg-sky px-4 py-1.5 text-center text-sm font-semibold text-ink" role="note">
          Preview with sample data. Admin is open without login and saving is off until the database is connected.
        </p>
      )}
      <header className="border-b border-edge bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2" aria-label="Admin dashboard">
              <Image src={logo} alt="" width={36} height={36} />
              <span className="font-display hidden font-bold sm:inline">Diatonics Admin</span>
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden md:inline">Logged in as {user.name}</span>
            <Link href="/" className={btnSm}>View site</Link>
            <form action={logout}>
              <button className={btnSm}>Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="w-full flex-1 px-4 py-6 lg:px-8">{children}</main>
    </>
  );
}
