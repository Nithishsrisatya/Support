import { useState } from "react";
import { X, Eye, EyeOff, Lock } from "lucide-react";
import { apiFetch } from "../services/api";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ResetPasswordModal({
  onClose,
  onSuccess,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword.trim()) {
      alert("Please enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      alert("Password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      alert("New password cannot be the same as the current password.");
      return;
    }

    try {
      setLoading(true);

      const res = await apiFetch("/users/change-password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      alert(res.message || "Password updated successfully.");

      onSuccess();
    } catch (err: any) {
      alert(err.message || "Password update failed.");
    } finally {
      setLoading(false);
    }
  };

  const PasswordField = (
    label: string,
    value: string,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    show: boolean,
    setShow: React.Dispatch<React.SetStateAction<boolean>>
  ) => (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <div className="relative">
        <Lock className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />

        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-10 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-3 text-gray-500"
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/50 backdrop-blur-sm">

      <div className="flex min-h-screen items-center justify-center p-4">

        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">

            <h2 className="text-xl font-bold text-gray-900">
              Reset Password
            </h2>

            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-gray-100"
            >
              <X size={22} />
            </button>

          </div>

          {/* Body */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 p-6"
          >

            {PasswordField(
              "Current Password",
              currentPassword,
              setCurrentPassword,
              showCurrent,
              setShowCurrent
            )}

            {PasswordField(
              "New Password",
              newPassword,
              setNewPassword,
              showNew,
              setShowNew
            )}

            {PasswordField(
              "Confirm Password",
              confirmPassword,
              setConfirmPassword,
              showConfirm,
              setShowConfirm
            )}

            <div className="flex justify-end gap-3 pt-2">

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-5 py-2.5 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>

            </div>

          </form>

        </div>

      </div>

    </div>
  );
}