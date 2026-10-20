"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Wordmark";

export type NavItem = { href: string; label: string; count?: number; section?: string };

export function Nav({ items, userName, role, logoutAction }: {
  items: NavItem[];
  userName: string;
  role: string;
  logoutAction: () => Promise<void>;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const links = (
    <nav className="flex flex-col gap-0.5">
      {items.map((item, i) => (
        <div key={item.href}>
          {item.section && item.section !== items[i - 1]?.section && (
            <p className="mt-5 mb-1 px-3 text-[11px] uppercase tracking-widest text-neutral-500">{item.section}</p>
          )}
          <Link
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
              isActive(item.href) ? "bg-white text-black font-medium" : "text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
            {!!item.count && (
              <span className={`rounded-full px-1.5 text-xs ${isActive(item.href) ? "bg-black text-white" : "bg-white text-black"}`}>
                {item.count}
              </span>
            )}
          </Link>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 pt-4">
      <Link href="/account" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-white/10">
        <span className="block text-sm text-white">{userName}</span>
        <span className="block text-xs text-neutral-400">{role.charAt(0) + role.slice(1).toLowerCase()}</span>
      </Link>
      <form action={logoutAction}>
        <button className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-neutral-400 hover:bg-white/10 hover:text-white">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between bg-black p-4 text-white lg:flex">
        <div>
          <div className="mb-6 px-2"><Wordmark inverted /></div>
          {links}
        </div>
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-black px-4 py-3 text-white lg:hidden">
        <Wordmark inverted />
        <button onClick={() => setOpen(!open)} className="cursor-pointer rounded-lg p-2 hover:bg-white/10" aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[60px] bottom-0 z-20 flex flex-col justify-between overflow-y-auto bg-black p-4 lg:hidden">
          {links}
          {footer}
        </div>
      )}
    </>
  );
}
