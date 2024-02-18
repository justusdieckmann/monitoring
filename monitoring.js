import fetch from 'node-fetch';
import config from './config.json' with { type: 'json' };

async function isLearnwebOnline() {
    const request = await fetch('https://www.uni-muenster.de/LearnWeb/learnweb2/');
    return [request.ok, request.status];
}

async function isUniMuensterOnline() {
    const request = await fetch('https://www.uni-muenster.de/');
    return request.ok;
}

const QUICK_INTERVAL = 60 * 1000;
const NORMAL_INTERVAL = 5 * 60 * 1000;

const QUICKCHECKS_AFTER_FAILURE = 9;
const SUCCESSFUL_ATTEMPTS_FOR_NORMALITY = 10;

export let checks = [];

export let status = 'ok';
let remainingQuickchecks;
let errorsInQuickCheck;
let successfulAttempts;

async function informError(failures) {
    await fetch(config.mattermosturl, {
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
        body: JSON.stringify({text: `@channel The Learnweb seems to have some problem.\n*${failures}* out of the last ${QUICKCHECKS_AFTER_FAILURE + 1} connection attempts failed. :thisisfine:`})
    });
}

async function checkLearnweb(){
    const now = new Date();
    while (checks.length && (now - checks[0].time) > 1000 * 60 * 60 * 24) {
        checks.shift();
    }

    const [learnwebOnline, learnwebStatus] = await isLearnwebOnline();
    const weHaveAProblem = !learnwebOnline && await isUniMuensterOnline();
    checks.push({
        "class": learnwebOnline ? 'ok' : (weHaveAProblem ? 'error' : 'warning'),
        status: learnwebStatus,
        time: new Date()
    });

    switch (status) {
        case "ok":
            if (weHaveAProblem) {
                status = 'checking';
                remainingQuickchecks = QUICKCHECKS_AFTER_FAILURE;
                errorsInQuickCheck = 1;
            }
            break;
        case "checking":
            remainingQuickchecks -= 1;
            if (weHaveAProblem) {
                errorsInQuickCheck++;
            }
            if (remainingQuickchecks === 0) {
                if (errorsInQuickCheck >= 2) {
                    status = 'degraded';
                    successfulAttempts = 0;
                    await informError(errorsInQuickCheck);
                } else {
                    status = 'ok';
                }
            }
            break;
        case "degraded":
            if (weHaveAProblem) {
                successfulAttempts = 0;
            } else {
                successfulAttempts++;
            }
            if (successfulAttempts >= SUCCESSFUL_ATTEMPTS_FOR_NORMALITY) {
                status = 'ok';
            }
    }
    setTimeout(checkLearnweb, remainingQuickchecks ? QUICK_INTERVAL : NORMAL_INTERVAL);
}

checkLearnweb().then();
