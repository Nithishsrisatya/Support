import { UserCircle, LogOut } from "lucide-react";

interface ProfileDropdownProps {
  onProfile: () => void;
  onLogout: () => void;
}

export default function ProfileDropdown({
  onProfile,
  onLogout,
}: ProfileDropdownProps) {
  return (
    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 bg-white shadow-xl z-50 overflow-hidden">
      <button
        onClick={onProfile}
        className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-zinc-100 transition"
      >
        <UserCircle className="h-5 w-5 text-zinc-600" />
        <span>My Profile</span>
      </button>

      <div className="border-t border-zinc-100" />

      <button
        onClick={onLogout}
        className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition"
      >
        <LogOut className="h-5 w-5" />
        <span>Logout</span>
      </button>
    </div>
  );
}
