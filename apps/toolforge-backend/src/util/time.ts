export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return addSeconds(date, minutes * 60);
}

export function addHours(date: Date, hours: number): Date {
  return addSeconds(date, hours * 3600);
}

export function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
