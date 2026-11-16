import { notFound } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { DoorDemo } from "./DoorDemo";

export const metadata = { title: "Door scanner (demo)", robots: { index: false } };

export default function DoorDemoPage() {
  if (!isDemo()) notFound();
  return <DoorDemo />;
}
