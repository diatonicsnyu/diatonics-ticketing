import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { EventForm } from "../../EventForm";
import { saveEvent } from "../../actions";
import { btnSm } from "@/lib/ui";

export const metadata = { title: "Admin · New event" };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/admin" className={btnSm}>← Dashboard</Link>
      <h1 className="font-display mb-6 mt-2 text-3xl font-black">New event</h1>
      <EventForm
        action={saveEvent.bind(null, null)}
        submitLabel="Create event"
        defaults={{
          name: "",
          venue: "",
          description: "",
          starts_at: "",
          doors_at: "",
          sales_close_minutes: "30", // spec D7: sales close 30 min after start
          capacity: "",
          door_price: "",
          status: "draft",
          image_url: null,
          ticket_types: [{ id: "", name: "General", price: "5", limit: "" }], // spec D2
        }}
      />
    </>
  );
}
