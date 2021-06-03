const axios = require('axios');
var debug = require('debug')('devops-gitlab-tms-adaptor:routes-v2-nodes');
var express = require('express');
var router = express.Router();
var utils = require('../utils');

async function getCommit(glProjects, commitHashFragment, processEnv) {

    let commitPromises = glProjects.map(glProjectId => {                // for each project ID
        const commitsUrl = `https://${processEnv.GITLAB_HOST}/api/v4/projects/${glProjectId}/repository/commits/${commitHashFragment}?stats=false`;
        debug(`axios GET ${commitsUrl}`);
        return axios.get(commitsUrl, {
            headers: { 'Authorization': `Bearer ${processEnv.GITLAB_ACCESS_API}` },
            validateStatus: function (status) { return true; } // any response is a success: https://github.com/axios/axios
        });
    });
    let responses = await Promise.all(commitPromises);
    const successResponses = responses.filter(response => response.status === 200);
    if (successResponses.length < 1) { throw new Error(`could not find commit ${commitHashFragment}`); }
    if (successResponses.length > 1) { throw new Error(`found commit ${commitHashFragment} in more than one project`); }

    return successResponses[0].data;
}

async function getDeploymentJob(commit, processEnv) {

    const committed_date = commit.committed_date;

    // Use committed_date, environment and status to get deployment, return deployment job number as action id
    const deploymentUrl = `https://${processEnv.GITLAB_HOST}/api/v4/projects/${commit.project_id}/deployments?` +
        `environment=Test&status=success&updated_after=${encodeURIComponent(committed_date)}&` +
        'order_by=created_at&sort=desc';
    debug(`axios GET ${deploymentUrl}`);
    const deploymentResponse = await axios.get(deploymentUrl, {
        headers: { 'Authorization': `Bearer ${processEnv.GITLAB_ACCESS_API}` }
    });

    const deployments = deploymentResponse.data.filter(elem => elem.sha === commit.id);
    const deployment = deployments[0];
    return deployment;
}

/* GET /v2/nodes listing. */
router.get('/', function (req, res, next) {
    res.send({
        "nodes": [
            {
                "id": 1,
                "description": "Development",
                "name": "DGT", // TODO: parametrize this
                "uploadAllowed": true,
                "notificationEnabled": false,
                "forwardMode": "MANUAL",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10001,
                        "contentType": "MTA",
                        "destinationName": "Development",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            },
            {
                "id": 2,
                "description": "Test",
                "name": "TGT", // TODO: parametrize this
                "uploadAllowed": false,
                "notificationEnabled": false,
                "forwardMode": "AUTO",
                "controlledBy": "CHARM",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10002,
                        "contentType": "MTA",
                        "destinationName": "Test",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            },
            {
                "id": 3,
                "description": "Quality",
                "name": "QGT", // TODO: parametrize this
                "uploadAllowed": false,
                "notificationEnabled": false,
                "forwardMode": "AUTO",
                "controlledBy": "CHARM",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10003,
                        "contentType": "MTA",
                        "destinationName": "Quality",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            },
            {
                "id": 4,
                "description": "Production",
                "name": "PGT", // TODO: parametrize this
                "uploadAllowed": false,
                "notificationEnabled": false,
                "forwardMode": "AUTO",
                "controlledBy": "CHARM",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10004,
                        "contentType": "MTA",
                        "destinationName": "Production",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            }
        ]
    });
});

