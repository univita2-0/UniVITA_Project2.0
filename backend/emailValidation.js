const dns = require('dns').promises;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Disposable / temporary email providers — never allow for staff accounts.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com','20minutemail.com','33mail.com','guerrillamail.com','guerrillamail.net',
  'guerrillamail.org','mailinator.com','mailinator.net','tempmail.com','temp-mail.org',
  'throwawaymail.com','trashmail.com','yopmail.com','yopmail.fr','sharklasers.com',
  'getnada.com','mintemail.com','mohmal.com','maildrop.cc','mailnesia.com','discard.email',
  'spambox.us','fakeinbox.com','tempinbox.com','dispostable.com','emailondeck.com',
  'burnermail.io','mailcatch.com','spamfree24.org','tempr.email','mailsac.com',
  'harakirimail.com','incognitomail.org','jetable.org','mailmetrash.com','mytrashmail.com',
  'nospamfor.us','spamgourmet.com','tempail.com','throwawayemailaddress.com','trbvm.com',
  'wegwerfmail.de','wegwerfmail.net','wegwerfmail.org','anonbox.net','tempsky.com',
  'tmpmail.net','tmpmail.org'
]);

// Placeholder local-parts that indicate a dummy account.
const FAKE_LOCAL_PARTS = new Set([
  'test','tests','testing','tester','dummy','fake','sample','demo','admin',
  'administrator','user','username','guest','anonymous','asdf','asdfasdf','qwerty',
  'abc','abcd','xyz','123','1234','12345','temp','temporary','trial','noreply',
  'no-reply','donotreply','example','placeholder','null','undefined'
]);

// RFC 2606 / common test domains — never valid for real accounts.
const RESERVED_DOMAINS = new Set([
  'example.com','example.net','example.org','test.com','test.net','test.org',
  'invalid.com','localhost','local','domain.com'
]);

// Accepted TLDs (add more if you expand the org). Multi-part like com.ph is handled below.
const ALLOWED_TLDS = new Set([
  'com','net','org','edu','gov','mil','int','io','co','info','biz','me','app','dev','ai',
  'us','uk','ca','au','jp','cn','sg','hk','kr','de','fr','es','it','nl','se','no','fi',
  'dk','ie','nz','za','in','id','my','th','vn',
  'ph','com.ph','net.ph','org.ph','edu.ph','gov.ph'
]);

const normalize = (email) => String(email || '').trim().toLowerCase();
const getLocalPart = (email) => {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(0, at);
};
const getDomain = (email) => {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
};

// Handle multi-part TLDs like com.ph, edu.ph
const extractTld = (domain) => {
  const parts = domain.split('.');
  if (parts.length < 2) return '';
  if (parts.length >= 3) {
    const three = parts.slice(-2).join('.');
    if (ALLOWED_TLDS.has(three)) return three;
  }
  return parts[parts.length - 1];
};

const validateFormat = (email) => {
  if (!email) return 'Email is required.';
  if (!EMAIL_REGEX.test(email)) return 'Please enter a valid email address.';
  if (email.length > 254) return 'Email address is too long.';
  const local = getLocalPart(email);
  const domain = getDomain(email);
  if (local.length < 3) return 'Email local-part is too short.';
  if (local.length > 64) return 'Email local-part is too long.';
  if (domain.length < 4) return 'Email domain is too short.';
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return 'Email domain is malformed.';
  }
  return null;
};

const validateAgainstBlocklists = (email) => {
  const local = getLocalPart(email);
  const domain = getDomain(email);

  if (RESERVED_DOMAINS.has(domain)) return `"${domain}" is a reserved test domain.`;
  if (DISPOSABLE_DOMAINS.has(domain)) return 'Disposable/temporary email domains are not allowed.';
  if (FAKE_LOCAL_PARTS.has(local)) return `"${local}" is a placeholder local-part.`;
  if (/^\d+$/.test(local)) return 'Email local-part cannot be purely numeric.';
  if (/^(.)\1+$/.test(local)) return 'Email local-part looks like a placeholder.';

  const tld = extractTld(domain);
  if (!tld || !ALLOWED_TLDS.has(tld)) return `"${tld || domain}" is not an accepted top-level domain.`;

  return null;
};

// DNS: does this domain actually exist and accept mail?
const validateDns = async (email) => {
  const domain = getDomain(email);
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) return null;
  } catch (_) {
    // No MX — try A/AAAA (some small orgs host mail on the A record).
    try {
      const a = await dns.resolve4(domain);
      if (a && a.length > 0) return null;
    } catch (__) {
      try {
        const aaaa = await dns.resolve6(domain);
        if (aaaa && aaaa.length > 0) return null;
      } catch (___) {
        return `The email domain "${domain}" does not exist or cannot receive mail.`;
      }
    }
  }
  return null;
};

/**
 * Full validation. Returns { valid, reason? }.
 * opts.checkDns defaults to true. Pass { checkDns: false } to skip DNS.
 */
const validateEmailForAccount = async (email, opts = {}) => {
  const normalized = normalize(email);

  const fmt = validateFormat(normalized);
  if (fmt) return { valid: false, reason: fmt };

  const block = validateAgainstBlocklists(normalized);
  if (block) return { valid: false, reason: block };

  if (opts.checkDns !== false) {
    const dnsErr = await validateDns(normalized);
    if (dnsErr) return { valid: false, reason: dnsErr };
  }

  return { valid: true };
};

module.exports = { validateEmailForAccount, normalize };