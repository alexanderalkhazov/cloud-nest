import Link from "next/link";

const items = [
  { id: "1", name: "Photos", type: "folder" },
  { id: "2", name: "Resume.pdf", type: "file" },
  { id: "3", name: "Projects", type: "folder" },
];

export default function MyDrivePage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">My Drive</h1>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3">
            {item.type === "folder" ? (
              <Link href={`/dashboard/folder/${item.id}`}>{item.name}</Link>
            ) : (
              <span>{item.name}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
