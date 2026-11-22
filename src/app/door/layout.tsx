import type { Metadata, Viewport } from "next";

// Lets volunteers "Add to Home Screen" so the door app opens full-screen,
// like a real app (spec §3.7, step 4). Light colors only.
export const metadata: Metadata = {
  title: "Door",
  robots: { index: false },
  manifest: "/door.webmanifest",
  appleWebApp: { capable: true, title: "Door", statusBarStyle: "default" },
  icons: { apple: "/door-icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function DoorLayout({ children }: LayoutProps<"/door">) {
  return children;
}
