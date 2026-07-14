const plans = [
  { name: "Free", price: "$0", storage: "5 GB" },
  { name: "Pro", price: "$9/mo", storage: "1 TB" },
  { name: "Team", price: "$19/mo", storage: "5 TB" },
];

export default function PricingPage() {
  return (
    <section className="px-6 py-16">
      <h1 className="mb-10 text-center text-3xl font-bold">Pricing</h1>
      <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="rounded-lg border border-zinc-200 p-6 text-center"
          >
            <h2 className="font-semibold">{plan.name}</h2>
            <p className="mt-2 text-2xl font-bold">{plan.price}</p>
            <p className="mt-1 text-sm text-zinc-600">{plan.storage}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
