import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Client } from "../types";

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddClient: (
    client: Omit<Client, "id" | "createdDate" | "updatedDate">
  ) => void;
}

export default function CreateClientModal({
  isOpen,
  onClose,
  onAddClient,
}: CreateClientModalProps) {
  const [newClientName, setNewClientName] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientCompanyDomain, setNewClientCompanyDomain] = useState("");
  const [newClientStatus, setNewClientStatus] = useState<Client["status"]>("Active");

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientContact || !newClientEmail) {
      alert("Company Name, Contact Person, and Email are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(newClientEmail)) {
      alert("Please enter a valid email address.");
      return;
    }

    onAddClient({
      companyName: newClientName,
      companyDomain: newClientCompanyDomain || newClientEmail.split("@")[1] || "",
      contactPerson: newClientContact,
      email: newClientEmail,
      phoneNumber: newClientPhone || "+1 (555) 000-0000",
      status: newClientStatus,
    });
    // Reset Form
    setNewClientName("");
    setNewClientContact("");
    setNewClientEmail("");
    setNewClientCompanyDomain("");
    setNewClientPhone("");
    setNewClientStatus("Active");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-16 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 mb-8">
        <h3 className="text-base font-bold text-zinc-900 font-sans">
          Provision New Client Profile
        </h3>
        <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100 leading-normal">
          Create a secure corporate portal account. Logins are generated synchronously.
        </p>

        <form onSubmit={handleCreateClient} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Company Name *</label>
            <input
              type="text"
              required
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="e.g. InnoTech Ltd"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Contact Person Name *</label>
            <input
              type="text"
              required
              value={newClientContact}
              onChange={(e) => setNewClientContact(e.target.value)}
              placeholder="e.g. Johnathan Finch"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Representative Email *</label>
            <input
              type="email"
              required
              value={newClientEmail}
              onChange={(e) => setNewClientEmail(e.target.value)}
              placeholder="e.g. finch@innotech.com"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Company Domain</label>
            <input
              type="text"
              name="companyDomain"
              value={newClientCompanyDomain}
              onChange={(e) => setNewClientCompanyDomain(e.target.value)}
              placeholder="e.g. innotech.com"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={newClientPhone}
              onChange={(e) => setNewClientPhone(e.target.value)}
              placeholder="e.g. +1 (555) 441-2299"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Active Status Setup</label>
            <select
              value={newClientStatus}
              onChange={(e) => setNewClientStatus(e.target.value as Client["status"])}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 focus:outline-none"
            >
              <option value="Active">Active</option>
              <option value="Pending Activation">Pending Activation</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650 transition hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-zinc-950 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
            >
              Provision Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}