/**
 * Application form handler for the Dobson Water Research Group website.
 *
 * The website's application form sends each application here. This script emails it, with the
 * CV and cover letter attached, to RECIPIENT, and sends the applicant a short confirmation.
 * Nothing is stored. Emails are sent from the Google account that deploys this script.
 *
 * Set-up steps are in the website's README, under "Application form".
 */

const RECIPIENT = "bdobson@tcd.ie"; // where applications are sent
const SENDER_NAME = "Dobson Water Research Group"; // shown as the sender's name
const SEND_CONFIRMATION = true; // email applicants to confirm their application arrived
const MAX_FILE_MB = 5; // per file; keep in step with max_file_mb in site.yaml
const MAX_PER_HOUR = 30; // a guard against floods of junk submissions

/** Receives an application from the website. */
function doPost(e) {
  try {
    const sent = JSON.parse(e.postData.contents);
    if (sent.website) return reply_(true); // the hidden "website" field is only filled in by bots
    checkLimits_();
    const app = validate_(sent);
    sendApplication_(app);
    if (SEND_CONFIRMATION) sendConfirmation_(app);
    return reply_(true);
  } catch (err) {
    console.error(err);
    return reply_(false, err.userMessage || "Something went wrong on our side.");
  }
}

/** Opening the web-app address in a browser shows this, which confirms it's running. */
function doGet() {
  return reply_(true, "The application form handler is running.");
}

/**
 * Run this once from the editor (select it, then press Run). It asks for permission to send
 * email, then sends you a sample application and a sample confirmation.
 */
function sendTestApplication() {
  const pdf = (title) =>
    Utilities.newBlob(`<h1>${title}</h1><p>A sample document for testing.</p>`, "text/html")
      .getAs("application/pdf")
      .setName(`Test Applicant - ${title}.pdf`);
  const app = {
    position: "Test position",
    subject: "Test application",
    page: "",
    name: "Test Applicant",
    email: RECIPIENT,
    fields: [
      ["Name", "Test Applicant"],
      ["Email", RECIPIENT],
      ["Highest degree", "BE Civil Engineering, University of Galway, 2.1"],
      ["Referee 1 name", "Dr Example"],
      ["Referee 1 email", "referee@example.com"],
    ],
    files: [pdf("CV"), pdf("Cover letter")],
  };
  sendApplication_(app);
  sendConfirmation_(app);
  console.log(`Sent a test application and confirmation to ${RECIPIENT}.`);
}

function sendApplication_(app) {
  const rows = app.fields
    .map(
      ([label, value]) =>
        `<tr><th align="left" valign="top" style="padding:4px 16px 4px 0;color:#59636e;font-weight:normal">` +
        `${esc_(label)}</th><td style="padding:4px 0">${value ? esc_(value) : "<i>not given</i>"}</td></tr>`,
    )
    .join("");
  const from = app.page ? ` through <a href="${esc_(app.page)}">the website</a>` : "";
  const htmlBody =
    `<p>A new application for <b>${esc_(app.position)}</b> arrived${from}.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows}</table>` +
    `<p>The CV and cover letter are attached. Reply to this email to contact the applicant.</p>`;
  const body =
    `A new application for ${app.position} arrived.\n\n` +
    app.fields.map(([label, value]) => `${label}: ${value || "(not given)"}`).join("\n") +
    "\n\nThe CV and cover letter are attached. Reply to this email to contact the applicant.";
  MailApp.sendEmail({
    to: RECIPIENT,
    subject: `${app.subject}: ${app.name}`,
    body,
    htmlBody,
    attachments: app.files,
    replyTo: app.email,
    name: SENDER_NAME,
  });
}

function sendConfirmation_(app) {
  const body =
    `Dear ${app.name},\n\n` +
    `Thank you for applying for ${app.position}. This is an automatic email to confirm that your ` +
    `application, with your CV and cover letter, has arrived.\n\n` +
    `If you have any questions, reply to this email.\n\n` +
    `${SENDER_NAME}\nTrinity College Dublin`;
  MailApp.sendEmail({
    to: app.email,
    subject: `Application received: ${app.position}`,
    body,
    replyTo: RECIPIENT,
    name: SENDER_NAME,
  });
}

/** Checks what the website sent and turns it into a tidy application. */
function validate_(sent) {
  const name = text_(sent.name, 200);
  const email = text_(sent.email, 254);
  if (!name) fail_("Please give your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_("Please give a valid email address.");

  const fields = (Array.isArray(sent.fields) ? sent.fields : [])
    .slice(0, 40)
    .filter((pair) => Array.isArray(pair))
    .map(([label, value]) => [text_(label, 100), text_(value, 2000)])
    .filter(([label]) => label);

  const files = (Array.isArray(sent.files) ? sent.files : []).slice(0, 4).map((file) => {
    const label = text_(file && file.label, 50) || "A document";
    let bytes;
    try {
      bytes = Utilities.base64Decode(String((file && file.data) || ""));
    } catch (err) {
      fail_(`${label} couldn't be read. Please try attaching it again.`);
    }
    if (bytes.length > MAX_FILE_MB * 1024 * 1024) fail_(`${label} is larger than ${MAX_FILE_MB} MB.`);
    if (!isPdf_(bytes)) fail_(`${label} doesn't look like a PDF.`);
    const filename = text_(file.name, 150).replace(/[\\/:*?"<>|]/g, "").replace(/\.pdf$/i, "") || label;
    return Utilities.newBlob(bytes, "application/pdf", `${filename}.pdf`);
  });
  if (!files.length) fail_("Please attach your CV and cover letter.");

  const page = text_(sent.page, 300);
  return {
    position: text_(sent.position, 150) || "a position",
    subject: text_(sent.subject, 100) || "Application",
    page: /^https:\/\//.test(page) ? page : "",
    name,
    email,
    fields,
    files,
  };
}

/** Stops runaway use: Gmail's daily sending quota, and a cap per hour. */
function checkLimits_() {
  if (MailApp.getRemainingDailyQuota() < 2) {
    fail_(`We can't accept more applications online today. Please email yours to ${RECIPIENT}.`);
  }
  const cache = CacheService.getScriptCache();
  const key = `count-${new Date().toISOString().slice(0, 13)}`; // one counter per hour
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 3600);
  if (count > MAX_PER_HOUR) fail_("We've had a lot of applications in the last hour. Please try again later.");
}

function isPdf_(bytes) {
  return [37, 80, 68, 70, 45].every((code, i) => bytes[i] === code); // "%PDF-"
}

function text_(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function esc_(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fail_(message) {
  const err = new Error(message);
  err.userMessage = message;
  throw err;
}

function reply_(ok, message) {
  return ContentService.createTextOutput(JSON.stringify({ ok, message: message || "" })).setMimeType(
    ContentService.MimeType.JSON,
  );
}
