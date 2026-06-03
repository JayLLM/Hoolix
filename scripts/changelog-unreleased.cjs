const fs = require('node:fs');
const path = require('node:path');

const changelogPath = process.env.CHANGELOG_PATH
  ? path.resolve(process.env.CHANGELOG_PATH)
  : path.resolve(__dirname, '..', 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');
const releaseVersion = process.argv[2]?.replace(/^v/, '');

function getSection(title) {
  const heading = `## [${title}]`;
  const start = changelog.indexOf(heading);
  if (start === -1) return '';

  const afterStart = changelog.indexOf('\n', start);
  if (afterStart === -1) return '';

  const nextSection = changelog.indexOf('\n## [', afterStart + 1);
  return changelog.slice(
    afterStart + 1,
    nextSection === -1 ? changelog.length : nextSection
  ).trim();
}

const unreleased = getSection('Unreleased');
if (unreleased) {
  process.stdout.write(unreleased);
  process.exit(0);
}

if (releaseVersion) {
  const released = getSection(releaseVersion);
  if (released) {
    process.stdout.write(released);
    process.exit(0);
  }
}

if (releaseVersion) {
  throw new Error(
    `CHANGELOG.md must contain a non-empty ## [Unreleased] or ## [${releaseVersion}] section`
  );
}

throw new Error('CHANGELOG.md must contain a non-empty ## [Unreleased] section');
