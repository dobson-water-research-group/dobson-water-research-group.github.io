# Dobson Water Research Group website

The group's website, built with [Eleventy](https://www.11ty.dev/) and published on GitHub Pages.
Content lives in plain YAML and Markdown files, so most updates are a small edit made straight
on GitHub. Every push to `main` rebuilds and redeploys the site, and it also rebuilds once a
day to pick up new publications and close adverts whose deadline has passed.

## Common edits

| To... | Edit |
| --- | --- |
| Add or update a person | `src/_data/people.yaml` (photos go in `src/assets/img/people/`) |
| Add a project | `src/_data/projects.yaml` |
| Add software | `src/_data/software.yaml` (each tool gets its own page and a sidebar link) |
| Change the home page text or research themes | `src/index.md` |
| Advertise a position | copy `src/opportunities/example-phd.md` (or `wisgov-phd.md`, which has an application form) to a new file in that folder |
| Hide or add a publication | `src/_data/publications_settings.yaml` |
| Change the group name, contact details or mailing list | `src/_data/site.yaml` |
| Change the menu | `src/_data/navigation.yaml` |

### Publications

Publications aren't edited by hand. At build time the site asks [OpenAlex](https://openalex.org),
a free and open index of research, for everything linked to each person's ORCID iD in
`people.yaml`. It merges duplicates (e.g. a preprint and its published version) and bolds group
members in author lists. Journal articles, chapters, conference papers, theses and reports show by
default. Visitors can switch on preprints, conference abstracts and datasets. Only work from
`since_year` onwards (currently 2020) is listed.

Google Scholar has no API and blocks automated requests, so it can't be used as the source.
Each person's Scholar profile is linked from their card instead, if you add their `scholar` id.

If something is missing or wrongly attributed, add it under `extra:` or `hide:` in
`publications_settings.yaml`. The best long-term fix is to make sure everyone's ORCID record
is up to date.

### Adverts

Each file in `src/opportunities/` is one advert. It's listed under "Open positions" until its
`deadline` passes, then moves to "Past positions". Set `status: closed` to close it early.
`draft: true` keeps it off the live site while you work on it. A deadline can be a date
(`2027-03-31`, open until the end of that day) or a date and time (`2026-12-16T12:00:00Z`).

### Application form

Set `application_form: true` on an advert to add an application form. Applicants fill in their
details and two referees, attach a CV and cover letter (PDFs up to 5 MB each), check everything in a
preview, then send. The form closes itself at the deadline. `src/opportunities/wisgov-phd.md` is a
working example.

Applications are emailed to `applications.email` in `site.yaml` through
[FormSubmit](https://formsubmit.co), a free form-to-email service that needs no account. The CV and
cover letter arrive as attachments named after the applicant. Applicants also get an automatic
confirmation email. Nothing is stored on the website.

Before the first real application, activate the form once:

1. Once the site is live, submit a test application yourself.
2. FormSubmit emails `applications.email` an activation link. Click it. Until then, applications
   aren't forwarded.
3. Optional: FormSubmit then gives you a random string to use in place of your email address in
   `form_action`, so the address isn't in the page source.

FormSubmit limits each submission to about 10 MB. If you'd rather use another service (for example
Basin or Formspree's paid plans, which store uploads), change `form_action` in `site.yaml`.

## Previewing locally

You need [Node.js](https://nodejs.org/) 20 or later.

```bash
npm install
npm start
```

Then open http://localhost:8080. Pages reload as you edit. Drafts are shown locally but not published.

## Publishing on GitHub Pages (first time)

1. Create the repository and push this folder to its `main` branch.
   - For an address like `https://<name>.github.io/`, the repository must be called `<name>.github.io`, where `<name>` is your username or an organisation.
   - Any other repository name works too. The site then lives at `https://<name>.github.io/<repo>/`, and links adjust automatically.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The **Build and deploy site** workflow runs on the next push. You can also start it by hand from the **Actions** tab.
4. Update `url` in `src/_data/site.yaml` to the final address.

### Custom domain (optional)

Add a file `src/CNAME` containing just the domain (e.g. `water.example.org`), set the same domain
under **Settings → Pages**, and point a DNS `CNAME` record at `<name>.github.io`.

### Mailing list

The Opportunities page can show a mailing-list sign-up form. It stays hidden until it's configured. To switch it on, create a list with a newsletter service that has an embeddable form
and double opt-in (e.g. MailerLite, Buttondown or Mailchimp). Then copy the form's `action` URL and
email field name into `mailing_list` in `site.yaml`.

### Good to know

- GitHub pauses scheduled workflows in repositories with no activity for 60 days. If that happens,
  re-enable the workflow from the Actions tab, or push any change.
- If OpenAlex is unreachable during a build on GitHub, the build fails and the live site keeps
  its previous version, rather than publishing an empty publications list.
- For higher OpenAlex rate limits, add a free API key as a repository secret named
  `OPENALEX_API_KEY`.
