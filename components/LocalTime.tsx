"use client";

export function LocalTime({
  date,
  className,
}: {
  date: string | Date;
  className?: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  const label = d.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return <span className={className}>{label}</span>;
}