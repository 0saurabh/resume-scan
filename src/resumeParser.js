/**
 * Resume Parser Utility
 * Extracts structured data from raw resume text
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const NULL = "NULL";

function cleanText(str) {
  return str ? str.trim().replace(/\s+/g, ' ') : NULL;
}

function findByRegex(text, pattern, group = 1) {
  const match = text.match(pattern);
  return match ? cleanText(match[group]) : NULL;
}

// ─── Contact Info ────────────────────────────────────────────────────────────

function extractEmail(text) {
  return findByRegex(text, /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
}

function extractPhone(text) {
  const match = text.match(/(\+?[\d\s\-().]{7,20})/);
  if (!match) return NULL;
  const cleaned = match[1].replace(/[^\d+\-() ]/g, '').trim();
  if (cleaned.replace(/\D/g, '').length < 7) return NULL;
  return cleaned;
}

function extractLinkedIn(text) {
  const match = text.match(/(?:linkedin\.com\/in\/|linkedin\.com\/pub\/)([^\s,|>]+)/i);
  if (match) return `https://linkedin.com/in/${match[1].replace(/[/\\]$/, '')}`;
  const li = text.match(/(linkedin\.com[^\s,|>]*)/i);
  return li ? `https://${li[1]}` : NULL;
}

function extractGitHub(text) {
  const gh = text.match(/(?:github\.com\/)([^\s,|>]+)/i);
  if (gh) return `https://github.com/${gh[1].replace(/[/\\]$/, '')}`;
  const portfolio = text.match(/(?:https?:\/\/)?([a-zA-Z0-9\-]+\.(?:vercel\.app|netlify\.app|dev|io|com)\/[^\s,|>]*)/i);
  if (portfolio) return portfolio[0].startsWith('http') ? portfolio[0] : `https://${portfolio[0]}`;
  return NULL;
}

function extractName(text) {
  // Try to get name from the very first non-empty, non-contact line
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (
      !line.match(/@|http|linkedin|github|phone|\d{4}/i) &&
      !line.match(/resume|curriculum vitae|cv\b/i) &&
      line.split(' ').length <= 5 &&
      line.length > 2 &&
      line.match(/^[A-Z][a-zA-Z\s.\-']+$/)
    ) {
      return cleanText(line);
    }
  }
  return NULL;
}

function extractLocation(text) {
  const loc = text.match(
    /(?:location|address|city)?[:\s]*([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z]{2,})?(?:\s*\d{5,6})?)/
  );
  // Simple city, state pattern
  const cityState = text.match(/\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*,\s*(?:[A-Z]{2}|[A-Z][a-zA-Z]+))\b/);
  if (cityState) return cleanText(cityState[1]);
  if (loc) return cleanText(loc[1]);
  return NULL;
}

// ─── Section Splitting ───────────────────────────────────────────────────────

const SECTION_PATTERNS = {
  education:       /education|academic|qualification|degree|schooling/i,
  experience:      /experience|employment|work history|professional background|internship|career/i,
  skills:          /skill|technology|tech stack|competenc|proficien|expertise/i,
  projects:        /project|portfolio|personal work|side project/i,
  certifications:  /certif|license|credential|award|accomplish/i,
  summary:         /summary|objective|profile|about me|overview/i,
};

function splitSections(text) {
  const lines = text.split('\n');
  const sections = {};
  let currentSection = 'header';
  let buffer = [];

  const flushBuffer = () => {
    if (!sections[currentSection]) sections[currentSection] = [];
    sections[currentSection].push(...buffer);
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect section headings: short line, often ALL CAPS or title case, not a sentence
    const isSectionHeading =
      trimmed.length > 2 &&
      trimmed.length < 60 &&
      !trimmed.includes('.') &&
      (trimmed === trimmed.toUpperCase() ||
        Object.values(SECTION_PATTERNS).some(p => p.test(trimmed)));

    if (isSectionHeading) {
      flushBuffer();
      const matched = Object.entries(SECTION_PATTERNS).find(([, p]) => p.test(trimmed));
      currentSection = matched ? matched[0] : trimmed.toLowerCase().replace(/\s+/g, '_');
    } else {
      buffer.push(trimmed);
    }
  }
  flushBuffer();
  return sections;
}

// ─── Education ───────────────────────────────────────────────────────────────

const DEGREE_KEYWORDS = [
  'bachelor', 'master', 'phd', 'doctorate', 'associate', 'diploma',
  'b.sc', 'b.s.', 'm.sc', 'm.s.', 'b.tech', 'm.tech', 'b.e.', 'm.e.',
  'b.com', 'm.com', 'b.a.', 'm.a.', 'mba', 'bba', 'b.eng', 'm.eng',
  'high school', 'secondary', 'intermediate', '10th', '12th', 'hsc', 'ssc',
];

function parseEducation(lines) {
  const results = [];
  const text = lines.join('\n');
  const blocks = text.split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const blockText = block.toLowerCase();

    if (!DEGREE_KEYWORDS.some(kw => blockText.includes(kw))) continue;

    let degree = NULL, field = NULL, institution = NULL, startYear = NULL, endYear = NULL;

    for (const line of blockLines) {
      // Degree line
      const degMatch = line.match(
        /\b(bachelor(?:'s)?(?:\s+of\s+\w+)?|master(?:'s)?(?:\s+of\s+\w+)?|phd|doctorate|associate(?:'s)?|diploma|b\.?(?:sc|tech|e|com|a|eng)|m\.?(?:sc|tech|e|com|a|eng|ba)|mba|bba|high school|secondary|intermediate|10th|12th|hsc|ssc)/i
      );
      if (degMatch && degree === NULL) {
        degree = cleanText(degMatch[0]);
        // Try to extract field from same line
        const afterDeg = line.slice(line.toLowerCase().indexOf(degMatch[0].toLowerCase()) + degMatch[0].length);
        const fieldMatch = afterDeg.match(/(?:in|of)?\s*([A-Z][a-zA-Z\s&,]+)/);
        if (fieldMatch) field = cleanText(fieldMatch[1].replace(/,.*$/, ''));
      }

      // Dates
      const yearRange = line.match(/(\d{4})\s*[-–—]\s*(\d{4}|present|current)/i);
      if (yearRange) {
        startYear = yearRange[1];
        endYear = yearRange[2].toLowerCase() === 'present' || yearRange[2].toLowerCase() === 'current'
          ? 'Present' : yearRange[2];
      } else {
        const singleYear = line.match(/(?:graduated?|class of|batch)?\s*(\d{4})/i);
        if (singleYear && endYear === NULL) endYear = singleYear[1];
      }

      // Institution: lines with University, College, Institute, School
      if (/university|college|institute|school|academy/i.test(line) && institution === NULL) {
        institution = cleanText(line.split(/,|\||–|—|-/)[0]);
      }
    }

    results.push({
      Degree: degree,
      Field_of_Study: field,
      Institution: institution,
      Start_Year: startYear || NULL,
      End_Year: endYear || NULL,
    });
  }

  return results;
}

// ─── Work Experience ─────────────────────────────────────────────────────────

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeDate(str) {
  if (!str) return NULL;
  if (/present|current|now/i.test(str)) return 'Present';
  const m = str.match(/([a-z]+)\s*\.?\s*(\d{4})/i);
  if (m) {
    const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
    return month ? `${m[2]}-${month}` : m[2];
  }
  const ym = str.match(/(\d{4})[\/\-](\d{1,2})/);
  if (ym) return `${ym[1]}-${String(ym[2]).padStart(2, '0')}`;
  const yOnly = str.match(/(\d{4})/);
  return yOnly ? yOnly[1] : NULL;
}

function parseExperience(lines) {
  const results = [];
  const text = lines.join('\n');
  // Split by blank lines or by detecting new job entries
  const blocks = text.split(/\n{2,}/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (blockLines.length < 2) continue;

    let jobTitle = NULL, company = NULL, startDate = NULL, endDate = NULL;
    const responsibilities = [];

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i];

      // Date range detection
      const dateRange = line.match(
        /([A-Za-z]+\.?\s+\d{4}|\d{4}[\/\-]\d{1,2}|\d{4})\s*[-–—]\s*([A-Za-z]+\.?\s+\d{4}|present|current|\d{4}[\/\-]\d{1,2}|\d{4})/i
      );
      if (dateRange) {
        startDate = normalizeDate(dateRange[1]);
        endDate = normalizeDate(dateRange[2]);
        continue;
      }

      // Bullet responsibilities
      if (/^[•\-\*▪▸►]/.test(line)) {
        const resp = line.replace(/^[•\-\*▪▸►]\s*/, '').trim();
        if (resp.length > 5) responsibilities.push(resp);
        continue;
      }

      // First meaningful lines → title + company
      if (i === 0 || (jobTitle === NULL && line.split(' ').length <= 6)) {
        jobTitle = cleanText(line);
      } else if (i === 1 || (company === NULL && line.split(' ').length <= 6)) {
        company = cleanText(line);
      } else if (line.length > 10) {
        responsibilities.push(line);
      }
    }

    if (jobTitle !== NULL) {
      results.push({
        Job_Title: jobTitle,
        Company: company,
        Start_Date: startDate,
        End_Date: endDate,
        Responsibilities: responsibilities.length ? responsibilities : [NULL],
      });
    }
  }

  return results;
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function parseSkills(lines) {
  const raw = lines.join(' ');
  // Split on common delimiters
  const items = raw
    .split(/[,|•\n\t\/]+/)
    .map(s => s.trim().replace(/^[-\*▪▸►:]+\s*/, ''))
    .filter(s => s.length > 1 && s.length < 50)
    .map(s => s.replace(/\b(experienced in|proficient in|knowledge of|familiar with|expert in)\b/gi, '').trim())
    .filter(Boolean);

  // Deduplicate (case-insensitive)
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

// ─── Projects ────────────────────────────────────────────────────────────────

function parseProjects(lines) {
  const results = [];
  const text = lines.join('\n');
  const blocks = text.split(/\n{2,}/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!blockLines.length) continue;

    const name = cleanText(blockLines[0]);
    const descLines = blockLines.slice(1);
    const description = descLines
      .filter(l => !/^tech|^stack|^built with|^tools/i.test(l) && !/^[•\-]?technologies/i.test(l))
      .join(' ').trim() || NULL;

    // Extract technologies from the block
    let technologies = [];
    for (const line of blockLines) {
      if (/tech|stack|built with|tool|language|framework/i.test(line)) {
        const techStr = line.replace(/.*?[:–—]\s*/, '');
        technologies = techStr.split(/[,|\/]+/).map(t => t.trim()).filter(t => t.length > 1);
      }
    }

    results.push({
      Project_Name: name,
      Description: description,
      Technologies: technologies.length ? technologies : [NULL],
    });
  }
  return results;
}

// ─── Certifications ──────────────────────────────────────────────────────────

function parseCertifications(lines) {
  return lines
    .map(l => l.replace(/^[-•*▪▸►\d.]+\s*/, '').trim())
    .filter(l => l.length > 3);
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseResume(text) {
  if (!text || !text.trim()) {
    return {
      Full_Name: NULL, Email: NULL, Phone_Number: NULL, Location: NULL,
      LinkedIn: NULL, GitHub_or_Portfolio: NULL,
      Education: [], Work_Experience: [], Skills: [], Projects: [], Certifications: [],
    };
  }

  const sections = splitSections(text);

  // Header section for contact extraction
  const headerText = (sections.header || []).join('\n') + '\n' + text.slice(0, 800);

  return {
    Full_Name: extractName(text),
    Email: extractEmail(text),
    Phone_Number: extractPhone(headerText),
    Location: extractLocation(headerText),
    LinkedIn: extractLinkedIn(text),
    GitHub_or_Portfolio: extractGitHub(text),
    Education: parseEducation(sections.education || []),
    Work_Experience: parseExperience(sections.experience || []),
    Skills: parseSkills(sections.skills || []),
    Projects: parseProjects(sections.projects || []),
    Certifications: parseCertifications(sections.certifications || []),
  };
}
