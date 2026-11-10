const { readFileSync, appendFileSync } = require('node:fs');
const path = require('node:path');

/** Report factual publication eligibility; the pipeline owns step conditions. */
function releaseStatus(root) {
    const target = JSON.parse(readFileSync(path.join(root, '.release/target.json'), 'utf8'));
    if (typeof target.publishable !== 'boolean') throw new Error('Release target publishable must be a boolean.');
    return { publishable: target.publishable, reason: target.excludedReason ?? '' };
}

module.exports = { releaseStatus };
if (require.main === module) {
    if (process.argv.slice(2).some(argument => argument !== '--github-output')) throw new Error('Usage: npm run release:status -- [--github-output]');
    const status = releaseStatus(path.resolve(__dirname, '..'));
    console.log(JSON.stringify(status));
    if (process.argv.includes('--github-output')) {
        if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
        appendFileSync(process.env.GITHUB_OUTPUT, `publishable=${status.publishable}\n`);
    }
}
