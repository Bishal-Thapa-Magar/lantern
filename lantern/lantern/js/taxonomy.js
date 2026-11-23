// Shared vocabulary: categories, formats, price models, certificate states, levels.

export const CATEGORIES = [
  { id: "coding", label: "Coding & web", icon: "code", hint: "Python, JavaScript, web, apps" },
  { id: "data", label: "Data & AI", icon: "sliders", hint: "Data analysis, machine learning, SQL" },
  { id: "it", label: "IT & security", icon: "shield", hint: "Networking, cybersecurity, support" },
  { id: "stem", label: "Math & science", icon: "tool", hint: "Maths, physics, biology, chemistry" },
  { id: "business", label: "Business & money", icon: "globe", hint: "Marketing, finance, starting out" },
  { id: "creative", label: "Design & creative", icon: "star", hint: "Design, 3D, video, writing" },
  { id: "languages", label: "Languages", icon: "audio", hint: "English and other languages" },
  { id: "health", label: "Health & wellbeing", icon: "check", hint: "Public health, first aid, mind" },
  { id: "career", label: "Study & career", icon: "cert", hint: "Learning to learn, jobs, soft skills" },
  { id: "reading", label: "Books & literature", icon: "book", hint: "Classics, audiobooks, open libraries" },
];

export const TYPES = [
  { id: "course", label: "Course", icon: "course" },
  { id: "video", label: "Video", icon: "video" },
  { id: "ebook", label: "Ebook", icon: "book" },
  { id: "pdf", label: "PDF", icon: "pdf" },
  { id: "audio", label: "Audio", icon: "audio" },
  { id: "practice", label: "Practice", icon: "code" },
  { id: "guide", label: "Guide", icon: "info" },
  { id: "library", label: "Library", icon: "folder" },
];

// price: what it costs a learner to use the main material.
export const PRICES = {
  free: { label: "Free", tone: "good", rank: 0, help: "Everything you need is free." },
  audit: { label: "Free to learn", tone: "good", rank: 1, help: "Learning material is free; a certificate costs extra." },
  freemium: { label: "Free + paid", tone: "warn", rank: 2, help: "A free part is available; more is paid." },
  paid: { label: "Paid", tone: "bad", rank: 3, help: "Costs money (look for sales or financial aid)." },
};

// cert: whether finishing gives you proof.
export const CERTS = {
  free: { label: "Free certificate", tone: "good", help: "A certificate of completion at no cost." },
  badge: { label: "Free badge", tone: "good", help: "A free completion badge (not a formal certificate)." },
  paid: { label: "Paid certificate", tone: "warn", help: "A certificate is available for a fee." },
  none: { label: "No certificate", tone: "muted", help: "Learning only; no certificate offered." },
};

export const LEVELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all: "All levels",
};

export const SORTS = [
  { id: "best", label: "Best match" },
  { id: "effective", label: "Most effective" },
  { id: "rated", label: "Highest rated" },
  { id: "price", label: "Cheapest first" },
];

export const STATUSES = [
  { id: "todo", label: "To learn" },
  { id: "doing", label: "Learning now" },
  { id: "done", label: "Completed" },
];

export const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