// API https://api.sap.com/api/TMS_v2/resource
//  GET /v2/nodes/2/transportRequests?status=in%2cre
//  GET /v2/nodes/{nodeId}/transportRequests?status={in,ru,re,su,wa,er,fa,de}: `in` - Initial  * `ru` - Running  * `re` - Repeatable  * `su` - Succeeded  * `wa` - Warning  * `er` - Error  * `fa` - Fatal  * `de` - Deleted
router.get('/:nodeId(\\d+)/transportRequests', async function (req, res, next) {
    try {                                                       // https://expressjs.com/en/guide/error-handling.html
        let transportRequests = [];
        let transportRequestPosition = 1;
        let statusArray = req.query.status ? decodeURIComponent(req.query.status).split(',') : [];

        if ((req.params.nodeId === '2' || req.params.nodeId == '3') &&
            statusArray.filter(status => (status === 'in') || (status === 're')).length) {

            const glProjects = utils.getGlProjects(); // [4396]
            const trStatus = 'initial';

            let promises = glProjects.map(glProjectId => {
                const tagsUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${glProjectId}/repository/tags?search=^v`;
                debug(`axios GET ${tagsUrl}`);
                return axios.get(tagsUrl, {
                    headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
                });
            });

            let responses = await Promise.all(promises);

            transportRequests = responses.reduce((acc, response, index) => {
                const glProjectId = glProjects[index];

                // 'in'(initial) are those tags (transport requests) that are:
                //  ^vx.y.z-rc.n$
                //  with no corresponding release tag ^vx.y.z$
                const releaseTags = response.data.filter(elem => /^v\d+\.\d+\.\d+$/.test(elem.name)).reduce(
                    (acc, elem) => { acc[elem.name] = elem; }, {});
                const rcTags = response.data.filter(elem => {
                    let matches = elem.name.match(/^(v\d+\.\d+\.\d+)-rc\.\d+$/);
                    return matches.length >= 2 && !releaseTags[matches[1]]
                });

                const _transportRequests = rcTags.map((elem) => {
                    // Map commit to tr. req. id:
                    const trId = utils.commit2id(elem.commit.id);
                    const trEntryId = utils.commit2id(elem.commit.short_id);
                    const trDescription = `project: ${glProjectId}, tag: ${elem.name}, commit: ${elem.commit.id}`.
                        replace(/[^\w ._~:\/?#[\]@!$&()*+,;=%-]/g, '_'); // C.f. devops-scripts/tms-upload

                    return {
                        "id": trId,           // integer($int64) in the API definition, but we really have only 53 bits, see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
                        "status": trStatus,
                        "archived": false,
                        "position": transportRequestPosition++,
                        "createdBy": elem.commit.committer_email,
                        "createdAt": elem.commit.committed_date,    // "2021-04-14T12:24:41.000+00:00"
                        "description": trDescription,
                        "origin": "DGT",                            // Give /dev/ node
                        "entries": [
                            {
                                "id": trEntryId,
                                "storageType": "FILE",
                                "contentType": "MTA",
                                "uri": `${trEntryId}`   // "4378"
                            }
                        ]
                    };
                });

                return acc.concat(_transportRequests);
            }, []);
        }

        res.send({
            "transportRequests": transportRequests
        });
    } catch (err) {
        next(err);
    }
});

router.post('/:nodeId(\\d+)/transportRequests/import', async function (req, res, next) {
    try {                                                       // https://expressjs.com/en/guide/error-handling.html
        // API: https://api.sap.com/api/TMS_v2/resource
        // TODO: Implement bearer token policy.
        if (req.body.transportRequests.length !== 1) { throw new Error(`unsupported number of transport requests: ${req.body.transportRequests.length}`); }

        const glProjects = utils.getGlProjects(); // [4396]
        const trId = req.body.transportRequests[0];
        const commitHashFragment = trId.toString(16).padStart(13, '0');

        switch (req.params.nodeId) {
            case "2":   // CONS aka. TEST: should already have been imported
                {
                    // Find which project the transport request (= commit) belongs to:
                    //  use transport id to get committed_date from commit
                    const commit = await getCommit(glProjects, commitHashFragment, process.env);
                    const deployment = await getDeploymentJob(commit, process.env);

                    res.send({
                        "actionId": deployment.deployable.id,
                        "monitoringURL": `/v2/actions/${deployment.deployable.id}`
                    });
                    break;
                }

            case "3": // QAS
                {
                    const commit = await getCommit(glProjects, commitHashFragment, process.env);

                    const tagRefsUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${commit.project_id}/repository/` +
                        `commits/${commit.id}/refs?type=tag`;
                    debug(`axios GET ${tagRefsUrl}`);
                    const tagRefsResponse = await axios.get(tagRefsUrl, {
                        headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
                    });
                    const rcTags = tagRefsResponse.data.filter(elem => /^v(\d+\.\d+\.\d+)-rc\.\d+$/.test(elem.name));
                    if (rcTags.length !== 1) { throw new Error(`expected 1 tag, got ${rcTags.length}`); }
                    const rcTag = rcTags[0];
                    const branchName = 'quality-' + rcTag.name.match(/^v(\d+\.\d+\.\d+)-rc\.\d+$/)[1];

                    // Create new branch out of commit
                    const repoUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${commit.project_id}/repository/branches?` +
                        `branch=${encodeURIComponent(branchName)}&ref=${commit.id}`;
                    debug(`axios POST ${repoUrl}`);
                    const postResponse = await axios.post(repoUrl, "", { // Will throw if unsuccessful
                        headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
                    });

                    // Now the pipeline will be created - how long can that take?
                    let countdown = 7, foundIt = false;
                    let pipelineResponse;
                    while (countdown-- > 0) {
                        await utils.sleep(1000);

                        const pipelineUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${commit.project_id}/pipelines?` +
                            `ref=${encodeURIComponent(branchName)}&sha=${commit.id}&order_by=id&sort=desc`;
                        debug(`axios GET ${pipelineUrl}`);
                        pipelineResponse = await axios.get(pipelineUrl, {
                            headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
                        });

                        if (pipelineResponse.status === 200 && pipelineResponse.data.length >= 1) { foundIt = true; break; }
                    }
                    if (!foundIt) { throw new Error(`failed to find pipeline ref=${encodeURIComponent(branchName)}&sha=${commit.id} of project ${commit.project_id}`); }

                    // Return resulting pipeline's 'deploy to Quality' job id
                    const pipelineJobUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${commit.project_id}/pipelines/` +
                        `${pipelineResponse.data[0].id}/jobs`;
                    debug(`axios GET ${pipelineJobUrl}`);
                    const plJobResponse = await axios.get(pipelineJobUrl, {
                        headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
                    });

                    const deployToQualityJobs = plJobResponse.data.filter(elem => elem.name === 'deploy to Quality');
                    if (deployToQualityJobs.length > 1) { throw new Error(`expected 1 'deploy to Quality' job, got ${deployToQualityJobs.length}`); }
                    const deployToQualityJob = deployToQualityJobs[0];

                    res.send({
                        "actionId": deployToQualityJob.id,
                        "monitoringURL": `/v2/actions/${deployToQualityJob.id}`
                    });
                    break;
                }

            default:
                throw new Error('unimplemented');
        }
    } catch (err) {
        next(err);
    }
});

// /v2/nodes/2/transportRequests/521986514389554/logs
router.get('/:nodeId(\\d+)/transportRequests/:trId(\\d+)/logs', async function (req, res, next) {
    try {                                                       // https://expressjs.com/en/guide/error-handling.html
        const glProjects = utils.getGlProjects();

        switch (req.params.nodeId) {
            case "2":   // CONS aka. TEST: should already have been imported
                const trId = Number(req.params.trId);
                const commitHashFragment = trId.toString(16).padStart(13, '0');

                // Find job of environment=Test deployment given the commit hash fragment
                const commit = await getCommit(glProjects, commitHashFragment, processEnv);
                const deployment = await getDeploymentJob(commit, process.env);
                const tmStatus = utils.getTmStatus(deployment.deployable.status);

                res.send({
                    "logs": [
                        {
                            "actionId": deployment.deployable.id,
                            "actionType": "I",
                            "status": tmStatus,
                            "actionStartedAt": deployment.deployable.started_at,
                            "actionTriggeredBy": "d7ad0010-09a7-4916-be8d-1166c653e0c7", // TODO: take some ID from access token
                            "actionTriggeredByNamedUser": deployment.deployable.user.username,
                            "messages": [],
                            "entities": []
                        }
                    ]
                });
                // Return deployment job status as action status
                break;

            default:
                throw new Error('unimplemented');
        }
    } catch (err) {
        next(err);
    }
});

module.exports = router;
