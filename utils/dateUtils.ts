// Helper function to get week start and end dates
export const getWeekDates = (date: Date, timezone?: string) => {
  const d = new Date(date);
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const day = d.getDay();
  
  // Calculate Monday (start of week)
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(d.setDate(diff));
  
  // Get all days of the week
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
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
