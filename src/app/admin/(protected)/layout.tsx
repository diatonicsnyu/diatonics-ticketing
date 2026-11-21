import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "./actions";
import { isDemo } from "@/lib/demo";

export const metadata = { robots: { index: false } };

/**
 * Wraps every admin page except /admin/login (which lives outside this
 * "(protected)" folder). Non-admins are redirected to the login page.
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
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="/admin" className="font-display font-bold">Diatonics Admin</Link>
            <Link href="/admin" className="text-link hover:underline">Events</Link>
            <Link href="/admin/expenses" className="text-link hover:underline">Expenses</Link>
            <Link href="/" className="text-link hover:underline">View site</Link>
          </nav>
          <form action={logout} className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{user.email}</span>
            <button className="rounded-sm border border-line px-3 py-1 hover:border-link">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
