// Guess Lantern categories for live results from their title/subjects. Deliberately simple and transparent.

const RULES = [
  ["coding", /\b(program(ming|mer)?|python|javascript|java\b|c\+\+|rust|golang|html|css|react|node\.?js|web develop|software|coding|algorithm|git\b|linux)\b/i],
  ["data", /\b(data (science|analy)|machine learning|deep learning|artificial intelligence|\bai\b|statistics|sql|database|neural)\b/i],
  ["it", /\b(network(ing)?|cyber ?security|computer security|information technology|\bit support|cloud computing|hardware)\b/i],
  ["stem", /\b(mathematic|algebra|geometry|calculus|physics|chemistry|biology|astronomy|engineering|science|geology|ecology)\b/i],
  ["business", /\b(business|marketing|account(ing|ancy)|finance|econom|entrepreneur|management|invest|sales|startup)\b/i],
  ["creative", /\b(design|drawing|painting|photograph|music|animation|film|video editing|writing|graphic|illustrat|3d)\b/i],
  ["languages", /\b(language|grammar|vocabulary|english|spanish|french|german|hindi|arabic|chinese|japanese|linguistic|pronunciation)\b/i],
  ["health", /\b(health|medic|nursing|nutrition|first aid|psycholog|mental|fitness|anatomy|disease)\b/i],
  ["career", /\b(career|job|interview|resume|study skills|productivity|leadership|communication|learning)\b/i],
  ["reading", /\b(fiction|novel|poetry|poems|literature|stories|classic|essays|drama|philosophy|history|biography)\b/i],
];

export function inferCats(...texts) {
  const hay = texts.filter(Boolean).join(" ").slice(0, 800);
  const out = [];
  for (const [id, re] of RULES) if (re.test(hay)) out.push(id);
  return out.slice(0, 3);
}
