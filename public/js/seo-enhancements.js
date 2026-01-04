/**
 * SEO Enhancement Scripts for Marriage Education
 * Structured Data, Schema.org markup, and performance optimizations
 */

// Organization Schema
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Marriage Education",
  "description": "Professional marriage counseling certification and relationship education programs for individuals, couples, and organizations",
  "url": "https://marriageducation.com",
  "logo": "https://marriageducation.com/images/logo.png",
  "sameAs": [
    "https://facebook.com/marriageeducation",
    "https://linkedin.com/company/marriageeducation",
    "https://instagram.com/marriageeducation"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+237-XXX-XXX-XXX",
    "contactType": "Corporate Training Inquiries",
    "email": "corporate@marriageducation.com",
    "areaServed": "CM",
    "availableLanguage": ["English", "French"]
  },
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Douala",
    "addressCountry": "CM"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "150"
  }
};

// Course Schema Generator
function generateCourseSchema(courseData) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "name": courseData.name,
    "description": courseData.description,
    "provider": {
      "@type": "Organization",
      "name": "Marriage Education",
      "sameAs": "https://marriageducation.com"
    },
    "offers": {
      "@type": "Offer",
      "category": "Professional Development",
      "price": courseData.price || "0",
      "priceCurrency": "XAF"
    },
    "hasCourseInstance": {
      "@type": "CourseInstance",
      "courseMode": "online",
      "courseWorkload": courseData.duration || "PT8W"
    }
  };
}

// Book Product Schema
const bookProductSchema = {
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "Strategic Biblical Dating for Dummies",
  "author": {
    "@type": "Person",
    "name": "Dr. Achu Gustave"
  },
  "description": "Comprehensive guide to biblical dating principles and building strong relationships",
  "offers": {
    "@type": "Offer",
    "price": "15000",
    "priceCurrency": "XAF",
    "availability": "https://schema.org/InStock",
    "url": "https://marriageducation.com/shop.html"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "89"
  }
};

// FAQ Schema
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Do you offer corporate training programs?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, we provide customized corporate training programs for organizations looking to enhance employee well-being and relationship skills. Contact us at corporate@marriageducation.com for enterprise packages."
      }
    },
    {
      "@type": "Question",
      "name": "What certifications do you offer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We offer professional marriage counseling certification, relationship coach certification, and ambassador programs. Our certifications are recognized and can be completed online."
      }
    },
    {
      "@type": "Question",
      "name": "How quickly can I start earning as an ambassador?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ambassadors can start earning immediately after approval. Earn 5000 XAF per book sale with instant commission tracking and weekly payouts."
      }
    }
  ]
};

// Breadcrumb Schema
function generateBreadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  };
}

// Insert schemas into page
function injectSchemas() {
  // Organization schema
  const orgScript = document.createElement('script');
  orgScript.type = 'application/ld+json';
  orgScript.text = JSON.stringify(organizationSchema);
  document.head.appendChild(orgScript);

  // Book product schema (for shop page)
  if (window.location.pathname.includes('shop')) {
    const bookScript = document.createElement('script');
    bookScript.type = 'application/ld+json';
    bookScript.text = JSON.stringify(bookProductSchema);
    document.head.appendChild(bookScript);
  }

  // FAQ schema (for homepage and about)
  if (window.location.pathname === '/' || window.location.pathname.includes('index') || window.location.pathname.includes('about')) {
    const faqScript = document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.text = JSON.stringify(faqSchema);
    document.head.appendChild(faqScript);
  }
}

// Performance: Lazy load images
function lazyLoadImages() {
  const images = document.querySelectorAll('img[data-src]');
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
      }
    });
  });

  images.forEach(img => imageObserver.observe(img));
}

// Add canonical URL if not present
function ensureCanonical() {
  if (!document.querySelector('link[rel="canonical"]')) {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = window.location.href.split('?')[0];
    document.head.appendChild(canonical);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  injectSchemas();
  lazyLoadImages();
  ensureCanonical();
});

// Export for external use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    organizationSchema,
    generateCourseSchema,
    generateBreadcrumbSchema,
    bookProductSchema,
    faqSchema
  };
}
