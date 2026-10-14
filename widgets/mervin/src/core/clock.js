// Wall-clock time for the room (day/night, the wall clock, what Mervin talks about).
// ?now=21:30 pins the start time and ?speed=20 runs time faster, for previews and screenshots.

export function createClock({ now = null, speed = 1 } = {}) {
  const realStart = Date.now();
  let start = realStart;
  if (now) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(now);
    if (match) {
      const d = new Date(realStart);
      d.setHours(Number(match[1]), Number(match[2]), 0, 0);
      start = d.getTime();
    } else if (!Number.isNaN(Date.parse(now))) {
      start = Date.parse(now);
    }
  }
  return {
    speed,
    date() {
      return new Date(start + (Date.now() - realStart) * speed);
    },
  };
}

// 0..24 as a fraction of the day, e.g. 13.5 for half past one.
export function hourOf(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

export function partOfDay(hour) {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
