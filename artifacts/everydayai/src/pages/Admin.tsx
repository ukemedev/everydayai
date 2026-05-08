import AdminLayout from "@/components/AdminLayout";

export default function Admin() {
  console.log("Admin page rendered");

  return (
    <AdminLayout activeItemId="overview">
      <div className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Admin dashboard — content coming soon.
        </p>
      </div>
    </AdminLayout>
  );
}
