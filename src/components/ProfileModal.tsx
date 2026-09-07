import React, { useState, useEffect } from "react";
import { User, Client } from "../types";
import {
  X,
  UserCircle,
  Mail,
  Building2,
  ShieldCheck,
  Calendar,
  ArrowRight,
  Edit3,
  Globe,
  Phone,
  MapPin,
  CheckCircle2,
} from "lucide-react";

interface Props {
  user?: User | null;
  client?: Client | null;
  onClose: () => void;
  onResetPassword: () => void;
  onUpdateClientProfile?: (updatedClient: {
    companyName: string;
    companyDomain: string;
    contactPerson: string;
    email: string;
    phoneNumber?: string;
    city?: string;
  }) => Promise<void> | void;
}

function formatCreatedDate(createdDate: unknown): string {
  const value = createdDate ?? null;
  if (!value) return "—";

  const d = new Date(value as any);
  const t = d.getTime();
  if (Number.isNaN(t)) return "—";

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function ProfileModal({
  user,
  client,
  onClose,
  onResetPassword,
  onUpdateClientProfile,
}: Props) {
  const isClient = (user && user.role === "Client") || !!client;
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    companyName: "",
    companyDomain: "",
    contactPerson: "",
    email: "",
    phoneNumber: "",
    city: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const currentEmail = client?.email || user?.email || "";
    const derivedDomain =
      client?.companyDomain ||
      (currentEmail ? currentEmail.split("@")[1] : "") ||
      "";

    setEditForm({
      companyName: client?.companyName || user?.fullName || "",
      companyDomain: derivedDomain,
      contactPerson: client?.contactPerson || user?.fullName || "",
      email: currentEmail,
      phoneNumber: client?.phoneNumber || "",
      city: client?.city || "",
    });
    setErrorMessage(null);
  }, [client, user]);

  const created = formatCreatedDate(client?.createdDate || user?.createdDate);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = editForm.companyName.trim();
    const trimmedDomain = editForm.companyDomain.trim().toLowerCase();
    const trimmedContact = editForm.contactPerson.trim();
    const trimmedEmail = editForm.email.trim();
    const trimmedPhone = editForm.phoneNumber.trim();
    const trimmedCity = editForm.city.trim();

    if (!trimmedName) {
      setErrorMessage("Company Name is required.");
      return;
    }

    if (!trimmedDomain) {
      setErrorMessage("Company Domain is required.");
      return;
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-._]*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(trimmedDomain)) {
      setErrorMessage(
        "Please enter a valid company domain (e.g., example.com)."
      );
      return;
    }

    if (!trimmedContact) {
      setErrorMessage("Contact Person is required.");
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage("Email is required.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    const emailDomain = trimmedEmail.split("@")[1]?.toLowerCase() || "";
    if (emailDomain !== trimmedDomain) {
      setErrorMessage(
        "Company email must belong to the registered company domain."
      );
      return;
    }

    try {
      setIsLoading(true);
      if (onUpdateClientProfile) {
        await onUpdateClientProfile({
          companyName: trimmedName,
          companyDomain: trimmedDomain,
          contactPerson: trimmedContact,
          email: trimmedEmail,
          phoneNumber: trimmedPhone,
          city: trimmedCity,
        });
      }
      setIsEditing(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update profile.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
              <UserCircle className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">
                {isClient && isEditing ? "Edit Profile" : "My Profile"}
              </h2>
              <p className="text-xs text-zinc-400">
                {isClient
                  ? isEditing
                    ? "Update your organization contact and domain details."
                    : "Manage your client account credentials and details."
                  : "Manage your account and profile credentials."}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-zinc-100 transition"
            aria-label="Close profile"
          >
            <X className="h-5 w-5 text-zinc-500 hover:text-red-600" />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-medium">
            {errorMessage}
          </div>
        )}

        {/* Body */}
        {isClient && isEditing ? (
          /* Client Edit Form */
          <form onSubmit={handleSave} className="p-6 space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                name="companyName"
                required
                value={editForm.companyName}
                onChange={handleFormChange}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Company Domain *
              </label>
              <input
                type="text"
                name="companyDomain"
                required
                value={editForm.companyDomain}
                onChange={handleFormChange}
                placeholder="e.g. acme.com"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
              />
              <p className="mt-0.5 text-[10px] text-zinc-400">
                Representative email domain must match this domain.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Contact Person Name *
              </label>
              <input
                type="text"
                name="contactPerson"
                required
                value={editForm.contactPerson}
                onChange={handleFormChange}
                placeholder="e.g. John Doe"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Representative Email *
              </label>
              <input
                type="email"
                name="email"
                required
                value={editForm.email}
                onChange={handleFormChange}
                placeholder="e.g. john@acme.com"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  name="phoneNumber"
                  value={editForm.phoneNumber}
                  onChange={handleFormChange}
                  placeholder="e.g. +1 (555) 000-0000"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={editForm.city}
                  onChange={handleFormChange}
                  placeholder="e.g. New York"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Form Footer */}
            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setErrorMessage(null);
                }}
                disabled={isLoading}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg bg-zinc-950 px-5 py-2 font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : isClient ? (
          /* Client View Mode */
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Company Name
                </label>
                <div className="mt-1 flex items-center gap-2 font-semibold text-zinc-900">
                  <Building2 size={16} className="text-indigo-600" />
                  <span>{client?.companyName || user.fullName}</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Company Domain
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Globe size={16} className="text-zinc-500" />
                  <span className="truncate font-mono text-xs">
                    {client?.companyDomain ||
                      (client?.email ? client.email.split("@")[1] : "—")}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Contact Person
                </label>
                <div className="mt-1 flex items-center gap-2 font-semibold text-zinc-900">
                  <UserCircle size={16} className="text-zinc-500" />
                  <span>{client?.contactPerson || user.fullName}</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Representative Email
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Mail size={16} className="text-zinc-500" />
                  <span className="truncate font-mono text-xs">
                    {client?.email || user.email}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Phone Number
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Phone size={16} className="text-zinc-500" />
                  <span>{client?.phoneNumber || "—"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  City
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <MapPin size={16} className="text-zinc-500" />
                  <span>{client?.city || "—"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4 sm:col-span-1">
                <label className="text-xs font-medium text-zinc-500">
                  Status
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      (client?.status || user.status) === "Active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {client?.status || user.status}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4 sm:col-span-1">
                <label className="text-xs font-medium text-zinc-500">
                  Registered
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Calendar size={16} className="text-zinc-500" />
                  {created}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 transition"
              >
                Close
              </button>

              <button
                onClick={onResetPassword}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition shadow-sm"
              >
                <span>Reset Password</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => {
                  setIsEditing(true);
                  setErrorMessage(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition shadow-sm"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>
        ) : (
          /* System User View Mode */
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Full Name
                </label>
                <div className="mt-1 flex items-center gap-2 font-semibold text-zinc-900">
                  {user?.fullName || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Email
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Mail size={16} className="text-zinc-500" />
                  <span className="truncate">{user?.email || "—"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Role
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  {user?.role || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4">
                <label className="text-xs font-medium text-zinc-500">
                  Department
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Building2 size={16} className="text-zinc-500" />
                  {user?.department || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4 sm:col-span-1">
                <label className="text-xs font-medium text-zinc-500">
                  Status
                </label>
                <div className="mt-1 text-zinc-800">{user?.status || "—"}</div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-white p-4 sm:col-span-1">
                <label className="text-xs font-medium text-zinc-500">
                  Created
                </label>
                <div className="mt-1 flex items-center gap-2 text-zinc-800">
                  <Calendar size={16} className="text-zinc-500" />
                  {created}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={onResetPassword}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <span>Reset Password</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={onClose}
                className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

