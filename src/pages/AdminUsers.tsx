import React, { useEffect, useState } from "react";
import { Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { DepartmentDatalist, DepartmentSearchInput } from "../components/DepartmentSearchInput";

const ROLE_OPTIONS = [
  { value: "admin", label: "ადმინისტრატორი" },
  { value: "doctor", label: "ექიმი" },
  { value: "junior_doctor", label: "უმცროსი ექიმი" },
  { value: "nurse", label: "ექთანი" },
];

const getRoleLabel = (role: string) => {
  if (role === "admin") return "ადმინისტრატორი";
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
};

const defaultForm = {
  name: "",
  username: "",
  password: "",
  phone: "",
  department: "",
  role: "doctor",
};

const DEPARTMENT_LIST_ID = "admin-department-options";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [createForm, setCreateForm] = useState(defaultForm);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data.map((user: any) => ({ ...user, nextPassword: "" })));
    } catch (_) {
      toast.error("მომხმარებლების წამოღება ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await api.post("/users", createForm);
      toast.success("მომხმარებელი დაემატა");
      setCreateForm(defaultForm);
      fetchUsers();
    } catch (_) {
      toast.error("მომხმარებლის შექმნა ვერ მოხერხდა");
    } finally {
      setCreating(false);
    }
  };

  const handleFieldChange = (userId: string, field: string, value: string) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, [field]: value } : user))
    );
  };

  const handleSaveUser = async (user: any) => {
    setSavingId(String(user.id || ""));
    try {
      const payload: Record<string, any> = {
        name: String(user.name || "").trim(),
        username: String(user.username || "").trim(),
        phone: String(user.phone || "").trim(),
        department: String(user.department || "").trim(),
        role: String(user.role || "").trim(),
      };

      if (String(user.nextPassword || "").trim()) {
        payload.password = String(user.nextPassword || "").trim();
      }

      await api.put(`/users/${user.id}`, payload);
      toast.success(payload.password ? "მომხმარებელი და პაროლი განახლდა" : "მომხმარებელი განახლდა");
      fetchUsers();
    } catch (_) {
      toast.error("მომხმარებლის განახლება ვერ მოხერხდა");
    } finally {
      setSavingId("");
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!window.confirm(`ნამდვილად გსურთ მომხმარებლის "${user.name}" წაშლა?`)) {
      return;
    }

    setDeletingId(String(user.id || ""));
    try {
      await api.delete(`/users/${user.id}`);
      toast.success("მომხმარებელი წაიშალა");
      fetchUsers();
    } catch (_) {
      toast.error("მომხმარებლის წაშლა ვერ მოხერხდა");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">მომხმარებლების მართვა</h1>
        <p className="text-slate-500">შექმენი, შეცვალე, წაშალე და ერთჯერადი პაროლი დააყენე. პირველი შესვლისას პაროლის შეცვლა სავალდებულოა.</p>
      </div>

      <form onSubmit={handleCreateUser} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Users size={20} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">ახალი მომხმარებელი</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <input
            required
            type="text"
            placeholder="სახელი და გვარი"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
          />
          <input
            required
            type="text"
            placeholder="მომხმარებელი"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            value={createForm.username}
            onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
          />
          <input
            required
            type="text"
            placeholder="ერთჯერადი პაროლი"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            value={createForm.password}
            onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
          />
          <input
            required
            type="text"
            placeholder="ტელეფონი"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            value={createForm.phone}
            onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
          />
          <DepartmentSearchInput
            required
            listId={DEPARTMENT_LIST_ID}
            placeholder="განყოფილება"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            value={createForm.department}
            onChange={(event) => setCreateForm({ ...createForm, department: event.target.value })}
          />
          <select
            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={createForm.role}
            onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md disabled:opacity-50"
          >
            <Plus size={18} />
            <span>{creating ? "მიმდინარეობს..." : "დამატება"}</span>
          </button>
        </div>
      </form>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">მომხმარებლების სია</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">სახელი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">მომხმარებელი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ტელეფონი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">განყოფილება</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">როლი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ახალი პაროლი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">მოქმედება</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">იტვირთება...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">მომხმარებლები არ მოიძებნა</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      {user.isStatic ? (
                        <>
                          <div className="font-semibold text-slate-900">{user.name}</div>
                          <div className="text-xs text-slate-500">სისტემური ანგარიში</div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            value={user.name}
                            onChange={(event) => handleFieldChange(user.id, "name", event.target.value)}
                          />
                          {user.mustChangePassword ? (
                            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                              ელოდება პაროლის შეცვლას
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.isStatic ? (
                        <span className="font-mono text-slate-700">{user.username}</span>
                      ) : (
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-blue-500"
                          value={user.username}
                          onChange={(event) => handleFieldChange(user.id, "username", event.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.isStatic ? (
                        <span className="text-slate-500">{user.phone || "-"}</span>
                      ) : (
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                          value={user.phone || ""}
                          onChange={(event) => handleFieldChange(user.id, "phone", event.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.isStatic ? (
                        <span className="text-slate-500">{user.department || "-"}</span>
                      ) : (
                        <DepartmentSearchInput
                          listId={DEPARTMENT_LIST_ID}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                          value={user.department || ""}
                          onChange={(event) => handleFieldChange(user.id, "department", event.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.isStatic ? (
                        <span className="inline-flex px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-medium">
                          {getRoleLabel(user.role)}
                        </span>
                      ) : (
                        <select
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                          value={user.role}
                          onChange={(event) => handleFieldChange(user.id, "role", event.target.value)}
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.isStatic ? (
                        <span className="text-slate-400">რედაქტირება გამორთულია</span>
                      ) : (
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="ერთჯერადი პაროლი"
                          value={user.nextPassword || ""}
                          onChange={(event) => handleFieldChange(user.id, "nextPassword", event.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {!user.isStatic && (
                          <button
                            onClick={() => handleSaveUser(user)}
                            disabled={savingId === user.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Save size={16} />
                            <span>{savingId === user.id ? "ინახება..." : "შენახვა"}</span>
                          </button>
                        )}
                        {!user.isStatic && (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deletingId === user.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                            <span>{deletingId === user.id ? "იშლება..." : "წაშლა"}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DepartmentDatalist id={DEPARTMENT_LIST_ID} />
      </div>
    </div>
  );
}
