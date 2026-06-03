/**
 * Rich program-card copy for Academy shop (marriageducation.com/courses.html style).
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../data/course-program-details.json');

const CATEGORY_DEFAULTS = {
  courses_entry: {
    featureLabel: "You'll discover:",
    format: 'Self-paced video course',
    accent: 'entry',
  },
  courses_school1: {
    featureLabel: "You'll master:",
    format: 'Online program (video + workbook)',
    accent: 'school1',
  },
  courses_school2: {
    featureLabel: "You'll master:",
    format: 'Practicum + guided exercises',
    accent: 'school2',
  },
  courses_school3: {
    featureLabel: "You'll master:",
    format: 'Workshop + home practices',
    accent: 'school3',
  },
  courses_school4: {
    featureLabel: "You'll understand:",
    format: 'Video + reflection prompts',
    accent: 'school4',
  },
  course_bundles: {
    featureLabel: 'Includes:',
    format: 'Bundle — own all included courses',
    accent: 'bundle',
  },
  diplomas_certifications: {
    featureLabel: 'Complete curriculum:',
    format: 'Diploma program + live sessions',
    accent: 'diploma',
  },
  coaching_live: {
    featureLabel: "You'll receive:",
    format: 'Live sessions',
    accent: 'coaching',
  },
  lifetime_pass: {
    featureLabel: 'Lifetime access to:',
    format: 'One-time payment',
    accent: 'lifetime',
  },
};

let _cache = null;

function loadCourseProgramOverrides() {
  if (_cache) return _cache;
  if (!fs.existsSync(DATA_PATH)) {
    _cache = {};
    return _cache;
  }
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  _cache = raw.products || raw;
  return _cache;
}

function inferDuration(product) {
  const price = Number(product.priceUsd) || 0;
  const name = (product.name || '').toLowerCase();
  if (name.includes('mini') || name.includes('101') || name.includes('intro')) {
    return price <= 30 ? '90 minutes' : '2 hours';
  }
  if (name.includes('13-week') || name.includes('13 week')) return '13 weeks';
  if (name.includes('masterclass') || name.includes('masterclass')) return '12 weeks';
  if (name.includes('diploma')) return name.includes('16') ? '16 weeks' : '14 weeks';
  if (name.includes('facilitator')) return '12 weeks';
  if (name.includes('coaching')) return '60 minutes per session';
  if (name.includes('weekend') || name.includes('labs')) return 'Weekend intensive';
  if (name.includes('lifetime')) return 'Lifetime';
  if (price < 50) return '2–4 hours';
  if (price < 150) return '4–6 weeks';
  if (price < 350) return '6–8 weeks';
  if (price < 600) return '8–10 weeks';
  return '10–12 weeks';
}

function defaultFeatures(product) {
  const lines = [];
  if (product.description) lines.push(product.description);
  const type = product.type || 'course';
  if (type === 'bundle' && product.originalPriceUsd) {
    lines.push('One checkout — own every included program');
  } else if (type === 'course' || type === 'diploma') {
    lines.push('Video lessons and structured exercises');
    lines.push('Progress tracking in SBD Network');
    lines.push('Practice drills you can repeat at home');
  } else if (type === 'coaching') {
    lines.push('Custom plan tailored to your marriage');
    lines.push('Support between sessions');
  } else if (type === 'lifetime') {
    lines.push('All current academy courses');
    lines.push('Future course releases included');
    lines.push('Community membership');
  }
  if (product.schoolId) {
    const schoolLabels = {
      school1: 'School 1 — Teleios personal development',
      school2: 'School 2 — Sexual literacy & conjugal life',
      school3: 'School 3 — Marriage systems & governance',
      school4: 'School 4 — Civilization & family legacy',
    };
    if (schoolLabels[product.schoolId]) lines.push(schoolLabels[product.schoolId]);
  }
  return lines.slice(0, 6);
}

/**
 * @param {object} product — catalog product (before or after normalize)
 */
function isProgramCardProduct(product) {
  if (!product) return false;
  if (product.section === 'academy') return true;
  return (
    product.category === 'diplomas_certifications' ||
    product.category === 'coaching_live' ||
    product.category === 'lifetime_pass'
  );
}

function resolveCourseProgramDetails(product) {
  if (!isProgramCardProduct(product)) return null;

  const overrides = loadCourseProgramOverrides();
  const custom = overrides[product.id] || {};
  const catDefaults = CATEGORY_DEFAULTS[product.category] || CATEGORY_DEFAULTS.courses_entry;

  const features = custom.features && custom.features.length
    ? custom.features
    : defaultFeatures(product);

  return {
    tagline: custom.tagline || catDefaults.tagline || '',
    badge: custom.badge || null,
    badgeStyle: custom.badgeStyle || catDefaults.accent || 'default',
    featureLabel: custom.featureLabel || catDefaults.featureLabel || "You'll learn:",
    features,
    duration: custom.duration || inferDuration(product),
    format: custom.format || catDefaults.format || 'Online course',
    pitch: custom.pitch || product.description || '',
    ctaLabel: custom.ctaLabel || inferCtaLabel(product),
    accent: custom.accent || catDefaults.accent || 'default',
  };
}

function inferCtaLabel(product) {
  if (!product.stripeReady) return 'Coming soon';
  if (product.type === 'bundle') return 'Get Complete Bundle';
  if (product.type === 'coaching') return 'Apply for Coaching';
  if (product.type === 'diploma' || product.type === 'certification') return 'Apply for Diploma';
  if (product.type === 'lifetime') return 'Get Lifetime Access';
  if (product.type === 'event') return 'Join Intensive';
  if (product.recurring) return 'Subscribe';
  return 'Enroll in Course';
}

function enrichProductWithProgramDetails(product) {
  if (!isProgramCardProduct(product)) return product;
  const program = resolveCourseProgramDetails(product);
  if (!program) return product;
  return { ...product, program };
}

module.exports = {
  loadCourseProgramOverrides,
  resolveCourseProgramDetails,
  enrichProductWithProgramDetails,
  inferDuration,
};
