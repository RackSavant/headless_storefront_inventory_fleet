"use client";

import { useEffect, useState } from "react";
import { listAvatars, setActiveAvatar, useActiveAvatar } from "@/lib/avatars";

/** Pick which saved photo the 3D mannequin is modelled on (skin tone, hair, face). */
export default function AvatarPicker() {
  const active = useActiveAvatar();
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    listAvatars().then(setIds);
  }, []);
  if (!ids.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">Your avatar</h3>
      <div className="flex items-center gap-2">
        <button onClick={() => setActiveAvatar(null)} className={`h-12 w-12 rounded-full border-2 text-[10px] ${!active ? "border-orange-600" : "border-stone-200"}`} aria-label="Plain mannequin">
          Plain
        </button>
        {ids.map((n) => (
          <button key={n} onClick={() => setActiveAvatar(n)} className={`h-12 w-12 overflow-hidden rounded-full border-2 ${active?.id === n ? "border-orange-600" : "border-stone-200"}`} aria-label={`Use avatar ${n}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/avatars/avatar-${n}-thumb.webp`} alt={`Avatar ${n}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
