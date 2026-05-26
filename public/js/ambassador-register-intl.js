/**
 * Ambassador registration — country, phone, and payment routing.
 * Cameroon: 15,000 FCFA + MoMo. International: $30 USD + Stripe.
 */
(function (global) {
  'use strict';

  var CAMEROON = 'CM';
  var PAYMENT = {
    CM: { currency: 'XAF', amount: 15000, label: '15,000 FCFA', method: 'momo' },
    INTL: { currency: 'USD', amount: 30, label: '$30 USD', method: 'stripe' }
  };

  /** ISO 3166-1 alpha-2 — Cameroon first, then alphabetical */
  var COUNTRIES = [
    { code: 'CM', name: 'Cameroon', dial: '237' },
    { code: 'AE', name: 'United Arab Emirates', dial: '971' },
    { code: 'AU', name: 'Australia', dial: '61' },
    { code: 'BE', name: 'Belgium', dial: '32' },
    { code: 'BJ', name: 'Benin', dial: '229' },
    { code: 'BF', name: 'Burkina Faso', dial: '226' },
    { code: 'CA', name: 'Canada', dial: '1' },
    { code: 'CI', name: "Côte d'Ivoire", dial: '225' },
    { code: 'DE', name: 'Germany', dial: '49' },
    { code: 'EG', name: 'Egypt', dial: '20' },
    { code: 'ES', name: 'Spain', dial: '34' },
    { code: 'FR', name: 'France', dial: '33' },
    { code: 'GB', name: 'United Kingdom', dial: '44' },
    { code: 'GH', name: 'Ghana', dial: '233' },
    { code: 'IN', name: 'India', dial: '91' },
    { code: 'IT', name: 'Italy', dial: '39' },
    { code: 'KE', name: 'Kenya', dial: '254' },
    { code: 'ML', name: 'Mali', dial: '223' },
    { code: 'NL', name: 'Netherlands', dial: '31' },
    { code: 'NG', name: 'Nigeria', dial: '234' },
    { code: 'RW', name: 'Rwanda', dial: '250' },
    { code: 'SA', name: 'Saudi Arabia', dial: '966' },
    { code: 'SN', name: 'Senegal', dial: '221' },
    { code: 'TG', name: 'Togo', dial: '228' },
    { code: 'TZ', name: 'Tanzania', dial: '255' },
    { code: 'UG', name: 'Uganda', dial: '256' },
    { code: 'US', name: 'United States', dial: '1' },
    { code: 'ZA', name: 'South Africa', dial: '27' },
    { code: 'OTHER', name: 'Other country', dial: '' }
  ];

  var CAMEROON_REGIONS = [
    'Adamawa', 'Centre', 'East', 'Far North', 'Littoral',
    'North', 'Northwest', 'South', 'Southwest', 'West'
  ];

  function isCameroon(code) {
    return code === CAMEROON;
  }

  function getCountryMeta(code) {
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].code === code) return COUNTRIES[i];
    }
    return COUNTRIES[0];
  }

  function getPaymentConfig(countryCode) {
    return isCameroon(countryCode) ? PAYMENT.CM : PAYMENT.INTL;
  }

  function digitsOnly(str) {
    return String(str || '').replace(/\D/g, '');
  }

  /** Build E.164 phone from country dial code + local number */
  function buildPhoneE164(countryCode, localNumber) {
    var meta = getCountryMeta(countryCode);
    var local = digitsOnly(localNumber);
    if (!local) return '';

    if (countryCode === 'OTHER') {
      var raw = String(localNumber || '').trim();
      if (raw.charAt(0) === '+') return '+' + digitsOnly(raw);
      return local ? '+' + local : '';
    }

    var dial = digitsOnly(meta.dial);
    if (local.indexOf(dial) === 0 && local.length > dial.length + 4) {
      return '+' + local;
    }
    if (local.charAt(0) === '0') local = local.replace(/^0+/, '');
    return dial ? '+' + dial + local : '+' + local;
  }

  function populateCountrySelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    COUNTRIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.name;
      opt.dataset.dial = c.dial;
      selectEl.appendChild(opt);
    });
    selectEl.value = CAMEROON;
  }

  function updateFormForCountry(countryCode) {
    var cm = isCameroon(countryCode);
    var meta = getCountryMeta(countryCode);
    var pay = getPaymentConfig(countryCode);

    var cmRegion = document.getElementById('regionCameroonGroup');
    var intlRegion = document.getElementById('regionIntlGroup');
    var regionCameroon = document.getElementById('regionCameroon');
    var regionIntl = document.getElementById('regionIntl');
    var cityInput = document.querySelector('input[name="city"]');
    var dialDisplay = document.getElementById('phoneDialDisplay');
    var phoneLocal = document.getElementById('phoneLocal');
    var submitBtn = document.getElementById('submitPaymentBtn');
    var intlPriceNote = document.getElementById('intlPriceNote');

    if (cmRegion) cmRegion.style.display = cm ? '' : 'none';
    if (intlRegion) intlRegion.style.display = cm ? 'none' : '';
    if (regionCameroon) regionCameroon.required = cm;
    if (regionIntl) regionIntl.required = !cm;

    if (cityInput) {
      cityInput.placeholder = cm ? 'e.g., Douala, Yaoundé' : 'e.g., London, Houston, Lagos';
    }

    if (dialDisplay) {
      dialDisplay.textContent = countryCode === 'OTHER' ? '+' : ('+' + (meta.dial || ''));
    }

    if (phoneLocal) {
      phoneLocal.placeholder = cm
        ? '670 00 00 00'
        : (countryCode === 'OTHER' ? '+1 555 123 4567 (include country code)' : 'Phone number without leading 0');
    }

    if (submitBtn) {
      submitBtn.innerHTML = cm
        ? '<i class="fas fa-paper-plane"></i> Submit Application &amp; Pay 15,000 FCFA'
        : '<i class="fas fa-paper-plane"></i> Submit Application &amp; Pay $30 USD';
    }

    if (intlPriceNote) {
      intlPriceNote.style.display = cm ? 'none' : 'block';
    }

    var commitment = document.querySelector('select[name="commitment"]');
    if (commitment) {
      Array.prototype.forEach.call(commitment.options, function (opt) {
        if (!opt.dataset.fcfa) return;
        opt.textContent = cm ? opt.dataset.fcfa : (opt.dataset.usd || opt.dataset.fcfa);
      });
    }
  }

  function bindCountryForm() {
    var countrySelect = document.getElementById('countrySelect');
    if (!countrySelect) return;

    populateCountrySelect(countrySelect);
    updateFormForCountry(countrySelect.value);

    countrySelect.addEventListener('change', function () {
      updateFormForCountry(countrySelect.value);
    });
  }

  function getRegionValue(countryCode) {
    if (isCameroon(countryCode)) {
      var el = document.getElementById('regionCameroon');
      return el ? el.value : '';
    }
    var intl = document.getElementById('regionIntl');
    return intl ? intl.value.trim() : '';
  }

  global.AmbassadorRegisterIntl = {
    CAMEROON: CAMEROON,
    COUNTRIES: COUNTRIES,
    CAMEROON_REGIONS: CAMEROON_REGIONS,
    isCameroon: isCameroon,
    getCountryMeta: getCountryMeta,
    getPaymentConfig: getPaymentConfig,
    buildPhoneE164: buildPhoneE164,
    populateCountrySelect: populateCountrySelect,
    updateFormForCountry: updateFormForCountry,
    bindCountryForm: bindCountryForm,
    getRegionValue: getRegionValue,
    digitsOnly: digitsOnly
  };
})(window);
