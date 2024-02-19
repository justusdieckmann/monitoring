import fetch from 'node-fetch';
import config from './config.json' with { type: 'json' };
import puppeteer from "puppeteer";

const options = {headers: {'User-Agent': 'lw-monitoring/1.0 node-fetch'}};

const TEST_STATUS_ERROR = 0;
const TEST_STATUS_MAINTENANCE = 1;
const TEST_STATUS_WORKING = 2;

async function pageHasText(page, text) {
    const elements = await page.$$(`xpath/.//*[contains(text(), '${text}')]`);
    return elements.length > 0;
}

async function isLearnwebOnline() {
    try {
        const request = await fetch('https://www.uni-muenster.de/LearnWeb/learnweb2/', options);
        if (!request.ok) {
            return {state: TEST_STATUS_ERROR, text: `HTTP response code ${request.status}`};
        }

        const browser = await puppeteer.launch();
        const page = await browser.newPage()
        if (config.sso) {
            await page.goto('https://sso.uni-muenster.de/LearnWeb/learnweb2/');
            await page.type('#httpd_username', config.lwusername);
            await page.type('#httpd_password', config.lwpassword);
            await page.click('input[type="submit"]');
            await page.waitForNetworkIdle();
            if (await pageHasText(page, "Das Learnweb wird zur Zeit gewartet."))
                return {state: TEST_STATUS_MAINTENANCE, text: "Maintenance Mode"};
            await page.goto('https://sso.uni-muenster.de/LearnWeb/learnweb2/course/view.php?id=42106');
        } else {
            await page.goto('https://www.uni-muenster.de/LearnWeb/learnweb2/login/index.php');
            if (await pageHasText(page, "Das Learnweb wird zur Zeit gewartet."))
                return {state: TEST_STATUS_MAINTENANCE, text: "Maintenance Mode"};
            await page.type('#username', config.lwusername);
            await page.type('#password', config.lwpassword);
            await page.click('#loginbtn');
            await page.goto('https://www.uni-muenster.de/LearnWeb/learnweb2/course/view.php?id=42106');
        }
        const working = await pageHasText(page, "Lieber bot, alles funktioniert perfekt!");
        browser.close().then();

        if (working) {
            return {state: TEST_STATUS_WORKING, text: 'Success'};
        } else {
            return {state: TEST_STATUS_ERROR, text: 'Test failed!'};
        }
    } catch (e) {
        return {state: TEST_STATUS_MAINTENANCE, text: 'Error: ' + e.toString()}
    }
}

const QUICK_INTERVAL = 60 * 1000;
const NORMAL_INTERVAL = 5 * 60 * 1000;
const DEGRADED_INTERVAL = 2 * 60 * 1000;

const QUICKCHECKS_AFTER_FAILURE = 9;
const SUCCESSFUL_ATTEMPTS_FOR_NORMALITY = 10;

export let checks = [];

export let status = 'ok';
let remainingQuickchecks;
let errorsInQuickCheck;
let successfulAttempts;

async function sendMessage(message) {
    await fetch(config.mattermosturl, {
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
        body: JSON.stringify({text: message})
    });
}

async function informError(failures) {
    await sendMessage(`@channel The Learnweb seems to have some problem.\n*${failures}* out of the last ${QUICKCHECKS_AFTER_FAILURE + 1} connection attempts failed. :thisisfine:`);
}

async function informResolution() {
    await sendMessage(`The Learnweb is online again! :)`);
}

function queueNextCheck(checkStartDate) {
    const interval = remainingQuickchecks ? QUICK_INTERVAL : (status === 'degraded' ? DEGRADED_INTERVAL : NORMAL_INTERVAL);
    setTimeout(checkLearnweb, interval - (new Date() - checkStartDate));
}

async function checkLearnweb(){
    const start = new Date();
    while (checks.length && (start - checks[0].time) > 1000 * 60 * 60 * 24) {
        checks.shift();
    }

    const {state, text} = await isLearnwebOnline();
    checks.push({
        class: ['error', 'warnung', 'ok'][state],
        status: text,
        time: new Date()
    });
    if (state === TEST_STATUS_MAINTENANCE) {
        // Return early.
        queueNextCheck(start);
        return;
    }

    const weHaveAProblem = state === TEST_STATUS_ERROR;

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
                    informError(errorsInQuickCheck).then();
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
                informResolution().then();
            }
    }

    queueNextCheck(start);

}

checkLearnweb().then();
