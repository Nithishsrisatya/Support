import React, { useState, useEffect } from "react";
import { Client, ClientStatus } from "../types";

interface EditClientModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<any> | void;
}

export default function EditClientModal({
  client,
  isOpen,
  onClose,
  onUpdateClient,
}: EditClientModalProps) {
  const [editClientForm, setEditClientForm] = useState({
    companyName: "",
    companyDomain: "",
    contactPerson: "",
    email: "",
    phoneNumber: "",
    city: "",
    status: "Active" as ClientStatus,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (client) {
      setEditClientForm({
        companyName: client.companyName || "",
        companyDomain: client.companyDomain || (client.email ? client.email.split("@")[1] : "") || "",
        contactPerson: client.contactPerson || "",
        email: client.email || "",
        phoneNumber: client.phoneNumber || "",
        city: client.city || "",
        status: client.status || "Active",
      });
      setErrorMessage(null);
    }
  }, [client]);

  const handleEditClientFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditClientForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    setErrorMessage(null);

    const trimmedName = editClientForm.companyName.trim();
    const trimmedDomain = editClientForm.companyDomain.trim().toLowerCase();
    const trimmedContact = editClientForm.contactPerson.trim();
    const trimmedEmail = editClientForm.email.trim();
    const trimmedPhone = editClientForm.phoneNumber.trim();
    const trimmedCity = editClientForm.city.trim();

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
      setErrorMessage("Please enter a valid company domain (e.g., example.com).");
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

    const updates: Partial<Client> = {
      companyName: trimmedName,
      companyDomain: trimmedDomain,
      contactPerson: trimmedContact,
      email: trimmedEmail,
      phoneNumber: trimmedPhone,
      city: trimmedCity,
      status: editClientForm.status,
    };

    try {
      setIsLoading(true);
      await onUpdateClient(client.id, updates);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update client.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-16 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 mb-8">
        <h3 className="text-base font-bold text-zinc-900 font-sans">
          Edit Client Profile
        </h3>
        <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100 leading-normal">
          Update the details for {client.companyName}.
        </p>

        {errorMessage && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleUpdateClientSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Company Name *</label>
            <input
              type="text"
              name="companyName"
              required
              value={editClientForm.companyName}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Company Domain *</label>
            <input
              type="text"
              name="companyDomain"
              required
              placeholder="e.g. acme.com"
              value={editClientForm.companyDomain}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Contact Person Name *</label>
            <input
              type="text"
              name="contactPerson"
              required
              value={editClientForm.contactPerson}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Representative Email *</label>
            <input
              type="email"
              name="email"
              required
              value={editClientForm.email}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Phone Number</label>
            <input
              type="text"
              name="phoneNumber"
              value={editClientForm.phoneNumber}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">City</label>
            <input
              type="text"
              name="city"
              placeholder="e.g. New York"
              value={editClientForm.city}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Status</label>
            <select
              name="status"
              value={editClientForm.status}
              onChange={handleEditClientFormChange}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 focus:outline-none"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Disabled">Disabled</option>
              <option value="Suspended">Suspended</option>
              <option value="Pending Activation">Pending Activation</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-zinc-950 px-4 py-2 font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}