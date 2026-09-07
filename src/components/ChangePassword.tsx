import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "../services/api";

interface Props {
  onSuccess: () => void;
  onBack?: () => void;
  firstLogin?: boolean;
}

export default function ChangePassword({
  onSuccess,
  onBack,
  firstLogin = false,
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

    if (newPassword.length < 8) {
      alert("Password must contain at least 8 characters.");
      return;
    }

    if (currentPassword === newPassword) {
      alert("New password cannot be the same as the current password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const currentUser = JSON.parse(
  localStorage.getItem("currentUser") || "{}"
);

const endpoint =
  currentUser.userType === "Client"
    ? "/clients/change-password"
    : "/users/change-password";


      const res = await apiFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });


      alert(res.message || "Password updated successfully.");

      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setLoading(false);
    }
  };

  const PasswordInput = (
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
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

        <div className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-center">Change Password</h2>
              <p className="mt-2 text-center text-sm text-gray-500">
                {firstLogin
                  ? "You must change your temporary password before continuing."
                  : "Update your account password to keep your account secure."}
              </p>
            </div>

            <button
  type="button"
  onClick={() => {
    // If onBack is passed, use it; otherwise, go back in history
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  }}
  // REMOVE THE disabled={!onBack} line entirely
  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium !text-black hover:bg-gray-100"
  aria-label="Back"
>
  ← Back
</button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 p-6"
        >
          {PasswordInput(
            "Current Password",
            currentPassword,
            setCurrentPassword,
            showCurrent,
            setShowCurrent
          )}

          {PasswordInput(
            "New Password",
            newPassword,
            setNewPassword,
            showNew,
            setShowNew
          )}

          {PasswordInput(
            "Confirm Password",
            confirmPassword,
            setConfirmPassword,
            showConfirm,
            setShowConfirm
          )}

          <div className="flex justify-end gap-3 pt-2">

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Updating..." : "Change Password"}
            </button>

          </div>
        </form>
      </div>
    </div>
  );
}