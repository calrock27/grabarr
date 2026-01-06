// Comprehensive timezone list organized by region with UTC offsets
// Note: Offsets shown are standard time; some zones observe daylight saving time

export const ALL_TIMEZONES = [
    // Americas
    { value: "America/New_York", label: "New York (ET) UTC-5", region: "Americas" },
    { value: "America/Chicago", label: "Chicago (CT) UTC-6", region: "Americas" },
    { value: "America/Denver", label: "Denver (MT) UTC-7", region: "Americas" },
    { value: "America/Los_Angeles", label: "Los Angeles (PT) UTC-8", region: "Americas" },
    { value: "America/Anchorage", label: "Anchorage (AKT) UTC-9", region: "Americas" },
    { value: "Pacific/Honolulu", label: "Honolulu (HST) UTC-10", region: "Americas" },
    { value: "America/Phoenix", label: "Phoenix (MST) UTC-7", region: "Americas" },
    { value: "America/Toronto", label: "Toronto (ET) UTC-5", region: "Americas" },
    { value: "America/Vancouver", label: "Vancouver (PT) UTC-8", region: "Americas" },
    { value: "America/Mexico_City", label: "Mexico City (CST) UTC-6", region: "Americas" },
    { value: "America/Sao_Paulo", label: "São Paulo (BRT) UTC-3", region: "Americas" },
    { value: "America/Buenos_Aires", label: "Buenos Aires (ART) UTC-3", region: "Americas" },
    { value: "America/Santiago", label: "Santiago (CLT) UTC-4", region: "Americas" },
    { value: "America/Bogota", label: "Bogotá (COT) UTC-5", region: "Americas" },
    { value: "America/Lima", label: "Lima (PET) UTC-5", region: "Americas" },
    // UTC
    { value: "UTC", label: "UTC", region: "UTC" },
    // Europe
    { value: "Europe/London", label: "London (GMT/BST) UTC+0", region: "Europe" },
    { value: "Europe/Dublin", label: "Dublin (IST) UTC+0", region: "Europe" },
    { value: "Europe/Paris", label: "Paris (CET) UTC+1", region: "Europe" },
    { value: "Europe/Berlin", label: "Berlin (CET) UTC+1", region: "Europe" },
    { value: "Europe/Amsterdam", label: "Amsterdam (CET) UTC+1", region: "Europe" },
    { value: "Europe/Brussels", label: "Brussels (CET) UTC+1", region: "Europe" },
    { value: "Europe/Madrid", label: "Madrid (CET) UTC+1", region: "Europe" },
    { value: "Europe/Rome", label: "Rome (CET) UTC+1", region: "Europe" },
    { value: "Europe/Zurich", label: "Zurich (CET) UTC+1", region: "Europe" },
    { value: "Europe/Vienna", label: "Vienna (CET) UTC+1", region: "Europe" },
    { value: "Europe/Stockholm", label: "Stockholm (CET) UTC+1", region: "Europe" },
    { value: "Europe/Oslo", label: "Oslo (CET) UTC+1", region: "Europe" },
    { value: "Europe/Copenhagen", label: "Copenhagen (CET) UTC+1", region: "Europe" },
    { value: "Europe/Helsinki", label: "Helsinki (EET) UTC+2", region: "Europe" },
    { value: "Europe/Warsaw", label: "Warsaw (CET) UTC+1", region: "Europe" },
    { value: "Europe/Prague", label: "Prague (CET) UTC+1", region: "Europe" },
    { value: "Europe/Athens", label: "Athens (EET) UTC+2", region: "Europe" },
    { value: "Europe/Bucharest", label: "Bucharest (EET) UTC+2", region: "Europe" },
    { value: "Europe/Moscow", label: "Moscow (MSK) UTC+3", region: "Europe" },
    { value: "Europe/Istanbul", label: "Istanbul (TRT) UTC+3", region: "Europe" },
    // Asia
    { value: "Asia/Dubai", label: "Dubai (GST) UTC+4", region: "Asia" },
    { value: "Asia/Riyadh", label: "Riyadh (AST) UTC+3", region: "Asia" },
    { value: "Asia/Tehran", label: "Tehran (IRST) UTC+3:30", region: "Asia" },
    { value: "Asia/Karachi", label: "Karachi (PKT) UTC+5", region: "Asia" },
    { value: "Asia/Kolkata", label: "Mumbai/Kolkata (IST) UTC+5:30", region: "Asia" },
    { value: "Asia/Dhaka", label: "Dhaka (BST) UTC+6", region: "Asia" },
    { value: "Asia/Bangkok", label: "Bangkok (ICT) UTC+7", region: "Asia" },
    { value: "Asia/Jakarta", label: "Jakarta (WIB) UTC+7", region: "Asia" },
    { value: "Asia/Singapore", label: "Singapore (SGT) UTC+8", region: "Asia" },
    { value: "Asia/Hong_Kong", label: "Hong Kong (HKT) UTC+8", region: "Asia" },
    { value: "Asia/Shanghai", label: "Shanghai (CST) UTC+8", region: "Asia" },
    { value: "Asia/Taipei", label: "Taipei (CST) UTC+8", region: "Asia" },
    { value: "Asia/Seoul", label: "Seoul (KST) UTC+9", region: "Asia" },
    { value: "Asia/Tokyo", label: "Tokyo (JST) UTC+9", region: "Asia" },
    { value: "Asia/Manila", label: "Manila (PHT) UTC+8", region: "Asia" },
    // Australia & Pacific
    { value: "Australia/Perth", label: "Perth (AWST) UTC+8", region: "Pacific" },
    { value: "Australia/Adelaide", label: "Adelaide (ACST) UTC+9:30", region: "Pacific" },
    { value: "Australia/Brisbane", label: "Brisbane (AEST) UTC+10", region: "Pacific" },
    { value: "Australia/Sydney", label: "Sydney (AEST) UTC+10", region: "Pacific" },
    { value: "Australia/Melbourne", label: "Melbourne (AEST) UTC+10", region: "Pacific" },
    { value: "Pacific/Auckland", label: "Auckland (NZST) UTC+12", region: "Pacific" },
    { value: "Pacific/Fiji", label: "Fiji (FJT) UTC+12", region: "Pacific" },
    // Africa
    { value: "Africa/Cairo", label: "Cairo (EET) UTC+2", region: "Africa" },
    { value: "Africa/Lagos", label: "Lagos (WAT) UTC+1", region: "Africa" },
    { value: "Africa/Johannesburg", label: "Johannesburg (SAST) UTC+2", region: "Africa" },
    { value: "Africa/Nairobi", label: "Nairobi (EAT) UTC+3", region: "Africa" },
    { value: "Africa/Casablanca", label: "Casablanca (WET) UTC+0", region: "Africa" },
] as const

export const TIMEZONE_REGIONS = ["UTC", "Americas", "Europe", "Asia", "Pacific", "Africa"] as const

export type TimezoneValue = typeof ALL_TIMEZONES[number]["value"]
