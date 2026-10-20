"use client";

import Link from "next/link";
import { useState } from "react";
import { saveRule } from "@/actions/me";

const DAYS: [string, string][] = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"]];

export type RuleFormValues = {
  id?: string;
  repeat: string;
  weekdays: string[];
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  note: string;
};

export function RuleForm({ userId, initial, today, cancelHref }: {
  userId: string;
  initial?: RuleFormValues;
  today: string;
  cancelHref: string;
}) {
  const [repeat, setRepeat] = useState(initial?.repeat ?? "NONE");
  const [allDay, setAllDay] = useState(initial?.allDay ?? true);
  const repeating = repeat !== "NONE";

  return (
    <form action={saveRule} className="card space-y-5">
      <h2 className="h2">{initial?.id ? "Edit unavailability" : "Add unavailability"}</h2>
      <input type="hidden" name="userId" value={userId} />
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <fieldset>
        <legend className="label">Repeats</legend>
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
          {[["NONE", "Doesn't repeat"], ["WEEKLY", "Weekly"], ["FORTNIGHTLY", "Fortnightly"]].map(([v, label]) => (
            <label key={v} className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${repeat === v ? "bg-ink text-white" : "text-muted hover:text-foreground"}`}>
              <input type="radio" name="repeat" value={v} checked={repeat === v} onChange={() => setRepeat(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {repeating && (
        <fieldset>
          <legend className="label">On these days</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(([v, label]) => (
              <label key={v} className="cursor-pointer">
                <input type="checkbox" name="weekdays" value={v} defaultChecked={initial?.weekdays.includes(v)} className="peer sr-only" />
                <span className="inline-block rounded-lg border border-border px-3 py-1.5 text-sm peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
                  {label}
                </span>
              </label>
            ))}
          </div>
          {repeat === "FORTNIGHTLY" && (
            <p className="mt-2 text-xs text-muted">Every second week, starting from the week of the start date.</p>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startDate">{repeating ? "Starting from" : "From"}</label>
          <input id="startDate" type="date" name="startDate" required min={initial?.id ? undefined : today}
            defaultValue={initial?.startDate ?? today} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="endDate">{repeating ? "Until (leave blank for ongoing)" : "To (leave blank for one day)"}</label>
          <input id="endDate" type="date" name="endDate" min={today} defaultValue={initial?.endDate ?? ""} className="input" />
        </div>
      </div>

      <fieldset className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-black" />
          All day
        </label>
        {!allDay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="startTime">Unavailable from</label>
              <input id="startTime" type="time" name="startTime" required defaultValue={initial?.startTime || "09:00"} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="endTime">Until</label>
              <input id="endTime" type="time" name="endTime" required defaultValue={initial?.endTime || "17:00"} className="input" />
            </div>
            <p className="text-xs text-muted sm:col-span-2">An end time earlier than the start (e.g. 10:00 pm to 6:00 am) runs overnight into the next morning.</p>
          </div>
        )}
      </fieldset>

      <div>
        <label className="label" htmlFor="note">Reason (optional)</label>
        <input id="note" name="note" maxLength={80} defaultValue={initial?.note ?? ""} className="input" placeholder="e.g. Uni classes, school pickup, holiday" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn">Save</button>
        {initial?.id && <Link href={cancelHref} className="btn-secondary">Cancel</Link>}
      </div>
    </form>
  );
}
