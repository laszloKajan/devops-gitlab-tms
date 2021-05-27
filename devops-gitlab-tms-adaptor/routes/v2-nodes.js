const axios = require('axios');
var debug = require('debug')('devops-gitlab-tms-adaptor:routes-v2-nodes');
var express = require('express');
var router = express.Router();

/* GET /v2/nodes listing. */
router.get('/', function (req, res, next) {
    res.send({
        "nodes": [
            {
                "id": 1,
                "description": "Development",
                "name": "DGT",
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
                "name": "TGT",
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
                "name": "QGT",
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
                "name": "PGT",
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

    let transportRequests = [];
    let transportRequestPosition = 1;
    let statusArray = req.query.status ? decodeURIComponent(req.query.status).split(',') : [];

    if (req.params.nodeId == '2' && statusArray.filter(status => status === 'in').length) {
        const glProjects = JSON.parse(process.env.GITLAB_PROJECTS); // [4396]

        let promises = glProjects.map(glProjectId => {
            const tagsUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${glProjectId}/repository/tags?search=^v`;
            debug(`axios GET ${tagsUrl}`);
            return axios.get(tagsUrl, {
                headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
            });
        });

        let responses = await Promise.all(promises);

        transportRequests = responses.reduce((acc, response) => {
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
                //  Convert first 13 characters (52 bits) of commit to transport request id, which is 53 bits precision:
                //  parseInt("1dabe74c48a320db1d3c8a04d7fba4ec4025097f".substr(0, 13), 16)
                function commit2id(__commit) { return parseInt(__commit.substr(0, 13), 16); }
                const trId = commit2id(elem.commit.id);
                const trEntryId = commit2id(elem.commit.short_id);
                const trDescription = `project: 4396, tag: ${elem.name}, commit: ${elem.commit.id}`.
                    replace(/[^\w ._~:\/?#[\]@!$&()*+,;=%-]/g, '_'); // C.f. devops-scripts/tms-upload

                return {
                    "id": trId,           // integer($int64) in the API definition, but we really have only 53 bits, see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
                    "status": "initial",
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
});

router.post('/:nodeId(\\d+)/transportRequests/import', async function (req, res) {
    // API: https://api.sap.com/api/TMS_v2/resource
    // TODO: Implement bearer token policy.
    if (req.body.transportRequests.length !== 1) { throw new Error(`unsupported number of transport requests: ${req.body.transportRequests.length}`); }

    const glProjects = JSON.parse(process.env.GITLAB_PROJECTS); // [4396]

    switch (req.params.nodeId) {
        case "2":   // CONS aka. TEST: should already have been imported
            const trId = req.body.transportRequests[0];
            const commitHashFragment = trId.toString(16).padStart(13, '0');

            // Find which project the transport request (= commit) belongs to:
            //  use transport id to get committed_date from commit
            let commitPromises = glProjects.map(glProjectId => {                // for each project ID
                const commitsUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${glProjectId}/repository/commits/${commitHashFragment}?stats=false`;
                debug(`axios GET ${commitsUrl}`);
                return axios.get(commitsUrl, {
                    headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
                });
            });
            let responses = await Promise.all(commitPromises);
            const commitResponses = responses.filter(response => response.status === 200);
            if (commitResponses.length < 1) { throw new Error(`could not find commit ${commitHashFragment}`); }
            const committed_date = commitResponses[0].data.committed_date;

            // Use committed_date, environment and status to get deployment, return deployment job number as action id
            const deploymentUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${commitResponses[0].data.project_id}/deployments?` +
                `environment=Test&status=success&updated_after=${encodeURIComponent(committed_date)}&` +
                'order_by=created_at&sort=desc';
            debug(`axios GET ${deploymentUrl}`);
            const deploymentResponse = await axios.get(deploymentUrl, {
                headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` }
            });

            const deployments = deploymentResponse.data.filter(elem => elem.sha === commitResponses[0].data.id);
            const deployment = deployments[0];

            res.send({
                "actionId": deployment.deployable.id,
                // TODO
                "monitoringURL": `/api/v4/projects/${deployment.deployable.pipeline.project_id}/jobs/${deployment.deployable.id}`
            });
            // Return deployment job status as action status
            break;

        default:
            throw new Error('unimplemented');
    }
});

module.exports = router;
