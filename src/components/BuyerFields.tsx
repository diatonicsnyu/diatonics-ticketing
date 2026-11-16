/** Name + email (required) and phone (optional), spec D6. */
export function BuyerFields({ showPhone = true }: { showPhone?: boolean }) {
  const input = "w-full rounded-sm border border-line bg-white px-3 py-2.5";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block font-semibold">Name</span>
        <input name="name" required autoComplete="name" className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">Email</span>
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      {showPhone && (
        <label className="block sm:col-span-2">
          <span className="mb-1 block font-semibold">
            Phone <span className="font-normal text-muted">(optional)</span>
          </span>
          <input name="phone" type="tel" autoComplete="tel" className={`${input} sm:max-w-xs`} />
        </label>
      )}
    </div>
  );
}
