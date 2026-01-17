# MARRIAGE FOUNDATION ACCESS TRANSFORMATION
## Complete Build Tracking Document

**Status**: In Progress  
**Start Date**: January 17, 2026  
**Total Tasks**: 60  
**Completed**: 3/60

---

## ✅ COMPLETED TASKS

### Phase 1: Foundation (3/10 complete)
- [x] **Task 1**: Firestore schema documented
- [x] **Task 2**: New collections (school_progress, advocacy_training, deployment_log) documented
- [x] **Task 3**: Data migration script created (`scripts/firestore-migration.js`)
- [x] **Task 4**: Firebase security rules updated for new collections
- [ ] **Task 5**: Run migration script (PENDING: Requires firebase-service-account.json)

---

## 🚧 IN PROGRESS

### Phase 2: Landing Page Transformation (0/6 started)

**File**: `ambassador-register.html`

#### Required Changes:

1. **META TAGS** (Lines 5-7)
```html
<!-- OLD -->
<title>Become an Ambassador - Earn 90,000 FCFA | Marriage Education</title>
<meta name="description" content="Join 500 ambassadors selling 60 books each...">

<!-- NEW -->
<title>Become a Marriage Literacy Ambassador - Women's Track | Marriage Education</title>
<meta name="description" content="Deploy Marriage Foundation Access to families and communities. Earn the CRLA credential through the Marriage Foundation School.">
```

2. **HERO SECTION** (Lines 27-60)
```html
<!-- OLD -->
<h1>Become an Ambassador</h1>
<p class="subtitle">Earn 90,000 FCFA selling 60 books</p>

<!-- NEW -->
<h1>Become a Marriage Literacy Ambassador</h1>
<p class="subtitle">Women's Track</p>
<p class="sub-subtitle">Help individuals, families, and communities access foundational marriage literacy that strengthens identity, relationships, and long-term stability.</p>
<p class="mission">You are not selling a book. You are deploying Marriage Foundation Access.</p>
```

3. **OPPORTUNITY BADGE** (Lines 51-61)
```html
<!-- OLD -->
<div class="opportunity-badge">🔥 500 Spots Only • Up to 90,000 FCFA</div>

<!-- NEW -->
<div class="opportunity-badge">🎓 Entry: 15,000 FCFA | Earn CRLA through Marriage Foundation School</div>
<div class="scholarship-badge">⭐ First 500: Full $247 scholarship into The Teleios Blueprint</div>
```

4. **NEW SECTION: What is Marriage Foundation Access?**
```html
<section class="access-explanation">
  <div class="container">
    <h2>📦 What is Marriage Foundation Access?</h2>
    <p class="lead">When someone supports this initiative, they are not buying a book.</p>
    
    <div class="access-grid">
      <div class="access-card">
        <h3>They Receive:</h3>
        <ul>
          <li>✔ Foundational marriage literacy</li>
          <li>✔ Personal & relational maturity framework</li>
          <li>✔ Guidance on identity, covenant, emotional fluency</li>
          <li>✔ A structured learning guide (Sex By Design for Dummies)</li>
          <li>✔ Support for families, youth, and communities</li>
        </ul>
      </div>
      
      <div class="value-card">
        <h3>The Truth:</h3>
        <p><strong>The book is the learning guide.</strong></p>
        <p><strong>The value is the literacy it restores.</strong></p>
      </div>
    </div>
  </div>
</section>
```

5. **NEW SECTION: Why People Say Yes (Empathy)**
```html
<section class="empathy-section">
  <div class="container">
    <h2>💡 Why People Say Yes</h2>
    <p class="lead">People don't buy content. They buy relief, protection, and hope.</p>
    
    <div class="empathy-grid">
      <div class="empathy-card">
        <i class="fas fa-shield-alt"></i>
        <h3>Protection</h3>
        <p>They worry about marriage failure</p>
      </div>
      
      <div class="empathy-card">
        <i class="fas fa-child"></i>
        <h3>For Their Children</h3>
        <p>They worry about the next generation</p>
      </div>
      
      <div class="empathy-card">
        <i class="fas fa-compass"></i>
        <h3>Moral Clarity</h3>
        <p>They see confusion everywhere</p>
      </div>
      
      <div class="empathy-card">
        <i class="fas fa-hands-helping"></i>
        <h3>Help Others</h3>
        <p>They want to support families</p>
      </div>
    </div>
    
    <p class="emphasis">This is not commerce. This is protection and preservation.</p>
  </div>
</section>
```

