// Helper function to get week start and end dates
// weighDay: 0=Sunday, 1=Monday, ..., 6=Saturday (defaults to Monday)
export const getWeekDates = (date: Date, timezone?: string, weighDay: number = 1) => {
  const d = new Date(date);
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const currentDay = d.getDay();
  
  // Calculate how many days back to get to the start of the week (weighDay)
  // If currentDay is 3 (Wed) and weighDay is 1 (Mon), we need to go back 2 days
  // If currentDay is 0 (Sun) and weighDay is 1 (Mon), we need to go back 6 days
  let daysBack = currentDay - weighDay;
  if (daysBack < 0) {
    daysBack += 7; // Wrap around to previous week
  }
  
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - daysBack);
  
  // Get all days of the week starting from weighDay
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + i);
    weekDates.push(dayDate);
  }
  
  return weekDates;
};

// Helper function to get local date string in timezone
export const getLocalDateString = (date: Date, timezone: string): string => {
  // Use Intl.DateTimeFormat to get the correct date parts in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA format gives us YYYY-MM-DD directly
  return formatter.format(date);
};