6. **NEW SECTION: Access Deployment Options**
```html
<section class="deployment-options">
  <div class="container">
    <h2>🌍 How Ambassadors Operate</h2>
    <p class="lead">As a Marriage Literacy Ambassador, you help people access marriage literacy through three simple pathways:</p>
    
    <div class="options-grid">
      <div class="option-card">
        <div class="option-number">1</div>
        <h3>Personal Access</h3>
        <p>For individuals seeking literacy for themselves</p>
        <div class="price">15,000 FCFA per unit</div>
      </div>
      
      <div class="option-card">
        <div class="option-number">2</div>
        <h3>Sponsored Access</h3>
        <p>Support youth, couples, or families who need it</p>
        <div class="price">15,000 FCFA per unit</div>
      </div>
      
      <div class="option-card">
        <div class="option-number">3</div>
        <h3>Community Support</h3>
        <p>Bulk sponsorship for groups and institutions</p>
        <div class="price">Scaled pricing</div>
      </div>
    </div>
    
    <p class="conversion-note">Each access unit deployed = one conversion credit for you.</p>
  </div>
</section>
```

7. **NEW SECTION: CRLA Credential Showcase**
```html
<section class="crla-section">
  <div class="container">
    <h2>🏅 Earn Your Credential</h2>
    
    <div class="credential-showcase">
      <div class="credential-badge">
        <div class="badge-icon">CRLA</div>
        <h3>Certified Relationship Literacy Advocate</h3>
        <p>Earned through the Marriage Foundation School</p>
      </div>
      
      <div class="credential-benefits">
        <h3>What You Gain:</h3>
        <ul>
          <li>✅ Professional credential displayed on certificates and IDs</li>
          <li>✅ Used internally, professionally, and institutionally</li>
          <li>✅ Bridge to advanced programs (Paid Advocacy, Regional Director, Advanced Counselor)</li>
          <li>✅ Founding Cohort recognition</li>
        </ul>
      </div>
    </div>
  </div>
</section>
```

8. **NEW SECTION: Progression Pathway**
```html
<section class="progression-section">
  <div class="container">
    <h2>📈 Your Progression Path</h2>
    
    <div class="progression-visual">
      <div class="progress-step">
        <div class="step-number">1</div>
        <h3>Marriage Literacy Ambassador</h3>
        <p>Entry: Deploy access, help families</p>
      </div>
      
      <div class="progress-arrow">→</div>
      
      <div class="progress-step">
        <div class="step-number">2</div>
        <h3>Marriage Foundation School</h3>
        <p>6 weeks: Learn framework & philosophy</p>
      </div>
      
      <div class="progress-arrow">→</div>
      
      <div class="progress-step">
        <div class="step-number">3</div>
        <h3>CRLA Credential</h3>
        <p>Earned: Professional recognition</p>
      </div>
      
      <div class="progress-arrow">→</div>
      
      <div class="progress-step">
        <div class="step-number">4</div>
        <h3>Advanced Tracks</h3>
        <p>Paid Advocacy | Regional Director | Advanced Counselor</p>
      </div>
    </div>
  </div>
</section>
```

9. **CALCULATOR SECTION - TRANSFORM**
```html
<!-- OLD HEADING -->
<h2>💰 Calculate Your Earnings</h2>

<!-- NEW HEADING -->
<h2>📊 Calculate Your Impact & Earnings</h2>

<!-- OLD METRIC LABELS -->
<label>Books to sell:</label>
<span class="calc-label">Commission per book: 1,500 FCFA</span>
<div id="calcResult">Total Commission: 0 FCFA</div>

<!-- NEW METRIC LABELS -->
<label>Access units to deploy:</label>
<span class="calc-label">Advocacy earning per unit: 1,500 FCFA</span>
<div id="calcResult">Total Advocacy Earnings: 0 FCFA</div>
```

10. **REGISTRATION FORM - UPDATE MESSAGING**
```html
<!-- After form, before submit -->
<div class="form-note">
  <p><strong>You are enrolling as a Marriage Literacy Ambassador (Women's Track)</strong></p>
  <p>Upon completion of the Marriage Foundation School, you earn the professional credential of <strong>Certified Relationship Literacy Advocate (CRLA)</strong>.</p>
</div>
```

---

## 📋 PHASE 2 CSS TO ADD

```css
/* New Section Styles */
.access-explanation,
.empathy-section,
.deployment-options,
.crla-section,
.progression-section {
    padding: 4rem 2rem;
}

.access-explanation { background: #f8f9fa; }
.empathy-section { background: white; }
.deployment-options { background: #f8f9fa; }
.crla-section { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
.progression-section { background: white; }

.access-grid,
.empathy-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
}

.access-card,
.value-card,
.empathy-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}

.options-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    margin-top: 2rem;
}

.option-card {
    background: white;
    padding: 2.5rem 2rem;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    transition: transform 0.3s;
}

.option-card:hover {
    transform: translateY(-8px);
}

.option-number {
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0 auto 1rem;
}

.credential-showcase {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    margin-top: 2rem;
}

.credential-badge {
    background: rgba(255,255,255,0.1);
    padding: 3rem;
    border-radius: 12px;
    text-align: center;
}

.badge-icon {
    width: 120px;
    height: 120px;
    background: white;
    color: #667eea;
    font-size: 2rem;
    font-weight: bold;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
}

.progression-visual {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 3rem;
    flex-wrap: wrap;
}

.progress-step {
    background: #f8f9fa;
    padding: 2rem;
    border-radius: 12px;
    text-align: center;
    flex: 1;
    min-width: 200px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}

.step-number {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    margin: 0 auto 1rem;
}

.progress-arrow {
    font-size: 2rem;
    color: #00b894;
    font-weight: bold;
    padding: 0 1rem;
}

.sub-subtitle {
    font-size: 1.1rem;
    color: #2d3436;
    margin-bottom: 1rem;
    line-height: 1.6;
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
}

.mission {
    font-size: 1.3rem;
    color: #00b894;
    font-weight: 600;
    margin-top: 1.5rem;
}

.scholarship-badge {
    display: inline-block;
    background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
    color: white;
    padding: 0.75rem 2rem;
    border-radius: 50px;
    font-size: 1.1rem;
    font-weight: 600;
    margin-left: 1rem;
    box-shadow: 0 4px 15px rgba(243,156,18,0.3);
}

.conversion-note {
    text-align: center;
    font-size: 1.2rem;
    color: #2d3436;
    font-weight: 600;
    margin-top: 2rem;
}

.emphasis {
    text-align: center;
    font-size: 1.4rem;
    font-weight: 600;
    color: #00b894;
    margin-top: 2rem;
}

.form-note {
    background: #e3f2fd;
    padding: 1.5rem;
    border-left: 4px solid #2196f3;
    margin-top: 2rem;
    border-radius: 4px;
}

.form-note p {
    margin: 0.5rem 0;
    color: #1565c0;
}

.form-note strong {
    color: #0d47a1;
}

@media (max-width: 768px) {
    .options-grid {
        grid-template-columns: 1fr;
    }
    
    .credential-showcase {
        grid-template-columns: 1fr;
    }
    
    .progression-visual {
        flex-direction: column;
    }
    
    .progress-arrow {
        transform: rotate(90deg);
        margin: 1rem 0;
    }
}
```

---

## 📝 NEXT STEPS

1. Apply all landing page changes to `ambassador-register.html`
2. Test registration flow with new messaging
3. Move to Phase 3: Dashboard transformation
4. Continue through all 60 tasks systematically

**Question for User**: Ready to proceed with Phase 2 landing page transformation (Tasks 5-10)? This will completely transform the registration page with the new framework. Shall I implement all changes now?
